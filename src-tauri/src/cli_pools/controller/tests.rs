use super::*;
use crate::cli_pools::types::{CliProvider, CliRotationPoolV1, QuotaWindowKind};

fn sample_pool(account_ids: &[&str], auto_switch: bool) -> CliRotationPoolV1 {
    CliRotationPoolV1 {
        id: "pool-test".to_string(),
        provider: CliProvider::Agy,
        name: "Test Pool".to_string(),
        account_ids: account_ids.iter().map(|s| s.to_string()).collect(),
        enabled: true,
        auto_switch,
        trigger_windows: vec![QuotaWindowKind::FiveHour],
        fallback_latest_enabled: true,
        switch_when_idle_only: false,
    }
}

#[test]
fn test_controller_selects_next_eligible_account_in_pool() {
    let pool = sample_pool(&["acc-1", "acc-2", "acc-3"], true);
    let exhausted: std::collections::HashSet<String> = std::collections::HashSet::new();

    let candidate = select_next_candidate_account(&pool, "acc-1", &exhausted);
    assert_eq!(candidate, Some("acc-2".to_string()));

    let candidate_wrap = select_next_candidate_account(&pool, "acc-3", &exhausted);
    assert_eq!(candidate_wrap, Some("acc-1".to_string()));
}

#[test]
fn test_controller_skips_exhausted_candidates() {
    let pool = sample_pool(&["acc-1", "acc-2", "acc-3"], true);
    let mut exhausted = std::collections::HashSet::new();
    exhausted.insert("acc-2".to_string());

    let candidate = select_next_candidate_account(&pool, "acc-1", &exhausted);
    assert_eq!(candidate, Some("acc-3".to_string()));
}

#[test]
fn test_controller_returns_none_if_all_candidates_exhausted() {
    let pool = sample_pool(&["acc-1", "acc-2"], true);
    let mut exhausted = std::collections::HashSet::new();
    exhausted.insert("acc-1".to_string());
    exhausted.insert("acc-2".to_string());

    let candidate = select_next_candidate_account(&pool, "acc-1", &exhausted);
    assert_eq!(candidate, None);
}

#[test]
fn test_controller_blocks_when_auto_switch_is_disabled() {
    let pool = sample_pool(&["acc-1", "acc-2"], false);
    assert!(!is_pool_eligible_for_auto_switch(&pool, true));
}

#[test]
fn test_controller_blocks_when_global_toggle_is_disabled() {
    let pool = sample_pool(&["acc-1", "acc-2"], true);
    assert!(!is_pool_eligible_for_auto_switch(&pool, false));
}

#[test]
fn test_unknown_current_account_cannot_select_a_candidate() {
    let pool = sample_pool(&["acc-1", "acc-2"], true);
    assert_eq!(
        select_next_candidate_account(&pool, "unknown", &HashSet::new()),
        None
    );
}

#[test]
fn test_planner_does_not_use_latest_without_opt_in() {
    use crate::cli_pools::process_inventory::{ProcessIdentity, ProcessOwnership};
    let mut pool = sample_pool(&["acc-1", "acc-2"], true);
    pool.fallback_latest_enabled = false;
    let instance = CliInstance {
        identity: ProcessIdentity {
            pid: 1,
            started_at: 100,
            executable: "agy.exe".into(),
            cwd: Some("F:\\repo".into()),
        },
        provider: CliProvider::Agy,
        related_pids: vec![1],
        launch_executable: Some("agy.exe".into()),
        args: vec![],
        ownership: ProcessOwnership::Unattributed,
    };
    assert!(plan_rotation(
        &pool,
        true,
        "acc-1",
        &HashSet::new(),
        &[instance],
        &[],
        "continue",
        1000
    )
    .is_err());
}
