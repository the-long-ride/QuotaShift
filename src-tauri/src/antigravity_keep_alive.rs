use std::future::Future;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex as AsyncMutex, Notify};

use crate::types::AntigravityRefreshedTokens;

pub const TOKEN_UPDATE_EVENT: &str = "antigravity-keep-alive-tokens";
const DEFAULT_INTERVAL_MINS: u64 = 240;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityKeepAliveAccount {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub auth_method: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityKeepAliveTokenUpdate {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub auth_method: Option<String>,
}

struct RegistryState {
    interval_mins: u64,
    running: bool,
    accounts: Vec<AntigravityKeepAliveAccount>,
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

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_account(mut account: AntigravityKeepAliveAccount) -> Option<AntigravityKeepAliveAccount> {
    account.account_id = account.account_id.trim().to_string();
    account.access_token = account.access_token.trim().to_string();
    account.refresh_token = normalize_optional(account.refresh_token);
    account.auth_method = normalize_optional(account.auth_method);

    if account.account_id.is_empty()
        || (account.access_token.is_empty() && account.refresh_token.is_none())
    {
        return None;
    }
    Some(account)
}

fn normalized_accounts(accounts: Vec<AntigravityKeepAliveAccount>) -> Vec<AntigravityKeepAliveAccount> {
    let mut normalized: Vec<AntigravityKeepAliveAccount> = Vec::new();

    for account in accounts.into_iter().filter_map(normalize_account) {
        if let Some(index) = normalized
            .iter()
            .position(|existing| existing.account_id == account.account_id)
        {
            normalized[index] = account;
        } else {
            normalized.push(account);
        }
    }

    normalized
}

fn reconcile_accounts(
    previous: &[AntigravityKeepAliveAccount],
    incoming: Vec<AntigravityKeepAliveAccount>,
) -> (Vec<AntigravityKeepAliveAccount>, Vec<AntigravityKeepAliveAccount>) {
    let next = normalized_accounts(incoming);
    let changed = next
        .iter()
        .filter(|account| {
            previous
                .iter()
                .find(|existing| existing.account_id == account.account_id)
                != Some(*account)
        })
        .cloned()
        .collect();
    (next, changed)
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

/// Replace the monitored-account registry and return only new or changed accounts.
/// Removed accounts disappear immediately and are no longer maintained.
pub fn sync_antigravity_accounts(
    accounts: Vec<AntigravityKeepAliveAccount>,
) -> Vec<AntigravityKeepAliveAccount> {
    let mut state = state().lock().unwrap();
    let (next, changed) = reconcile_accounts(&state.accounts, accounts);
    state.accounts = next;
    changed
}

fn merge_refreshed_tokens(
    account: &mut AntigravityKeepAliveAccount,
    refreshed: AntigravityRefreshedTokens,
) -> Option<AntigravityKeepAliveTokenUpdate> {
    let access_token = refreshed.access_token.trim().to_string();
    if access_token.is_empty() {
        return None;
    }

    account.access_token = access_token.clone();
    let refresh_token = normalize_optional(refreshed.refresh_token);
    if let Some(value) = refresh_token.clone() {
        account.refresh_token = Some(value);
    }
    let auth_method = normalize_optional(refreshed.auth_method);
    if let Some(value) = auth_method.clone() {
        account.auth_method = Some(value);
    }

    Some(AntigravityKeepAliveTokenUpdate {
        account_id: account.account_id.clone(),
        access_token,
        refresh_token,
        auth_method,
    })
}

fn apply_refreshed_tokens(
    account_id: &str,
    refreshed: AntigravityRefreshedTokens,
) -> Option<AntigravityKeepAliveTokenUpdate> {
    let mut state = state().lock().unwrap();
    let account = state
        .accounts
        .iter_mut()
        .find(|account| account.account_id == account_id)?;
    merge_refreshed_tokens(account, refreshed)
}

async fn maintain_one(
    app_handle: &AppHandle,
    account: AntigravityKeepAliveAccount,
) -> Result<String, String> {
    let usage = crate::antigravity_usage::fetch_antigravity_account_usage(
        account.access_token,
        account.refresh_token,
        account.auth_method,
    )
    .await
    .map_err(|error| error.message)?;

    if let Some(refreshed) = usage.refreshed_tokens {
        if let Some(update) = apply_refreshed_tokens(&account.account_id, refreshed) {
            let _ = app_handle.emit(TOKEN_UPDATE_EVENT, update);
        }
    }

    Ok(format!(
        "quota check OK (plan: {})",
        usage.plan_tier.unwrap_or_else(|| "?".to_string())
    ))
}

async fn run_each_account<F, Fut>(
    accounts: Vec<AntigravityKeepAliveAccount>,
    mut maintain: F,
) -> Vec<(String, Result<String, String>)>
where
    F: FnMut(AntigravityKeepAliveAccount) -> Fut,
    Fut: Future<Output = Result<String, String>>,
{
    let mut results = Vec::with_capacity(accounts.len());
    for account in accounts {
        let account_id = account.account_id.clone();
        results.push((account_id, maintain(account).await));
    }
    results
}

pub async fn maintain_accounts(
    app_handle: &AppHandle,
    accounts: Vec<AntigravityKeepAliveAccount>,
) -> Vec<(String, Result<String, String>)> {
    let _guard = maintenance_lock().lock().await;
    run_each_account(accounts, |account| maintain_one(app_handle, account)).await
}

pub async fn maintain_registered_antigravity_accounts(app_handle: &AppHandle) -> String {
    let accounts = state().lock().unwrap().accounts.clone();
    if accounts.is_empty() {
        return "No monitored Antigravity accounts configured".to_string();
    }

    let results = maintain_accounts(app_handle, accounts).await;
    let succeeded = results.iter().filter(|(_, result)| result.is_ok()).count();
    let failures: Vec<String> = results
        .iter()
        .filter_map(|(account_id, result)| {
            result
                .as_ref()
                .err()
                .map(|error| format!("{}: {}", account_id, error))
        })
        .collect();

    if failures.is_empty() {
        format!("{} monitored Antigravity account(s) OK", succeeded)
    } else {
        format!(
            "{} monitored Antigravity account(s) OK; {} failed ({})",
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
        "lastPing": state.last_ping.map(|timestamp| {
            chrono::DateTime::from_timestamp(timestamp, 0)
                .map(|date_time| date_time.to_rfc3339())
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

        let result = maintain_registered_antigravity_accounts(&app_handle).await;
        let mut state = state().lock().unwrap();
        state.last_ping = Some(chrono::Utc::now().timestamp());
        state.last_result = Some(result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as TestMutex};

    fn account(id: &str, access_token: &str) -> AntigravityKeepAliveAccount {
        AntigravityKeepAliveAccount {
            account_id: id.to_string(),
            access_token: access_token.to_string(),
            refresh_token: Some(format!("refresh-{id}")),
            auth_method: Some("oauth".to_string()),
        }
    }

    #[test]
    fn normalized_registry_deduplicates_and_drops_empty_credentials() {
        let normalized = normalized_accounts(vec![
            account("a", "token-1"),
            account("a", "token-2"),
            AntigravityKeepAliveAccount {
                account_id: "empty".to_string(),
                access_token: "".to_string(),
                refresh_token: None,
                auth_method: None,
            },
        ]);

        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].account_id, "a");
        assert_eq!(normalized[0].access_token, "token-2");
    }

    #[test]
    fn reconciliation_removes_deleted_accounts_and_only_marks_changes() {
        let previous = vec![account("removed", "old"), account("kept", "same")];
        let incoming = vec![account("kept", "same"), account("added", "new")];
        let (next, changed) = reconcile_accounts(&previous, incoming);

        assert_eq!(next.iter().map(|account| account.account_id.as_str()).collect::<Vec<_>>(), vec!["kept", "added"]);
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].account_id, "added");
    }

    #[test]
    fn refreshed_credentials_update_access_and_preserve_unrotated_refresh_token() {
        let mut account = account("a", "old-access");
        let update = merge_refreshed_tokens(
            &mut account,
            AntigravityRefreshedTokens {
                access_token: "new-access".to_string(),
                refresh_token: None,
                expires_in: Some(3600),
                auth_method: None,
            },
        )
        .expect("refresh update");

        assert_eq!(account.access_token, "new-access");
        assert_eq!(account.refresh_token.as_deref(), Some("refresh-a"));
        assert_eq!(update.access_token, "new-access");
        assert_eq!(update.refresh_token, None);
    }

    #[test]
    fn refreshed_credentials_propagate_rotated_refresh_token_and_auth_method() {
        let mut account = account("a", "old-access");
        let update = merge_refreshed_tokens(
            &mut account,
            AntigravityRefreshedTokens {
                access_token: "new-access".to_string(),
                refresh_token: Some("new-refresh".to_string()),
                expires_in: Some(3600),
                auth_method: Some("google".to_string()),
            },
        )
        .expect("refresh update");

        assert_eq!(account.refresh_token.as_deref(), Some("new-refresh"));
        assert_eq!(account.auth_method.as_deref(), Some("google"));
        assert_eq!(update.refresh_token.as_deref(), Some("new-refresh"));
        assert_eq!(update.auth_method.as_deref(), Some("google"));
    }

    #[tokio::test]
    async fn failed_account_does_not_skip_following_accounts() {
        let seen = Arc::new(TestMutex::new(Vec::new()));
        let seen_for_run = Arc::clone(&seen);
        let results = run_each_account(vec![account("bad", "x"), account("good", "y")], move |account| {
            let seen = Arc::clone(&seen_for_run);
            async move {
                seen.lock().unwrap().push(account.account_id.clone());
                if account.account_id == "bad" {
                    Err("expired".to_string())
                } else {
                    Ok("ok".to_string())
                }
            }
        })
        .await;

        assert_eq!(&*seen.lock().unwrap(), &["bad".to_string(), "good".to_string()]);
        assert!(results[0].1.is_err());
        assert!(results[1].1.is_ok());
    }
}
