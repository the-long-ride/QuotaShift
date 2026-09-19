use chrono::Utc;
use std::path::PathBuf;
use std::time::Duration;
use sysinfo::{Pid, System};
use tauri::Manager;

use super::classify::resolve_process_profiles;
use super::journal::{persist_suspensions, records_snapshot, suspended_map};
use super::native::{is_process_still_suspended, set_process_suspended};
use crate::claude::accounts::{candidate_dirs, normalize_config_dir_key};
use crate::claude::monitor::ClaudeUsageScheduler;

const AUTO_RESUME_CHECK_SECS: u64 = 30;

fn profile_ready_for_usage_refresh(resumed_or_running: bool, retry_count: usize) -> bool {
    resumed_or_running && retry_count == 0
}

fn matches_resume_target(
    item: &super::journal::SuspendedProcessRef,
    process_start_time: u64,
    mapped_profile: Option<&str>,
    expected_profile: &str,
) -> bool {
    item.matches(item.pid, process_start_time) && mapped_profile == Some(expected_profile)
}

pub async fn run_claude_auto_resume_worker(app: tauri::AppHandle) {
    let scheduler = app.state::<ClaudeUsageScheduler>().inner().clone();
    loop {
        if scheduler.is_enabled() {
            match resume_due_suspensions(&app) {
                Ok(resumed_config_dirs) if !resumed_config_dirs.is_empty() => {
                    scheduler.request_profiles(&resumed_config_dirs, 1, true);
                }
                Ok(_) => {}
                Err(error) => crate::logger::log_error("claude_guardrail", &error),
            }
        }
        tokio::time::sleep(Duration::from_secs(AUTO_RESUME_CHECK_SECS)).await;
    }
}

fn resume_due_suspensions(app: &tauri::AppHandle) -> Result<Vec<PathBuf>, String> {
    let records = records_snapshot();
    if records.is_empty() {
        return Ok(Vec::new());
    }

    let now = Utc::now().timestamp();
    let due = records
        .iter()
        .filter(|(_, record)| {
            record
                .auto_resume_deadline()
                .is_some_and(|deadline| now >= deadline)
        })
        .map(|(key, record)| (key.clone(), record.clone()))
        .collect::<Vec<_>>();
    if due.is_empty() {
        return Ok(Vec::new());
    }

    let home = crate::session::get_home_dir()
        .ok_or_else(|| "Could not locate the user home directory".to_string())?;
    let default_config = home.join(".claude");
    let mut candidates = candidate_dirs().unwrap_or_default();
    for (_, record) in &due {
        let path = PathBuf::from(&record.config_dir);
        let key = normalize_config_dir_key(&path);
        if !candidates
            .iter()
            .any(|candidate| normalize_config_dir_key(candidate) == key)
        {
            candidates.push(path);
        }
    }

    let system = System::new_all();
    let profiles = resolve_process_profiles(&system, &candidates, &default_config);
    let mut changed = false;
    let mut resumed_config_dirs = Vec::new();

    for (key, record) in due {
        let config_dir = PathBuf::from(&record.config_dir);
        let mut retry = Vec::new();
        let mut resumed_or_running = false;
        for item in record.processes {
            let Some(process) = system.process(Pid::from_u32(item.pid)) else {
                changed = true;
                continue;
            };
            if !matches_resume_target(
                &item,
                process.start_time(),
                profiles.get(&item.pid).map(String::as_str),
                &key,
            ) {
                changed = true;
                continue;
            }

            match is_process_still_suspended(item.pid) {
                Some(true) => {
                    if set_process_suspended(item.pid, false) {
                        changed = true;
                        resumed_or_running = true;
                    } else {
                        retry.push(item);
                    }
                }
                Some(false) => {
                    changed = true;
                    resumed_or_running = true;
                }
                None => retry.push(item),
            }
        }

        let retry_count = retry.len();
        {
            let mut map = suspended_map()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if retry.is_empty() {
                map.remove(&key);
            } else if let Some(current) = map.get_mut(&key) {
                current.processes = retry;
            }
        }
        if profile_ready_for_usage_refresh(resumed_or_running, retry_count) {
            resumed_config_dirs.push(config_dir);
        }
    }

    if changed {
        persist_suspensions(app)?;
    }
    Ok(resumed_config_dirs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_resume_check_interval_is_bounded() {
        assert_eq!(AUTO_RESUME_CHECK_SECS, 30);
    }

    #[test]
    fn usage_refresh_waits_until_the_profile_is_fully_resumed() {
        assert!(profile_ready_for_usage_refresh(true, 0));
        assert!(!profile_ready_for_usage_refresh(false, 0));
        assert!(!profile_ready_for_usage_refresh(true, 1));
    }

    #[test]
    fn resume_target_requires_start_time_and_profile_match() {
        let item = super::super::journal::SuspendedProcessRef {
            pid: 42,
            start_time: 1000,
        };
        assert!(matches_resume_target(
            &item,
            1000,
            Some("profile-a"),
            "profile-a"
        ));
        assert!(!matches_resume_target(
            &item,
            1001,
            Some("profile-a"),
            "profile-a"
        ));
        assert!(!matches_resume_target(
            &item,
            1000,
            Some("profile-b"),
            "profile-a"
        ));
        assert!(!matches_resume_target(&item, 1000, None, "profile-a"));
    }
}
