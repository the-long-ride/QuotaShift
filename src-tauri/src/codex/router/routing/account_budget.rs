use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BudgetError {
    LimitReached(String),
}

impl std::fmt::Display for BudgetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::LimitReached(acc) => write!(f, "Concurrency limit reached for account: {acc}"),
        }
    }
}

impl std::error::Error for BudgetError {}

pub struct AccountReservation {
    account_id: String,
    counter: Arc<AtomicUsize>,
}

impl AccountReservation {
    pub fn account_id(&self) -> &str {
        &self.account_id
    }
}

impl Drop for AccountReservation {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::SeqCst);
    }
}

#[derive(Clone, Default)]
pub struct AccountBudgetRegistry {
    limits: Arc<Mutex<HashMap<String, usize>>>,
    counters: Arc<Mutex<HashMap<String, Arc<AtomicUsize>>>>,
}

impl AccountBudgetRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_concurrency_limit(&self, account_id: &str, limit: usize) {
        let mut limits = self.limits.lock().unwrap();
        limits.insert(account_id.to_string(), limit);
    }

    pub fn in_flight_count(&self, account_id: &str) -> usize {
        let counters = self.counters.lock().unwrap();
        counters
            .get(account_id)
            .map(|c| c.load(Ordering::SeqCst))
            .unwrap_or(0)
    }

    pub fn try_reserve(&self, account_id: &str) -> Result<AccountReservation, BudgetError> {
        let limit = {
            let limits = self.limits.lock().unwrap();
            limits.get(account_id).copied().unwrap_or(usize::MAX)
        };

        let counter = {
            let mut counters = self.counters.lock().unwrap();
            counters
                .entry(account_id.to_string())
                .or_insert_with(|| Arc::new(AtomicUsize::new(0)))
                .clone()
        };

        loop {
            let current = counter.load(Ordering::SeqCst);
            if current >= limit {
                return Err(BudgetError::LimitReached(account_id.to_string()));
            }
            if counter
                .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                break;
            }
        }

        Ok(AccountReservation {
            account_id: account_id.to_string(),
            counter,
        })
    }
}

pub fn parse_retry_after(header: Option<&str>, default_duration: Duration) -> Duration {
    let Some(raw) = header.map(str::trim).filter(|s| !s.is_empty()) else {
        return default_duration;
    };

    if let Ok(secs) = raw.parse::<u64>() {
        return Duration::from_secs(secs);
    }

    if let Ok(datetime) = chrono::DateTime::parse_from_rfc2822(raw) {
        let now = chrono::Utc::now();
        let diff = datetime.signed_duration_since(now);
        if let Ok(duration) = diff.to_std() {
            return duration;
        }
    }

    default_duration
}
