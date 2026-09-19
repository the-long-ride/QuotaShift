//! Claude Code subscription-account discovery keyed by CLAUDE_CONFIG_DIR.

mod discovery;
mod metadata;
mod types;

pub use discovery::{candidate_dirs, candidate_dirs_at};
pub use metadata::{normalize_config_dir_key, scan_claude_accounts_at};
pub use types::{ClaudeAccount, ClaudeAccountUsageStatus};

use std::collections::HashSet;
use std::path::PathBuf;

use super::monitor::ClaudeUsageScheduler;
use super::process::process_profile_states_for_configs;

pub(super) fn account_home_dir() -> Result<PathBuf, String> {
    crate::session::get_home_dir()
        .ok_or_else(|| "Could not locate the user home directory".to_string())
}

pub(super) fn candidate_dirs_with_extra(
    extra_config_dirs: Option<Vec<String>>,
) -> Result<Vec<PathBuf>, String> {
    let mut dirs = candidate_dirs()?;
    for raw in extra_config_dirs.unwrap_or_default() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = PathBuf::from(trimmed);
        let key = normalize_config_dir_key(&path);
        if !dirs
            .iter()
            .any(|candidate| normalize_config_dir_key(candidate) == key)
        {
            dirs.push(path);
        }
    }
    Ok(dirs)
}

pub fn scan_claude_accounts() -> Result<Vec<ClaudeAccount>, String> {
    let home = account_home_dir()?;
    Ok(scan_claude_accounts_at(&home, candidate_dirs()?))
}

fn profile_refresh_interval_secs(
    account_id: &str,
    profile_key: &str,
    suspended: bool,
    monitored_account_id: Option<&str>,
    refresh_account_id: Option<&str>,
    active_profile_keys: &HashSet<String>,
    fast_interval_secs: u64,
    idle_interval_secs: u64,
    legacy_refresh_all: bool,
) -> Option<u64> {
    if let Some(target_account_id) = refresh_account_id {
        if suspended || target_account_id != account_id {
            return None;
        }
        return Some(fast_interval_secs);
    }
    if legacy_refresh_all {
        return Some(fast_interval_secs);
    }
    let fast_eligible = !suspended
        && (monitored_account_id == Some(account_id) || active_profile_keys.contains(profile_key));
    Some(if fast_eligible {
        fast_interval_secs
    } else {
        idle_interval_secs
    })
}

#[tauri::command]
pub fn get_claude_account_statuses(
    scheduler: tauri::State<'_, ClaudeUsageScheduler>,
    force: bool,
    max_age_secs: Option<u64>,
    idle_poll_interval_secs: Option<u64>,
    extra_config_dirs: Option<Vec<String>>,
    guardrails_active: Option<bool>,
    monitored_account_id: Option<String>,
    refresh_account_id: Option<String>,
) -> Result<Vec<ClaudeAccountUsageStatus>, String> {
    let home = account_home_dir()?;
    let accounts = scan_claude_accounts_at(&home, candidate_dirs_with_extra(extra_config_dirs)?);
    let config_dirs = accounts
        .iter()
        .map(|account| PathBuf::from(&account.config_dir))
        .collect::<Vec<_>>();
    let (suspended_counts, active_profile_keys) = process_profile_states_for_configs(&config_dirs);
    let max_age_secs = max_age_secs.unwrap_or(60).clamp(1, 1200);
    let idle_poll_interval_secs = idle_poll_interval_secs
        .unwrap_or(max_age_secs)
        .clamp(1, 1200);
    let legacy_refresh_all = guardrails_active.is_none()
        && monitored_account_id.is_none()
        && refresh_account_id.is_none();

    let mut fast_profiles = Vec::new();
    let mut idle_profiles = Vec::new();
    let mut freshness_by_id = std::collections::HashMap::new();

    for account in &accounts {
        let config_dir = PathBuf::from(&account.config_dir);
        let profile_key = normalize_config_dir_key(&config_dir);
        let suspended = suspended_counts.contains_key(&profile_key);
        if let Some(interval_secs) = profile_refresh_interval_secs(
            &account.id,
            &profile_key,
            suspended,
            monitored_account_id.as_deref(),
            refresh_account_id.as_deref(),
            &active_profile_keys,
            max_age_secs,
            idle_poll_interval_secs,
            legacy_refresh_all,
        ) {
            freshness_by_id.insert(account.id.clone(), interval_secs);
            if interval_secs == max_age_secs {
                fast_profiles.push(config_dir);
            } else {
                idle_profiles.push(config_dir);
            }
        } else {
            freshness_by_id.insert(account.id.clone(), idle_poll_interval_secs);
        }
    }

    scheduler.request_profiles(&fast_profiles, max_age_secs, force);
    scheduler.request_profiles(
        &idle_profiles,
        idle_poll_interval_secs,
        force && refresh_account_id.is_none(),
    );

    Ok(accounts
        .into_iter()
        .map(|account| {
            let config_dir = PathBuf::from(&account.config_dir);
            let freshness_secs = freshness_by_id
                .get(&account.id)
                .copied()
                .unwrap_or(idle_poll_interval_secs);
            let (usage, usage_fresh) = scheduler.snapshot_for(&config_dir, freshness_secs);
            let key = normalize_config_dir_key(&config_dir);
            let suspended_process_count = suspended_counts.get(&key).copied().unwrap_or(0);
            ClaudeAccountUsageStatus {
                account,
                five_hour: usage.five_hour,
                seven_day: usage.seven_day,
                usage_fresh,
                usage_fetched_at: usage.fetched_at,
                active: active_profile_keys.contains(&key),
                suspended: suspended_process_count > 0,
                suspended_process_count,
                error: usage.error,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests;
