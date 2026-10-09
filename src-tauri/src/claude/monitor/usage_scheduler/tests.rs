use super::*;

fn window(used: f64, resets_at: i64) -> ClaudeRateLimitWindow {
    ClaudeRateLimitWindow {
        used_percentage: Some(used),
        resets_at: Some(resets_at),
    }
}

#[test]
fn duplicate_profile_requests_are_coalesced() {
    let mut state = SchedulerState::default();
    let path = PathBuf::from("C:/profiles/a");

    state.request_profile(path.clone(), Duration::from_secs(20), false, Instant::now());
    state.request_profile(path, Duration::from_secs(20), false, Instant::now());

    assert_eq!(state.queue.len(), 1);
}

#[test]
fn force_during_running_probe_queues_exactly_one_follow_up() {
    let mut state = SchedulerState::default();
    let path = PathBuf::from("C:/profiles/a");
    let key = state.request_profile(path.clone(), Duration::from_secs(20), false, Instant::now());
    state.mark_running(&key);

    state.request_profile(path.clone(), Duration::from_secs(20), true, Instant::now());
    state.request_profile(path, Duration::from_secs(20), true, Instant::now());
    state.complete_error(&key, "probe failed".into(), Instant::now());

    assert_eq!(
        state.queue.iter().filter(|queued| *queued == &key).count(),
        1
    );
}

#[test]
fn failed_probe_preserves_last_good_usage_and_records_error() {
    let mut state = SchedulerState::default();
    let key = "c:/profiles/a".to_string();
    state.complete_success(
        &key,
        Some(window(91.0, 1000)),
        Some(window(70.0, 2000)),
        900,
        Instant::now(),
    );

    state.complete_error(&key, "probe failed".into(), Instant::now());

    let snapshot = state.snapshot(&key).unwrap();
    assert_eq!(
        snapshot.five_hour.as_ref().unwrap().used_percentage,
        Some(91.0)
    );
    assert_eq!(snapshot.fetched_at, Some(900));
    assert_eq!(snapshot.error.as_deref(), Some("probe failed"));
}

#[test]
fn slow_completion_schedules_from_completion_time() {
    let mut state = SchedulerState::default();
    let key = "c:/profiles/a".to_string();
    let completed = Instant::now();

    state.complete_success_with_interval(&key, None, None, 900, completed, Duration::from_secs(20));

    assert!(state.profile(&key).unwrap().next_due_at >= completed + Duration::from_secs(20));
}

#[test]
fn scheduler_feature_gate_defaults_off_and_clears_pending_requests_when_disabled() {
    let scheduler = ClaudeUsageScheduler::default();
    let profile = PathBuf::from("C:/profiles/a");

    assert!(!scheduler.is_enabled());
    scheduler.request_profiles(std::slice::from_ref(&profile), 20, true);
    assert!(scheduler
        .state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .queue
        .is_empty());

    scheduler.set_enabled(true);
    scheduler.request_profiles(std::slice::from_ref(&profile), 20, true);
    assert_eq!(
        scheduler
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .queue
            .len(),
        1
    );

    scheduler.set_enabled(false);
    let state = scheduler
        .state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    assert!(state.queue.is_empty());
    assert!(!scheduler.is_enabled());
}

#[test]
fn a_slow_probe_does_not_push_the_next_poll_to_every_other_tick() {
    let mut state = SchedulerState::default();
    let path = PathBuf::from("C:/profiles/a");
    let interval = Duration::from_secs(20);
    let t0 = Instant::now();

    let key = state.request_profile(path.clone(), interval, false, t0);
    state.take_next();
    // The probe takes 6s; the frontend polls again exactly one interval after it asked.
    state.complete_success(&key, None, None, 900, t0 + Duration::from_secs(6));
    state.request_profile(path, interval, false, t0 + interval);

    assert_eq!(state.queue.len(), 1);
}

#[test]
fn a_poll_inside_the_interval_does_not_start_another_probe() {
    let mut state = SchedulerState::default();
    let path = PathBuf::from("C:/profiles/a");
    let interval = Duration::from_secs(20);
    let t0 = Instant::now();

    let key = state.request_profile(path.clone(), interval, false, t0);
    state.take_next();
    state.complete_success(&key, None, None, 900, t0 + Duration::from_secs(6));
    state.request_profile(path, interval, false, t0 + Duration::from_secs(19));

    assert!(state.queue.is_empty());
}

#[test]
fn a_failed_probe_is_retried_one_interval_after_it_was_requested() {
    let mut state = SchedulerState::default();
    let path = PathBuf::from("C:/profiles/a");
    let interval = Duration::from_secs(20);
    let t0 = Instant::now();

    let key = state.request_profile(path.clone(), interval, false, t0);
    state.take_next();
    state.complete_error(&key, "probe failed".into(), t0 + Duration::from_secs(8));
    state.request_profile(path, interval, false, t0 + interval);

    assert_eq!(state.queue.len(), 1);
}
