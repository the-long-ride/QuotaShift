//! Claude Code process classification plus account-scoped suspend/resume protection.

mod auto_resume;
mod classify;
mod current;
mod journal;
mod native;

pub use auto_resume::run_claude_auto_resume_worker;
pub use classify::{
    is_claude_agent_process, is_claude_cli_process, is_claude_desktop_process,
    is_claude_usage_probe, is_target_claude_process,
};
pub use current::*;
pub use journal::restore_claude_suspension_journal;

use classify::{process_category, process_command, resolve_process_profiles};
use journal::{
    persist_suspensions, should_keep_suspended_process, suspended_map, with_resume_persistence,
    with_suspension_persistence, SuspendedAccountRecord, SuspendedProcessRef,
};
use native::{is_process_still_suspended, set_process_suspended};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use sysinfo::{Pid, System};

use super::accounts::{candidate_dirs, normalize_config_dir_key};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeProcessSuspendResult {
    pub cli_suspended: usize,
    pub desktop_suspended: usize,
    pub agent_suspended: usize,
    pub ide_backend_suspended: usize,
    pub total_suspended: usize,
    pub already_suspended: usize,
    pub persistence_error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeProcessResumeResult {
    pub total_resumed: usize,
    pub stale_removed: usize,
    pub persistence_error: Option<String>,
}

fn live_suspended_for_key(key: &str, system: &System) -> Vec<SuspendedProcessRef> {
    suspended_map()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(key)
        .map(|record| record.processes.clone())
        .unwrap_or_default()
        .into_iter()
        .filter(|item| {
            let identity_matches = system
                .process(Pid::from_u32(item.pid))
                .is_some_and(|process| item.matches(item.pid, process.start_time()));
            should_keep_suspended_process(identity_matches, is_process_still_suspended(item.pid))
        })
        .collect()
}

fn suspended_process_counts_with_system(
    config_dirs: &[PathBuf],
    system: &System,
) -> HashMap<String, usize> {
    let tracked = {
        let map = suspended_map()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if map.is_empty() {
            return HashMap::new();
        }
        map.clone()
    };

    let requested = config_dirs
        .iter()
        .map(|path| normalize_config_dir_key(path))
        .collect::<HashSet<_>>();
    let mut counts = HashMap::new();
    let mut cleaned = tracked;

    cleaned.retain(|key, record| {
        record.processes.retain(|item| {
            let identity_matches = system
                .process(Pid::from_u32(item.pid))
                .is_some_and(|process| item.matches(item.pid, process.start_time()));
            should_keep_suspended_process(identity_matches, is_process_still_suspended(item.pid))
        });
        if requested.contains(key) && !record.processes.is_empty() {
            counts.insert(key.clone(), record.processes.len());
        }
        !record.processes.is_empty()
    });

    *suspended_map()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = cleaned;
    counts
}

pub fn suspended_process_counts_for_configs(config_dirs: &[PathBuf]) -> HashMap<String, usize> {
    suspended_process_counts_with_system(config_dirs, &System::new_all())
}

pub fn process_profile_states_for_configs(
    config_dirs: &[PathBuf],
) -> (HashMap<String, usize>, HashSet<String>) {
    let system = System::new_all();
    let suspended_counts = suspended_process_counts_with_system(config_dirs, &system);
    let Some(home) = crate::session::get_home_dir() else {
        return (suspended_counts, HashSet::new());
    };
    let default_config = home.join(".claude");
    let profiles = resolve_process_profiles(&system, config_dirs, &default_config);
    let active_profile_keys = system
        .processes()
        .iter()
        .filter_map(|(&pid, process)| {
            let pid = pid.as_u32();
            let name = process.name().to_string_lossy();
            let command = process_command(process);
            is_target_claude_process(pid, std::process::id(), &name, &command)
                .then(|| profiles.get(&pid).cloned())
                .flatten()
        })
        .collect::<HashSet<_>>();
    (suspended_counts, active_profile_keys)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn suspend_claude_account_processes(
    app: tauri::AppHandle,
    config_dir: String,
    auto_resume: Option<bool>,
    five_hour_triggered: Option<bool>,
    five_hour_reset_at: Option<i64>,
    weekly_triggered: Option<bool>,
    weekly_reset_at: Option<i64>,
) -> Result<ClaudeProcessSuspendResult, String> {
    let target = PathBuf::from(&config_dir);
    let target_key = normalize_config_dir_key(&target);
    let home = crate::session::get_home_dir()
        .ok_or_else(|| "Could not locate the user home directory".to_string())?;
    let default_config = home.join(".claude");
    let mut candidates = candidate_dirs().unwrap_or_default();
    if !candidates
        .iter()
        .any(|candidate| normalize_config_dir_key(candidate) == target_key)
    {
        candidates.push(target.clone());
    }

    let system = System::new_all();
    let profiles = resolve_process_profiles(&system, &candidates, &default_config);
    let existing = live_suspended_for_key(&target_key, &system);
    let existing_pids = existing.iter().map(|item| item.pid).collect::<HashSet<_>>();
    let mut result = ClaudeProcessSuspendResult::default();
    let mut newly_suspended = Vec::new();

    for (&pid, process) in system.processes() {
        let pid = pid.as_u32();
        let name = process.name().to_string_lossy();
        let command = process_command(process);
        if !is_target_claude_process(pid, std::process::id(), &name, &command)
            || profiles.get(&pid) != Some(&target_key)
        {
            continue;
        }
        if existing_pids.contains(&pid) {
            result.already_suspended += 1;
            continue;
        }
        if !set_process_suspended(pid, true) {
            continue;
        }

        let category = process_category(&name, &command);
        result.cli_suspended += usize::from(category.cli);
        result.desktop_suspended += usize::from(category.desktop);
        result.agent_suspended += usize::from(category.agent);
        result.ide_backend_suspended += usize::from(category.ide_backend);
        result.total_suspended += 1;
        newly_suspended.push(SuspendedProcessRef {
            pid,
            start_time: process.start_time(),
        });
    }

    if !existing.is_empty() || !newly_suspended.is_empty() {
        let mut map = suspended_map()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let previous = map.get(&target_key).cloned();
        let mut processes = existing;
        processes.extend(newly_suspended);
        processes.sort_by_key(|item| (item.pid, item.start_time));
        processes.dedup();

        let record = SuspendedAccountRecord {
            config_dir: config_dir.clone(),
            processes,
            suspended_at: chrono::Utc::now().timestamp(),
            auto_resume: auto_resume
                .or_else(|| previous.as_ref().map(|item| item.auto_resume))
                .unwrap_or(false),
            five_hour_triggered: five_hour_triggered
                .or_else(|| previous.as_ref().map(|item| item.five_hour_triggered))
                .unwrap_or(false),
            five_hour_reset_at: five_hour_reset_at
                .or_else(|| previous.as_ref().and_then(|item| item.five_hour_reset_at)),
            weekly_triggered: weekly_triggered
                .or_else(|| previous.as_ref().map(|item| item.weekly_triggered))
                .unwrap_or(false),
            weekly_reset_at: weekly_reset_at
                .or_else(|| previous.as_ref().and_then(|item| item.weekly_reset_at)),
        };
        map.insert(target_key, record);
        drop(map);
        result = with_suspension_persistence(result, persist_suspensions(&app));
    }
    Ok(result)
}

#[tauri::command]
pub async fn resume_claude_account_processes(
    app: tauri::AppHandle,
    config_dir: String,
) -> Result<ClaudeProcessResumeResult, String> {
    let key = normalize_config_dir_key(Path::new(&config_dir));
    let record = suspended_map()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&key);
    let Some(record) = record else {
        return Ok(ClaudeProcessResumeResult::default());
    };

    let system = System::new_all();
    let mut result = ClaudeProcessResumeResult::default();
    let mut retry = Vec::new();
    let mut record = record;
    for item in std::mem::take(&mut record.processes) {
        let Some(process) = system.process(Pid::from_u32(item.pid)) else {
            result.stale_removed += 1;
            continue;
        };
        if !item.matches(item.pid, process.start_time()) {
            result.stale_removed += 1;
        } else if set_process_suspended(item.pid, false) {
            result.total_resumed += 1;
        } else {
            retry.push(item);
        }
    }

    if !retry.is_empty() {
        record.processes = retry;
        suspended_map()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(key, record);
    }
    result = with_resume_persistence(result, persist_suspensions(&app));
    Ok(result)
}

#[cfg(test)]
mod tests;
