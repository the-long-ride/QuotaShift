use super::*;
use crate::cli_pools::types::{
    CliProvider, CliRotationBindingsV1, CliRotationPoolV1, QuotaWindowKind,
};

#[test]
fn test_valid_pool_passes() {
    let pool = CliRotationPoolV1 {
        id: "p1".to_string(),
        provider: CliProvider::Agy,
        name: "Main Pool".to_string(),
        account_ids: vec!["ag-1".to_string(), "ag-2".to_string()],
        enabled: true,
        auto_switch: true,
        trigger_windows: vec![QuotaWindowKind::FiveHour, QuotaWindowKind::Weekly],
        fallback_latest_enabled: false,
        switch_when_idle_only: true,
    };
    let accounts = vec![
        AccountMeta {
            id: "ag-1",
            provider: CliProvider::Agy,
        },
        AccountMeta {
            id: "ag-2",
            provider: CliProvider::Agy,
        },
    ];
    let bindings = CliRotationBindingsV1 {
        agy_active_pool_id: Some("p1".to_string()),
        codex_active_pool_id: None,
    };
    assert_eq!(validate_cli_pool(&pool, &accounts, Some(&bindings)), Ok(()));
}

#[test]
fn test_missing_id_and_name() {
    let mut pool = CliRotationPoolV1 {
        id: "  ".to_string(),
        provider: CliProvider::Agy,
        name: "Main".to_string(),
        account_ids: vec![],
        enabled: false,
        auto_switch: false,
        trigger_windows: vec![],
        fallback_latest_enabled: false,
        switch_when_idle_only: true,
    };
    assert_eq!(
        validate_cli_pool(&pool, &[], None),
        Err(PoolValidationError::MissingId)
    );

    pool.id = "p1".to_string();
    pool.name = " ".to_string();
    assert_eq!(
        validate_cli_pool(&pool, &[], None),
        Err(PoolValidationError::MissingName)
    );
}

#[test]
fn test_duplicate_and_cross_provider_accounts() {
    let pool = CliRotationPoolV1 {
        id: "p1".to_string(),
        provider: CliProvider::Agy,
        name: "Main".to_string(),
        account_ids: vec!["ag-1".to_string(), "ag-1".to_string()],
        enabled: false,
        auto_switch: false,
        trigger_windows: vec![],
        fallback_latest_enabled: false,
        switch_when_idle_only: true,
    };
    let accounts = vec![AccountMeta {
        id: "ag-1",
        provider: CliProvider::Agy,
    }];
    assert_eq!(
        validate_cli_pool(&pool, &accounts, None),
        Err(PoolValidationError::DuplicateAccount("ag-1".to_string()))
    );

    let cross_pool = CliRotationPoolV1 {
        id: "p1".to_string(),
        provider: CliProvider::Agy,
        name: "Main".to_string(),
        account_ids: vec!["cx-1".to_string()],
        enabled: false,
        auto_switch: false,
        trigger_windows: vec![],
        fallback_latest_enabled: false,
        switch_when_idle_only: true,
    };
    let cross_accounts = vec![AccountMeta {
        id: "cx-1",
        provider: CliProvider::Codex,
    }];
    assert_eq!(
        validate_cli_pool(&cross_pool, &cross_accounts, None),
        Err(PoolValidationError::InvalidAccount("cx-1".to_string()))
    );
}

#[test]
fn test_insufficient_accounts_when_auto_switch_enabled() {
    let pool = CliRotationPoolV1 {
        id: "p1".to_string(),
        provider: CliProvider::Codex,
        name: "Solo Pool".to_string(),
        account_ids: vec!["cx-1".to_string()],
        enabled: true,
        auto_switch: true,
        trigger_windows: vec![QuotaWindowKind::FiveHour],
        fallback_latest_enabled: false,
        switch_when_idle_only: true,
    };
    let accounts = vec![AccountMeta {
        id: "cx-1",
        provider: CliProvider::Codex,
    }];
    assert_eq!(
        validate_cli_pool(&pool, &accounts, None),
        Err(PoolValidationError::InsufficientAccounts(1))
    );
}

#[test]
fn test_bound_pool_must_be_enabled() {
    let pool = CliRotationPoolV1 {
        id: "p1".to_string(),
        provider: CliProvider::Agy,
        name: "Main".to_string(),
        account_ids: vec!["ag-1".to_string()],
        enabled: false,
        auto_switch: false,
        trigger_windows: vec![],
        fallback_latest_enabled: false,
        switch_when_idle_only: true,
    };
    let accounts = vec![AccountMeta {
        id: "ag-1",
        provider: CliProvider::Agy,
    }];
    let bindings = CliRotationBindingsV1 {
        agy_active_pool_id: Some("p1".to_string()),
        codex_active_pool_id: None,
    };
    assert_eq!(
        validate_cli_pool(&pool, &accounts, Some(&bindings)),
        Err(PoolValidationError::InactivePoolBound)
    );
}
