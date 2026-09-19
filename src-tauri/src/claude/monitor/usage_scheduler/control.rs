use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use super::ClaudeUsageScheduler;

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
}
