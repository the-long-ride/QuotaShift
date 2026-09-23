//! Remaining Claude usage-limit resets for the overlay-tracked account.
//!
//! Source is the undocumented `/api/oauth/usage?cedar_ember=1` endpoint. Access is read-only,
//! off by default in the UI, cached per account, and never refreshes or logs OAuth tokens.

mod client;
mod parse;

use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use super::metadata::read_oauth_credentials;
use super::normalize_config_dir_key;

pub use parse::ClaudeResetCredits;

fn cache() -> &'static Mutex<HashMap<String, ClaudeResetCredits>> {
    static CACHE: OnceLock<Mutex<HashMap<String, ClaudeResetCredits>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// Returns the cached result while it is fresh; otherwise performs at most one request.
/// Every outcome, including failures, is cached so errors back off for the full TTL.
pub async fn reset_credits_for_config(config_dir: PathBuf, force: bool) -> ClaudeResetCredits {
    let key = normalize_config_dir_key(&config_dir);
    let now = Utc::now();
    let cached = cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&key)
        .cloned();
    if let Some(cached) =
        cached.filter(|entry| parse::should_reuse(entry.fetched_at, now.timestamp(), force))
    {
        return cached;
    }

    let result = fetch_fresh(config_dir, now).await;
    crate::log_eprintln!(
        "[claude_resets] profile={} status={} count={:?} reason={:?}",
        key,
        result.status,
        result.count,
        result.reason
    );
    cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(key, result.clone());
    result
}

async fn fetch_fresh(config_dir: PathBuf, now: DateTime<Utc>) -> ClaudeResetCredits {
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let credentials = read_oauth_credentials(&config_dir).ok_or("no_credentials")?;
        let access = client::access_token_from_credentials(&credentials, now.timestamp_millis())?;
        let version = client::installed_cli_version().ok_or("cli_version_unknown")?;
        Ok::<_, &'static str>((access, version))
    })
    .await;
    let (access, version) = match prepared {
        Ok(Ok(prepared)) => prepared,
        Ok(Err(reason)) => return ClaudeResetCredits::unavailable(reason, now),
        Err(_) => return ClaudeResetCredits::unavailable("internal_error", now),
    };
    match client::fetch_usage_with_resets(&access, &version).await {
        Ok(response) => parse::parse_reset_credits(&response, now),
        Err(reason) => ClaudeResetCredits::unavailable(&reason, now),
    }
}

#[cfg(test)]
mod tests;
