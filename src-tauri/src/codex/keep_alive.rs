use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::AppHandle;
use tokio::sync::{Mutex as AsyncMutex, Notify};

pub const CODEX_TOKEN_UPDATE_EVENT: &str = "codex-keep-alive-tokens";
const DEFAULT_INTERVAL_MINS: u64 = 240;

pub mod maintainer;
pub use maintainer::*;
pub mod registry;
pub use registry::*;

struct RegistryState {
    interval_mins: u64,
    running: bool,
    accounts: Vec<CodexKeepAliveAccount>,
    last_ping: Option<i64>,
    last_result: Option<String>,
}

static STATE: OnceLock<Mutex<RegistryState>> = OnceLock::new();
static NOTIFY: OnceLock<Notify> = OnceLock::new();
static MAINTENANCE_LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();

fn state() -> &'static Mutex<RegistryState> {
    STATE.get_or_init(|| {
        Mutex::new(RegistryState {
            interval_mins: DEFAULT_INTERVAL_MINS,
            running: false,
            accounts: Vec::new(),
            last_ping: None,
            last_result: None,
        })
    })
}

fn notify() -> &'static Notify {
    NOTIFY.get_or_init(Notify::new)
}

fn maintenance_lock() -> &'static AsyncMutex<()> {
    MAINTENANCE_LOCK.get_or_init(|| AsyncMutex::new(()))
}

pub fn set_interval(mins: u64) {
    let mut state = state().lock().unwrap();
    state.interval_mins = mins.max(1);
}

pub fn start() {
    let mut state = state().lock().unwrap();
    if !state.running {
        state.running = true;
        drop(state);
        notify().notify_one();
    }
}

pub fn stop() {
    let mut state = state().lock().unwrap();
    state.running = false;
}

pub fn is_running() -> bool {
    state().lock().unwrap().running
}

pub fn registered_count() -> usize {
    state().lock().unwrap().accounts.len()
}

pub fn sync_codex_accounts(accounts: Vec<CodexKeepAliveAccount>) -> Vec<CodexKeepAliveAccount> {
    let mut state = state().lock().unwrap();
    let (next, changed) = reconcile_accounts(&state.accounts, accounts);
    state.accounts = next;
    changed
}

pub fn apply_refreshed_tokens(
    account_id: &str,
    new_api_key: String,
) -> Option<CodexKeepAliveTokenUpdate> {
    let mut state = state().lock().unwrap();
    let account = state
        .accounts
        .iter_mut()
        .find(|account| account.account_id == account_id)?;
    account.api_key = new_api_key.clone();
    Some(CodexKeepAliveTokenUpdate {
        account_id: account_id.to_string(),
        api_key: new_api_key,
    })
}
pub async fn maintain_accounts(
    app_handle: &AppHandle,
    accounts: Vec<CodexKeepAliveAccount>,
) -> Vec<(String, Result<String, String>)> {
    let _guard = maintenance_lock().lock().await;
    run_each_account(accounts, |account| maintain_one(app_handle, account)).await
}

pub async fn maintain_registered_codex_accounts(app_handle: &AppHandle) -> String {
    let accounts = state().lock().unwrap().accounts.clone();
    if accounts.is_empty() {
        return "No monitored Codex accounts configured".to_string();
    }

    let results = maintain_accounts(app_handle, accounts).await;
    let succeeded = results.iter().filter(|(_, result)| result.is_ok()).count();
    let failures: Vec<String> = results
        .iter()
        .filter_map(|(account_id, result)| {
            result
                .as_ref()
                .err()
                .map(|e| format!("{}: {}", account_id, e))
        })
        .collect();

    if failures.is_empty() {
        format!("{} monitored Codex account(s) OK", succeeded)
    } else {
        format!(
            "{} monitored Codex account(s) OK; {} failed ({})",
            succeeded,
            failures.len(),
            failures.join("; ")
        )
    }
}

pub fn get_status() -> serde_json::Value {
    let state = state().lock().unwrap();
    serde_json::json!({
        "running": state.running,
        "intervalMins": state.interval_mins,
        "accountCount": state.accounts.len(),
        "lastPing": state.last_ping.map(|t| {
            chrono::DateTime::from_timestamp(t, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        }),
        "lastResult": state.last_result,
    })
}

pub async fn run_background(app_handle: AppHandle) {
    loop {
        let (running, interval_mins) = {
            let state = state().lock().unwrap();
            (state.running, state.interval_mins)
        };

        if !running {
            notify().notified().await;
            continue;
        }

        tokio::time::sleep(Duration::from_secs(interval_mins.saturating_mul(60))).await;
        if !is_running() {
            continue;
        }

        let result = maintain_registered_codex_accounts(&app_handle).await;
        let mut state = state().lock().unwrap();
        state.last_ping = Some(chrono::Utc::now().timestamp());
        state.last_result = Some(result);
    }
}

#[cfg(test)]
mod tests;
