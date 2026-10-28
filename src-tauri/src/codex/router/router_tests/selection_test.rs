use super::pool_registry::{PoolAuthMode, PoolRoutingPolicy};
use super::route_context::ResolvedRoute;
use super::selection::RouterRuntimeState;
use super::types::{CodexRouterAccount, CodexRouterAuth, CodexRouterConfig};
use std::time::Duration;

#[test]
fn route_members_follow_customized_order_and_failover_on_backoff() {
    let mut runtime = RouterRuntimeState::default();
    let account_a = CodexRouterAccount {
        id: "acc-1".to_string(),
        auth: CodexRouterAuth::ApiKey {
            api_key: "k1".into(),
        },
        available_model_ids: Some(vec!["gpt-4o".into()]),
        quota_windows: vec![],
        usage_fetched_at: None,
        model_catalog_fetched_at: None,
    };
    let account_b = CodexRouterAccount {
        id: "acc-2".to_string(),
        auth: CodexRouterAuth::ApiKey {
            api_key: "k2".into(),
        },
        available_model_ids: Some(vec!["gpt-4o".into()]),
        quota_windows: vec![],
        usage_fetched_at: None,
        model_catalog_fetched_at: None,
    };
    let account_c = CodexRouterAccount {
        id: "acc-3".to_string(),
        auth: CodexRouterAuth::ApiKey {
            api_key: "k3".into(),
        },
        available_model_ids: Some(vec!["gpt-4o".into()]),
        quota_windows: vec![],
        usage_fetched_at: None,
        model_catalog_fetched_at: None,
    };

    let config = CodexRouterConfig {
        accounts: vec![account_a, account_b, account_c],
        pools: vec![],
        pools_v2: None,
        applied_account_id: None,
        active_pool_id: None,
    };

    let route = ResolvedRoute {
        pool_id: "pool-ordered".to_string(),
        public_model_name: "custom-alias".to_string(),
        upstream_model_id: "gpt-4o".to_string(),
        member_account_ids: vec![
            "acc-2".to_string(),
            "acc-3".to_string(),
            "acc-1".to_string(),
        ],
        model_selection_mode: "manual".to_string(),
        routing_policy: PoolRoutingPolicy::CacheAware,
        auth_mode: PoolAuthMode::OpenAiApiKey,
        max_context_window_tokens: None,
        thinking_budget_tokens: None,
        reasoning_effort: None,
    };

    // 1. Initial selection: first in customized member order ("acc-2")
    let chosen = runtime.select_account_for_route_members(&config, &route);
    assert_eq!(chosen.as_deref(), Some("acc-2"));

    // 2. When acc-2 hits limit (backed off), switch to next in list ("acc-3")
    runtime.mark_backoff("acc-2", "gpt-4o", Duration::from_secs(60));
    let chosen = runtime.select_account_for_route_members(&config, &route);
    assert_eq!(chosen.as_deref(), Some("acc-3"));

    // 3. When acc-3 hits limit (backed off), switch to bottom account ("acc-1")
    runtime.mark_backoff("acc-3", "gpt-4o", Duration::from_secs(60));
    let chosen = runtime.select_account_for_route_members(&config, &route);
    assert_eq!(chosen.as_deref(), Some("acc-1"));

    // 4. When all members are backed off, None is returned
    runtime.mark_backoff("acc-1", "gpt-4o", Duration::from_secs(60));
    let chosen = runtime.select_account_for_route_members(&config, &route);
    assert_eq!(chosen, None);
}
