//! Remaining Claude usage-limit resets for the overlay-tracked account.
//!
//! Source is the undocumented `/api/oauth/usage?cedar_ember=1` endpoint. Access is read-only,
//! off by default in the UI, cached per account, and never refreshes or logs OAuth tokens.

mod client;
mod desktop;
mod parse;

use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use super::metadata::read_oauth_credentials;
use super::normalize_config_dir_key;

pub use parse::ClaudeResetCredits;

pub(crate) const CACHE_TTL_SECS: i64 = parse::CACHE_TTL_SECS;
pub(crate) const FAILURE_CACHE_TTL_SECS: i64 = 90;

#[derive(Clone)]
pub(crate) struct CachedResetCredits {
    pub(crate) credits: ClaudeResetCredits,
    pub(crate) credentials_mtime: Option<u64>,
}

fn cache() -> &'static Mutex<HashMap<String, CachedResetCredits>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedResetCredits>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

pub(crate) fn credentials_mtime(config_dir: &Path) -> Option<u64> {
    let modified = std::fs::metadata(config_dir.join(".credentials.json"))
        .ok()?
        .modified()
        .ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(duration.as_millis()).ok()
}

pub(crate) fn cache_ttl_secs(credits: &ClaudeResetCredits) -> i64 {
    if credits.status == "available"
        || credits.status == "none"
        || credits.reason.as_deref() == Some("surface")
    {
        CACHE_TTL_SECS
    } else if matches!(
        credits.reason.as_deref(),
        Some("token_expired" | "cli_version_unknown" | "network_error")
    ) || credits
        .reason
        .as_deref()
        .is_some_and(|reason| reason.starts_with("http_"))
    {
        FAILURE_CACHE_TTL_SECS
    } else {
        FAILURE_CACHE_TTL_SECS
    }
}

pub(crate) fn should_reuse_entry(
    entry: &CachedResetCredits,
    current_credentials_mtime: Option<u64>,
    now: i64,
    force: bool,
) -> bool {
    if entry.credentials_mtime != current_credentials_mtime {
        return false;
    }
    let ttl = cache_ttl_secs(&entry.credits);
    if ttl == CACHE_TTL_SECS {
        return parse::should_reuse(entry.credits.fetched_at, now, force);
    }
    let age = now - entry.credits.fetched_at;
    if age < 0 {
        return false;
    }
    if force {
        age < parse::FORCE_COOLDOWN_SECS.min(ttl)
    } else {
        age < ttl
    }
}

/// Returns the cached result while it is fresh; otherwise performs at most one request.
/// Definitive results back off for 30 minutes; transient failures back off for 90 seconds
/// and invalidate immediately if `.credentials.json` mtime changes.
pub async fn reset_credits_for_config(config_dir: PathBuf, force: bool) -> ClaudeResetCredits {
    let key = normalize_config_dir_key(&config_dir);
    let now = Utc::now();
    let current_mtime = credentials_mtime(&config_dir);
    let cached = cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&key)
        .cloned();
    if let Some(cached) =
        cached.filter(|entry| should_reuse_entry(entry, current_mtime, now.timestamp(), force))
    {
        return cached.credits;
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
        .insert(
            key,
            CachedResetCredits {
                credits: result.clone(),
                credentials_mtime: current_mtime,
            },
        );
    result
}

fn account_email_for_config(config_dir: &Path) -> Option<String> {
    let home = super::account_home_dir().ok()?;
    super::scan_claude_accounts_at(&home, vec![config_dir.to_path_buf()])
        .into_iter()
        .next()
        .and_then(|account| account.email)
}

async fn fetch_fresh_remote(config_dir: PathBuf, now: DateTime<Utc>) -> ClaudeResetCredits {
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

async fn fetch_fresh(config_dir: PathBuf, now: DateTime<Utc>) -> ClaudeResetCredits {
    let result = fetch_fresh_remote(config_dir.clone(), now).await;
    if result.status == "ineligible" || result.status == "unavailable" {
        let fallback = tauri::async_runtime::spawn_blocking(move || {
            let email = account_email_for_config(&config_dir)?;
            desktop::read_verified_desktop_resets(&email, now.timestamp())
        })
        .await
        .ok()
        .flatten();
        if let Some(credits) = fallback {
            return credits;
        }
    }
    result
}

#[cfg(test)]
mod tests;
