use chrono::Utc;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::Notify;

use super::{probe_cli_usage_for_config, ClaudeRateLimitWindow};
use crate::claude::accounts::normalize_config_dir_key;

mod control;

#[derive(Debug, Clone, Default)]
pub struct ClaudeUsageSnapshot {
    pub five_hour: Option<ClaudeRateLimitWindow>,
    pub seven_day: Option<ClaudeRateLimitWindow>,
    pub fetched_at: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
struct ProfileState {
    config_dir: PathBuf,
    snapshot: ClaudeUsageSnapshot,
    queued: bool,
    running: bool,
    rerun_after_current: bool,
    next_due_at: Instant,
    requested_interval: Duration,
}

impl ProfileState {
    fn new(config_dir: PathBuf, requested_interval: Duration, now: Instant) -> Self {
        Self {
            config_dir,
            snapshot: ClaudeUsageSnapshot::default(),
            queued: false,
            running: false,
            rerun_after_current: false,
            next_due_at: now,
            requested_interval,
        }
    }
}

#[derive(Default)]
struct SchedulerState {
    profiles: HashMap<String, ProfileState>,
    queue: VecDeque<String>,
}

impl SchedulerState {
    fn request_profile(
        &mut self,
        config_dir: PathBuf,
        interval: Duration,
        force: bool,
        now: Instant,
    ) -> String {
        let key = normalize_config_dir_key(&config_dir);
        let profile = self
            .profiles
            .entry(key.clone())
            .or_insert_with(|| ProfileState::new(config_dir.clone(), interval, now));
        profile.config_dir = config_dir;
        profile.requested_interval = interval;

        if profile.running {
            if force {
                profile.rerun_after_current = true;
            }
            return key;
        }

        let due = now >= profile.next_due_at;
        if profile.queued {
            if force {
                self.queue.retain(|queued| queued != &key);
                self.queue.push_front(key.clone());
            }
            return key;
        }

        if force || due {
            profile.queued = true;
            if force {
                self.queue.push_front(key.clone());
            } else {
                self.queue.push_back(key.clone());
            }
        }
        key
    }

    #[cfg(test)]
    fn mark_running(&mut self, key: &str) {
        if let Some(profile) = self.profiles.get_mut(key) {
            self.queue.retain(|queued| queued != key);
            profile.queued = false;
            profile.running = true;
        }
    }

    fn take_next(&mut self) -> Option<(String, PathBuf)> {
        let key = self.queue.pop_front()?;
        let profile = self.profiles.get_mut(&key)?;
        profile.queued = false;
        profile.running = true;
        Some((key, profile.config_dir.clone()))
    }

    fn complete_success(
        &mut self,
        key: &str,
        five_hour: Option<ClaudeRateLimitWindow>,
        seven_day: Option<ClaudeRateLimitWindow>,
        fetched_at: i64,
        completed_at: Instant,
    ) {
        let interval = self
            .profiles
            .get(key)
            .map(|profile| profile.requested_interval)
            .unwrap_or_else(|| Duration::from_secs(60));
        self.complete_success_with_interval(
            key,
            five_hour,
            seven_day,
            fetched_at,
            completed_at,
            interval,
        );
    }

    fn complete_success_with_interval(
        &mut self,
        key: &str,
        five_hour: Option<ClaudeRateLimitWindow>,
        seven_day: Option<ClaudeRateLimitWindow>,
        fetched_at: i64,
        completed_at: Instant,
        interval: Duration,
    ) {
        let profile = self
            .profiles
            .entry(key.to_string())
            .or_insert_with(|| ProfileState::new(PathBuf::from(key), interval, completed_at));
        profile.snapshot = ClaudeUsageSnapshot {
            five_hour,
            seven_day,
            fetched_at: Some(fetched_at),
            error: None,
        };
        profile.running = false;
        profile.requested_interval = interval;
        profile.next_due_at = completed_at + interval;
        Self::queue_requested_rerun(&mut self.queue, key, profile);
    }

    fn complete_error(&mut self, key: &str, error: String, completed_at: Instant) {
        let profile = self.profiles.entry(key.to_string()).or_insert_with(|| {
            ProfileState::new(PathBuf::from(key), Duration::from_secs(60), completed_at)
        });
        profile.snapshot.error = Some(error);
        profile.running = false;
        profile.next_due_at = completed_at + profile.requested_interval;
        Self::queue_requested_rerun(&mut self.queue, key, profile);
    }

    fn queue_requested_rerun(queue: &mut VecDeque<String>, key: &str, profile: &mut ProfileState) {
        if !profile.rerun_after_current {
            return;
        }
        profile.rerun_after_current = false;
        if !profile.queued {
            profile.queued = true;
            queue.push_front(key.to_string());
        }
    }

    fn snapshot(&self, key: &str) -> Option<&ClaudeUsageSnapshot> {
        self.profiles.get(key).map(|profile| &profile.snapshot)
    }

    #[cfg(test)]
    fn profile(&self, key: &str) -> Option<&ProfileState> {
        self.profiles.get(key)
    }
}

#[derive(Clone, Default)]
pub struct ClaudeUsageScheduler {
    state: Arc<Mutex<SchedulerState>>,
    wake: Arc<Notify>,
    enabled: Arc<AtomicBool>,
}

impl ClaudeUsageScheduler {
    pub fn snapshot_for(
        &self,
        config_dir: &PathBuf,
        max_age_secs: u64,
    ) -> (ClaudeUsageSnapshot, bool) {
        let key = normalize_config_dir_key(config_dir);
        let state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let snapshot = state.snapshot(&key).cloned().unwrap_or_default();
        let now = Utc::now().timestamp();
        let fresh = snapshot.error.is_none()
            && snapshot
                .fetched_at
                .is_some_and(|fetched| fetched <= now && now - fetched <= max_age_secs as i64);
        (snapshot, fresh)
    }

    pub async fn run(self, app: tauri::AppHandle) {
        loop {
            let next = {
                self.state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .take_next()
            };
            let Some((key, config_dir)) = next else {
                self.wake.notified().await;
                continue;
            };

            crate::log_eprintln!(
                "[claude_usage] start fetching usage via CLI for profile={}",
                key
            );
            let result = tauri::async_runtime::spawn_blocking(move || {
                probe_cli_usage_for_config(Some(&config_dir))
            })
            .await
            .map_err(|error| error.to_string())
            .and_then(|result| result);

            let completed_at = Instant::now();
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            match &result {
                Ok((five_hour, seven_day)) => {
                    crate::log_eprintln!(
                        "[claude_usage] fetched usage OK for profile={}: 5h={:?}% 7d={:?}%",
                        key,
                        five_hour.as_ref().and_then(|w| w.used_percentage),
                        seven_day.as_ref().and_then(|w| w.used_percentage)
                    );
                    state.complete_success(
                        &key,
                        five_hour.clone(),
                        seven_day.clone(),
                        Utc::now().timestamp(),
                        completed_at,
                    );
                }
                Err(error) => {
                    crate::log_eprintln!(
                        "[claude_usage] fetch usage failed for profile={}: {}",
                        key,
                        error
                    );
                    state.complete_error(&key, error.clone(), completed_at);
                }
            }
            let queued = !state.queue.is_empty();
            drop(state);

            let _ = app.emit("claude-account-usage-updated", key);
            if queued {
                self.wake.notify_one();
            }
        }
    }
}

#[tauri::command]
pub fn set_claude_features_enabled(
    scheduler: tauri::State<'_, ClaudeUsageScheduler>,
    enabled: bool,
) {
    scheduler.set_enabled(enabled);
}

#[cfg(test)]
mod tests;
