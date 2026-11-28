//! Remaining Claude usage-limit resets for the overlay-tracked account.
//!
//! Source is the undocumented `/api/oauth/usage?cedar_ember=1` endpoint. Access is read-only,
//! off by default in the UI, cached per account on disk (token-free), and never refreshes or logs
//! OAuth tokens.

mod cache;
mod client;
mod desktop;
mod parse;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use super::metadata::read_oauth_credentials;
use super::normalize_config_dir_key;
use crate::claude::monitor::ClaudeRateLimitWindow;
use crate::system::retry_after::{load_json_cache, quotashift_cache_path, save_json_cache};

#[cfg(test)]
pub(crate) use crate::system::retry_after::PROVIDER_CIRCUIT_BREAKER_SECS;
pub(crate) use cache::{build_cached_outcome, record_remote_outcome, ClaudeResetDiskCache};
pub use parse::{ClaudeResetCredits, ClaudeResetCreditsOutcome};

const CLAUDE_RESET_CACHE_FILE: &str = "claude-reset-cache.json";
pub(crate) const CACHE_TTL_SECS: i64 = parse::CACHE_TTL_SECS;
pub(crate) const FAILURE_CACHE_TTL_SECS: i64 = 90;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CachedResetCredits {
    pub(crate) credits: ClaudeResetCredits,
    pub(crate) credentials_mtime: Option<u64>,
    #[serde(default)]
    pub(crate) last_valid: Option<ClaudeResetCredits>,
    #[serde(default)]
    pub(crate) retry_after_at: Option<i64>,
    #[serde(default)]
    pub(crate) consecutive_429s: u32,
    #[serde(default)]
    pub(crate) five_hour: Option<ClaudeRateLimitWindow>,
    #[serde(default)]
    pub(crate) seven_day: Option<ClaudeRateLimitWindow>,
}

fn cache() -> &'static Mutex<Option<ClaudeResetDiskCache>> {
    static CACHE: OnceLock<Mutex<Option<ClaudeResetDiskCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
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
    if !credits.stale
        && (credits.status == "available"
            || credits.status == "none"
            || credits.reason.as_deref() == Some("surface"))
    {
        CACHE_TTL_SECS
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
    if entry.retry_after_at.is_some_and(|until| now < until) {
        return true;
    }
    if entry.credentials_mtime != current_credentials_mtime
        && entry.credits.reason.as_deref() == Some("token_expired")
    {
        return false;
    }
    if let Some(dt) = DateTime::from_timestamp(now, 0) {
        if !entry.credits.stale && parse::has_expired_grant(&entry.credits, dt) {
            return false;
        }
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

fn account_email_for_config(config_dir: &Path) -> Option<String> {
    let home = super::account_home_dir().ok()?;
    super::scan_claude_accounts_at(&home, vec![config_dir.to_path_buf()])
        .into_iter()
        .next()
        .and_then(|account| account.email)
}

async fn read_desktop_fallback(config_dir: PathBuf, now_ts: i64) -> Option<ClaudeResetCredits> {
    tauri::async_runtime::spawn_blocking(move || {
        let email = account_email_for_config(&config_dir)?;
        desktop::read_verified_desktop_resets(&email, now_ts)
    })
    .await
    .ok()
    .flatten()
}

async fn fetch_fresh_remote(
    config_dir: PathBuf,
    now: DateTime<Utc>,
) -> Result<ClaudeResetCreditsOutcome, client::FetchResetsError> {
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let credentials = read_oauth_credentials(&config_dir).ok_or("no_credentials")?;
        let access = client::access_token_from_credentials(&credentials, now.timestamp_millis())?;
        let version = client::installed_cli_version().ok_or("cli_version_unknown")?;
        Ok::<_, &'static str>((access, version))
    })
    .await;
    let (access, version) = match prepared {
        Ok(Ok(prepared)) => prepared,
        Ok(Err(reason)) => {
            return Err(client::FetchResetsError {
                reason: reason.to_string(),
                status: None,
                retry_after: None,
            });
        }
        Err(_) => {
            return Err(client::FetchResetsError {
                reason: "internal_error".to_string(),
                status: None,
                retry_after: None,
            });
        }
    };
    let response = client::fetch_usage_with_resets(&access, &version).await?;
    Ok(parse::parse_reset_credits_outcome(&response, now))
}

/// Returns cached reset credits + piggybacked 5h/7d windows when fresh or in backoff;
/// otherwise performs at most one read-only request and persists the updated cache.
pub async fn reset_credits_outcome_for_config(
    config_dir: PathBuf,
    force: bool,
) -> ClaudeResetCreditsOutcome {
    let key = normalize_config_dir_key(&config_dir);
    let now = Utc::now();
    let now_ts = now.timestamp();
    let current_mtime = credentials_mtime(&config_dir);
    let disk_path = quotashift_cache_path(CLAUDE_RESET_CACHE_FILE);

    let (reusable, circuit_until) = {
        let mut guard = cache().lock().unwrap_or_else(|p| p.into_inner());
        let store = guard.get_or_insert_with(|| {
            disk_path
                .as_deref()
                .map(load_json_cache)
                .unwrap_or_default()
        });
        let circuit_until = store.provider_circuit_until.filter(|&u| u > now_ts);
        let entry = store.entries.get(&key).cloned();
        let reuse = match entry {
            Some(ref e)
                if should_reuse_entry(e, current_mtime, now_ts, force)
                    || circuit_until.is_some() =>
            {
                Some(e.clone())
            }
            None if circuit_until.is_some() => Some(CachedResetCredits {
                credits: ClaudeResetCredits::unavailable("circuit_breaker", now),
                credentials_mtime: current_mtime,
                last_valid: None,
                retry_after_at: circuit_until,
                consecutive_429s: 0,
                five_hour: None,
                seven_day: None,
            }),
            _ => None,
        };
        (reuse, circuit_until)
    };

    if let Some(entry) = reusable {
        let in_backoff =
            entry.retry_after_at.is_some_and(|u| u > now_ts) || circuit_until.is_some();
        let desktop_fallback = if in_backoff {
            read_desktop_fallback(config_dir, now_ts).await
        } else {
            None
        };
        return build_cached_outcome(&entry, circuit_until, now, desktop_fallback);
    }

    let remote = fetch_fresh_remote(config_dir.clone(), now).await;
    let needs_desktop = match &remote {
        Ok(outcome) => {
            let result = &outcome.credits;
            result.status == "ineligible" || result.status == "unavailable"
        }
        Err(_) => true,
    };
    let desktop_fallback = if needs_desktop {
        read_desktop_fallback(config_dir, now_ts).await
    } else {
        None
    };

    let mut guard = cache().lock().unwrap_or_else(|p| p.into_inner());
    let store = guard.get_or_insert_with(ClaudeResetDiskCache::default);
    let outcome = record_remote_outcome(store, &key, current_mtime, now, remote, desktop_fallback);
    if let Some(path) = disk_path.as_deref() {
        save_json_cache(path, store);
    }
    crate::log_eprintln!(
        "[claude_resets] profile={} status={} count={:?} stale={} reason={:?}",
        key,
        outcome.credits.status,
        outcome.credits.count,
        outcome.credits.stale,
        outcome.credits.reason
    );
    outcome
}

#[cfg(test)]
mod backoff_tests;
#[cfg(test)]
mod tests;
