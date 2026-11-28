use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use super::{ClaudeRateLimitWindow, ClaudeUsageScheduler, ProfileState};
use crate::claude::accounts::normalize_config_dir_key;

impl ClaudeUsageScheduler {
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        if enabled {
            self.wake.notify_one();
            return;
        }

        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.queue.clear();
        for profile in state.profiles.values_mut() {
            profile.queued = false;
            profile.rerun_after_current = false;
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    pub fn request_profiles(&self, config_dirs: &[PathBuf], max_age_secs: u64, force: bool) {
        if !self.is_enabled() {
            return;
        }

        let interval = Duration::from_secs(max_age_secs.max(1));
        let now = Instant::now();
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let queue_len = state.queue.len();
        for config_dir in config_dirs {
            state.request_profile(config_dir.clone(), interval, force, now);
        }
        let should_wake = state.queue.len() != queue_len || !state.queue.is_empty();
        drop(state);
        if should_wake {
            self.wake.notify_one();
        }
    }

    /// Ingests an externally captured usage snapshot (for example from a per-profile
    /// Claude Code `statusLine` bridge or piggybacked reset-credits payload).
    /// Returns `true` when the stored snapshot was updated.
    pub fn ingest_external_snapshot(
        &self,
        config_dir: &Path,
        five_hour: Option<ClaudeRateLimitWindow>,
        seven_day: Option<ClaudeRateLimitWindow>,
        fetched_at_secs: i64,
    ) -> bool {
        if five_hour.is_none() && seven_day.is_none() {
            return false;
        }

        let key = normalize_config_dir_key(config_dir);
        let now = Instant::now();
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let profile = state.profiles.entry(key).or_insert_with(|| {
            ProfileState::new(config_dir.to_path_buf(), Duration::from_secs(60), now)
        });

        if profile.snapshot.error.is_none()
            && profile
                .snapshot
                .fetched_at
                .is_some_and(|existing| existing >= fetched_at_secs)
        {
            return false;
        }

        profile.config_dir = config_dir.to_path_buf();
        if five_hour.is_some() {
            profile.snapshot.five_hour = five_hour;
        }
        if seven_day.is_some() {
            profile.snapshot.seven_day = seven_day;
        }
        profile.snapshot.fetched_at = Some(fetched_at_secs);
        profile.snapshot.error = None;
        profile.requested_at = now;
        profile.next_due_at = now + profile.requested_interval;
        true
    }

    /// Returns `false` when a fresh, error-free snapshot arrived within `idle_interval_secs`
    /// and its cached 5-hour `resets_at` timestamp has not yet passed.
    pub fn is_cli_probe_needed(
        &self,
        config_dir: &Path,
        idle_interval_secs: u64,
        now_secs: i64,
    ) -> bool {
        let key = normalize_config_dir_key(config_dir);
        let state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(profile) = state.profiles.get(&key) else {
            return true;
        };
        let snapshot = &profile.snapshot;
        if snapshot.error.is_some() {
            return true;
        }
        if snapshot.five_hour.is_none() && snapshot.seven_day.is_none() {
            return true;
        }
        let Some(fetched_at) = snapshot.fetched_at else {
            return true;
        };
        if fetched_at > now_secs {
            return true;
        }
        let max_age = i64::try_from(idle_interval_secs).unwrap_or(i64::MAX);
        if now_secs - fetched_at >= max_age {
            return true;
        }
        if snapshot
            .five_hour
            .as_ref()
            .and_then(|window| window.resets_at)
            .is_some_and(|resets_at| resets_at <= now_secs)
        {
            return true;
        }
        false
    }
}
