use super::*;
use crate::cli_pools::types::CliProvider;

#[test]
fn test_acquire_and_release_lock() {
    let manager = RotationLockManager::new();
    let lock_res = manager.acquire(CliProvider::Agy, "default", "op-1", 100);
    assert!(lock_res.is_ok());
    assert!(manager.is_locked(CliProvider::Agy, "default"));

    drop(lock_res);
    assert!(!manager.is_locked(CliProvider::Agy, "default"));
}

#[test]
fn test_concurrent_lock_acquisition_is_blocked() {
    let manager = RotationLockManager::new();
    let lock1 = manager
        .acquire(CliProvider::Agy, "default", "op-1", 100)
        .unwrap();
    let lock2 = manager.acquire(CliProvider::Agy, "default", "op-2", 105);

    assert_eq!(
        lock2.err(),
        Some(LockError::AlreadyLocked {
            holder_op_id: "op-1".to_string()
        })
    );
    drop(lock1);

    // Now op-2 can acquire
    let lock2_retry = manager.acquire(CliProvider::Agy, "default", "op-2", 110);
    assert!(lock2_retry.is_ok());
}

#[test]
fn test_different_providers_or_auth_domains_can_lock_simultaneously() {
    let manager = RotationLockManager::new();
    let lock_agy = manager.acquire(CliProvider::Agy, "default", "op-1", 100);
    let lock_codex = manager.acquire(CliProvider::Codex, "default", "op-2", 100);
    let lock_domain = manager.acquire(CliProvider::Agy, "isolated-1", "op-3", 100);

    assert!(lock_agy.is_ok());
    assert!(lock_codex.is_ok());
    assert!(lock_domain.is_ok());
}

#[test]
fn test_same_operation_cannot_create_a_second_guard() {
    let manager = RotationLockManager::new();
    let lock1 = manager.acquire(CliProvider::Agy, "default", "op-1", 100);
    assert!(lock1.is_ok());
    let lock2 = manager.acquire(CliProvider::Agy, "default", "op-1", 105);
    assert!(lock2.is_err());
    drop(lock2);
    assert!(manager.is_locked(CliProvider::Agy, "default"));
}

#[test]
fn test_preflight_blocks_when_router_has_in_flight_requests() {
    let params = PreflightCheckParams {
        provider: CliProvider::Codex,
        auth_domain: "default".into(),
        router_active: true,
        router_in_flight: 2,
        has_isolated_codex_home: false,
        candidate_account_id: "acc-2".into(),
        candidate_valid: true,
        active_account_id: "acc-1".into(),
        managed_cli_instances: 1,
    };

    let res = preflight_rotation_compatibility(&params);
    assert_eq!(res, Err(PreflightBlockedReason::RouterInFlightRequests(2)));
}

#[test]
fn test_preflight_blocks_when_global_router_active() {
    let params = PreflightCheckParams {
        provider: CliProvider::Codex,
        auth_domain: "default".into(),
        router_active: true,
        router_in_flight: 0,
        has_isolated_codex_home: false,
        candidate_account_id: "acc-2".into(),
        candidate_valid: true,
        active_account_id: "acc-1".into(),
        managed_cli_instances: 1,
    };

    let res = preflight_rotation_compatibility(&params);
    assert_eq!(res, Err(PreflightBlockedReason::GlobalRouterActiveConflict));
}

#[test]
fn test_preflight_blocks_when_multiple_unmanaged_instances() {
    let params = PreflightCheckParams {
        provider: CliProvider::Agy,
        auth_domain: "default".into(),
        router_active: false,
        router_in_flight: 0,
        has_isolated_codex_home: false,
        candidate_account_id: "acc-2".into(),
        candidate_valid: true,
        active_account_id: "acc-1".into(),
        managed_cli_instances: 3,
    };

    let res = preflight_rotation_compatibility(&params);
    assert_eq!(
        res,
        Err(PreflightBlockedReason::MultipleUnmanagedProcesses(3))
    );
}

#[test]
fn test_preflight_blocks_when_candidate_is_invalid() {
    let params = PreflightCheckParams {
        provider: CliProvider::Agy,
        auth_domain: "default".into(),
        router_active: false,
        router_in_flight: 0,
        has_isolated_codex_home: false,
        candidate_account_id: "acc-2".into(),
        candidate_valid: false,
        active_account_id: "acc-1".into(),
        managed_cli_instances: 1,
    };

    let res = preflight_rotation_compatibility(&params);
    assert_eq!(res, Err(PreflightBlockedReason::CandidateAccountInvalid));
}

#[test]
fn test_preflight_blocks_when_candidate_already_active() {
    let params = PreflightCheckParams {
        provider: CliProvider::Agy,
        auth_domain: "default".into(),
        router_active: false,
        router_in_flight: 0,
        has_isolated_codex_home: false,
        candidate_account_id: "acc-1".into(),
        candidate_valid: true,
        active_account_id: "acc-1".into(),
        managed_cli_instances: 1,
    };

    let res = preflight_rotation_compatibility(&params);
    assert_eq!(res, Err(PreflightBlockedReason::CandidateAlreadyActive));
}

#[test]
fn test_preflight_passes_when_all_conditions_satisfied() {
    let params = PreflightCheckParams {
        provider: CliProvider::Agy,
        auth_domain: "default".into(),
        router_active: false,
        router_in_flight: 0,
        has_isolated_codex_home: false,
        candidate_account_id: "acc-2".into(),
        candidate_valid: true,
        active_account_id: "acc-1".into(),
        managed_cli_instances: 1,
    };

    assert_eq!(preflight_rotation_compatibility(&params), Ok(()));
}
