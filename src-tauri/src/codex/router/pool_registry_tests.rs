use super::*;

#[test]
fn legacy_v1_pool_remains_routable_only_through_labeled_legacy_oauth() {
    let config: super::super::types::CodexRouterConfig =
        serde_json::from_value(serde_json::json!({
            "accounts":[{
                "id":"legacy", "auth":{"kind":"oAuth","accessToken":"synthetic",
                    "refreshToken":null,"chatgptAccountId":"legacy-chatgpt"},
                "availableModelIds":null, "quotaWindows":[],
                "usageFetchedAt":null,"modelCatalogFetchedAt":null
            }],
            "pools":[{"id":"p1","model":"gpt-test","accountIds":["legacy"],
                "modelSelectionMode":"manual"}],
            "poolsV2":null,"appliedAccountId":null,"activePoolId":"p1"
        }))
        .unwrap();
    let routes = build_routes_from_config(&config).unwrap();
    assert_eq!(routes.len(), 1);
    assert_eq!(routes["gpt-test"].auth_mode, PoolAuthMode::LegacyCodexOAuth);
}

#[test]
fn v2_siwc_cannot_reuse_legacy_codex_oauth() {
    let config: super::super::types::CodexRouterConfig = serde_json::from_value(serde_json::json!({
            "accounts": [{
                "id": "legacy",
                "auth": {"kind":"oAuth", "accessToken":"synthetic", "chatgptAccountId":"synthetic", "refreshToken":null},
                "availableModelIds":null, "quotaWindows":[], "usageFetchedAt":null,"modelCatalogFetchedAt":null
            }],
            "pools": [],
            "poolsV2": [{
                "id":"siwc", "displayName":"SIWC", "publicModelName":"siwc-alias",
                "upstreamModelId":"gpt-test","enabled":true,
                "memberAccountIds":["legacy"],"modelSelectionMode":"manual",
                "routingPolicy":"cache-aware","authMode":"siwc"
            }],
            "appliedAccountId":null,"activePoolId":null
        })).unwrap();
    let result = build_routes_from_config(&config);
    assert!(
        result.is_err(),
        "legacy OAuth must not be treated as an SIWC registration"
    );
}

#[test]
fn test_pool_v2_serde_roundtrip() {
    let json_str = r#"{
            "id": "pool-1",
            "displayName": "Pool One",
            "publicModelName": "gpt-4o",
            "upstreamModelId": "gpt-4o",
            "enabled": true,
            "memberAccountIds": ["acc-1", "acc-2"],
            "modelSelectionMode": "manual",
            "routingPolicy": "cache-aware",
            "authMode": "siwc"
        }"#;

    let pool: CodexModelPoolV2 = serde_json::from_str(json_str).expect("deserialize");
    assert_eq!(pool.id, "pool-1");
    assert_eq!(pool.routing_policy, PoolRoutingPolicy::CacheAware);
    assert_eq!(pool.auth_mode, PoolAuthMode::Siwc);

    let serialized = serde_json::to_string(&pool).expect("serialize");
    assert!(serialized.contains(r#""publicModelName":"gpt-4o""#));
    assert!(serialized.contains(r#""routingPolicy":"cache-aware""#));
    assert!(serialized.contains(r#""authMode":"siwc""#));
}

#[test]
fn test_validate_and_build_routes_rejects_duplicate_enabled_alias() {
    let p1 = CodexModelPoolV2 {
        id: "p1".to_string(),
        display_name: "P1".to_string(),
        public_model_name: "gpt-4o".to_string(),
        upstream_model_id: "gpt-4o".to_string(),
        enabled: true,
        member_account_ids: vec!["acc-1".to_string()],
        model_selection_mode: "manual".to_string(),
        routing_policy: PoolRoutingPolicy::CacheAware,
        auth_mode: PoolAuthMode::Siwc,
        max_context_window_tokens: Some(400_000),
        thinking_budget_tokens: Some(8_192),
        reasoning_effort: Some("medium".to_string()),
    };
    let p2 = CodexModelPoolV2 {
        id: "p2".to_string(),
        display_name: "P2".to_string(),
        public_model_name: "GPT-4O".to_string(),
        upstream_model_id: "gpt-4o".to_string(),
        enabled: true,
        member_account_ids: vec!["acc-2".to_string()],
        model_selection_mode: "manual".to_string(),
        routing_policy: PoolRoutingPolicy::Balanced,
        auth_mode: PoolAuthMode::Siwc,
        max_context_window_tokens: None,
        thinking_budget_tokens: None,
        reasoning_effort: None,
    };

    let result = validate_and_build_routes(&[p1, p2], None);
    assert!(matches!(
        result,
        Err(RegistryValidationError::DuplicateEnabledAlias(_))
    ));
}
