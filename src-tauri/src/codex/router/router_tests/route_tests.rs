use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::client_binding::ClientBinding;
use super::pool_registry::{
    validate_and_build_routes, CodexModelPoolV2, PoolAuthMode, PoolRegistrySnapshot,
    PoolRoutingPolicy,
};
use super::route_context::{resolve_route, rewrite_model_in_json, ClientContext, RouteRejection};

fn make_pool(
    id: &str,
    alias: &str,
    upstream: &str,
    enabled: bool,
    accounts: Vec<&str>,
) -> CodexModelPoolV2 {
    CodexModelPoolV2 {
        id: id.to_string(),
        display_name: format!("Display {id}"),
        public_model_name: alias.to_string(),
        upstream_model_id: upstream.to_string(),
        enabled,
        member_account_ids: accounts.into_iter().map(String::from).collect(),
        model_selection_mode: "manual".to_string(),
        routing_policy: PoolRoutingPolicy::CacheAware,
        auth_mode: PoolAuthMode::Siwc,
        max_context_window_tokens: None,
        thinking_budget_tokens: None,
        reasoning_effort: None,
    }
}

#[tokio::test]
async fn three_enabled_aliases_run_in_parallel() {
    let p1 = make_pool("p1", "gpt-4o-team-a", "gpt-4o", true, vec!["acc-1"]);
    let p2 = make_pool("p2", "gpt-4o-team-b", "gpt-4o", true, vec!["acc-2"]);
    let p3 = make_pool("p3", "o1-fast", "o1-preview", true, vec!["acc-3"]);

    let routes = validate_and_build_routes(&[p1, p2, p3], None).expect("valid routes");
    let snapshot = Arc::new(PoolRegistrySnapshot {
        revision: 1,
        routes,
    });
    let client = ClientContext::unrestricted();

    let (r1, r2, r3) = tokio::join!(
        async { resolve_route(&snapshot, &client, "gpt-4o-team-a") },
        async { resolve_route(&snapshot, &client, "gpt-4o-team-b") },
        async { resolve_route(&snapshot, &client, "o1-fast") },
    );

    let r1 = r1.expect("resolve r1");
    let r2 = r2.expect("resolve r2");
    let r3 = r3.expect("resolve r3");

    assert_eq!(r1.pool_id, "p1");
    assert_eq!(r1.upstream_model_id, "gpt-4o");
    assert_eq!(r1.member_account_ids, vec!["acc-1"]);

    assert_eq!(r2.pool_id, "p2");
    assert_eq!(r2.upstream_model_id, "gpt-4o");
    assert_eq!(r2.member_account_ids, vec!["acc-2"]);

    assert_eq!(r3.pool_id, "p3");
    assert_eq!(r3.upstream_model_id, "o1-preview");
    assert_eq!(r3.member_account_ids, vec!["acc-3"]);
}

#[test]
fn same_upstream_distinct_aliases_keep_membership() {
    let p1 = make_pool("p1", "alias-one", "gpt-4o", true, vec!["acc-1"]);
    let p2 = make_pool("p2", "alias-two", "gpt-4o", true, vec!["acc-2"]);

    let routes = validate_and_build_routes(&[p1, p2], None).expect("valid routes");
    let snapshot = PoolRegistrySnapshot {
        revision: 1,
        routes,
    };
    let client = ClientContext::unrestricted();

    let r1 = resolve_route(&snapshot, &client, "alias-one").expect("resolve p1");
    assert_eq!(r1.member_account_ids, vec!["acc-1"]);

    let r2 = resolve_route(&snapshot, &client, "alias-two").expect("resolve p2");
    assert_eq!(r2.member_account_ids, vec!["acc-2"]);
}

#[test]
fn unknown_alias_does_not_use_applied_account() {
    let p1 = make_pool("p1", "gpt-4o", "gpt-4o", true, vec!["acc-1"]);
    let routes = validate_and_build_routes(&[p1], None).expect("valid routes");
    let snapshot = PoolRegistrySnapshot {
        revision: 1,
        routes,
    };
    let client = ClientContext::unrestricted();

    let result = resolve_route(&snapshot, &client, "unknown-alias");
    assert!(matches!(result, Err(RouteRejection::UnknownAlias(_))));
}

#[test]
fn disabled_alias_not_routable() {
    let p1 = make_pool("p1", "disabled-model", "gpt-4o", false, vec!["acc-1"]);
    let routes = validate_and_build_routes(&[p1], None).expect("valid routes");
    let snapshot = PoolRegistrySnapshot {
        revision: 1,
        routes,
    };
    let client = ClientContext::unrestricted();

    let result = resolve_route(&snapshot, &client, "disabled-model");
    assert!(matches!(
        result,
        Err(RouteRejection::Disabled(_)) | Err(RouteRejection::UnknownAlias(_))
    ));
}

#[test]
fn unauthorized_client_cannot_list_alias() {
    let p1 = make_pool("p1", "model-a", "gpt-4o", true, vec!["acc-1"]);
    let p2 = make_pool("p2", "model-b", "gpt-4o", true, vec!["acc-2"]);
    let routes = validate_and_build_routes(&[p1, p2], None).expect("valid routes");
    let snapshot = PoolRegistrySnapshot {
        revision: 1,
        routes,
    };

    let restricted_client = ClientContext::from_binding(&ClientBinding::new(
        "restricted-profile".to_string(),
        None,
        HashSet::from(["model-a".to_string()]),
    ));

    assert!(resolve_route(&snapshot, &restricted_client, "model-a").is_ok());
    let denied = resolve_route(&snapshot, &restricted_client, "model-b");
    assert!(matches!(denied, Err(RouteRejection::Forbidden(_))));

    let visible = snapshot.visible_models(&restricted_client);
    assert_eq!(visible, vec!["model-a"]);
}

#[test]
fn invalid_hot_reload_preserves_previous_revision() {
    let p1 = make_pool("p1", "alias-valid", "gpt-4o", true, vec!["acc-1"]);
    let routes = validate_and_build_routes(&[p1], None).expect("valid routes");
    let current_snapshot = Arc::new(PoolRegistrySnapshot {
        revision: 1,
        routes,
    });

    // Attempt invalid hot reload with empty members on enabled pool
    let invalid_pool = make_pool("p2", "alias-invalid", "gpt-4o", true, vec![]);
    let reload_result = validate_and_build_routes(&[invalid_pool], None);
    assert!(reload_result.is_err());

    // Original snapshot remains intact
    assert_eq!(current_snapshot.revision, 1);
    let client = ClientContext::unrestricted();
    assert!(resolve_route(&current_snapshot, &client, "alias-valid").is_ok());
}

#[tokio::test]
async fn disable_during_stream_allows_existing_to_finish() {
    let p1 = make_pool("p1", "streaming-model", "gpt-4o", true, vec!["acc-1"]);
    let routes_v1 = validate_and_build_routes(&[p1.clone()], None).expect("valid v1");
    let registry = Arc::new(RwLock::new(Arc::new(PoolRegistrySnapshot {
        revision: 1,
        routes: routes_v1,
    })));

    // Request 1 starts and acquires snapshot revision 1
    let in_flight_snapshot = registry.read().await.clone();
    let client = ClientContext::unrestricted();
    let route =
        resolve_route(&in_flight_snapshot, &client, "streaming-model").expect("resolved v1");
    assert_eq!(route.pool_id, "p1");

    // Hot reload disables the pool in revision 2
    let mut p1_disabled = p1.clone();
    p1_disabled.enabled = false;
    let routes_v2 = validate_and_build_routes(&[p1_disabled], None).expect("valid v2");
    *registry.write().await = Arc::new(PoolRegistrySnapshot {
        revision: 2,
        routes: routes_v2,
    });

    // In-flight request using previous snapshot still has its route and accounts
    assert_eq!(route.member_account_ids, vec!["acc-1"]);
    assert_eq!(in_flight_snapshot.revision, 1);

    // New request using new snapshot cannot route the disabled model
    let new_snapshot = registry.read().await.clone();
    assert_eq!(new_snapshot.revision, 2);
    let new_result = resolve_route(&new_snapshot, &client, "streaming-model");
    assert!(new_result.is_err());
}

#[test]
fn body_model_rewritten_once() {
    let payload = br#"{
        "model": "public-alias-fast",
        "messages": [
            {"role": "user", "content": "What do you think of model: public-alias-fast?"}
        ],
        "nested": {
            "model": "dont-touch-me"
        }
    }"#;

    let rewritten = rewrite_model_in_json(payload, "gpt-4o-2024-08-06").expect("rewritten JSON");
    let parsed: serde_json::Value = serde_json::from_slice(&rewritten).expect("valid JSON");

    assert_eq!(parsed["model"], "gpt-4o-2024-08-06");
    assert_eq!(
        parsed["messages"][0]["content"],
        "What do you think of model: public-alias-fast?"
    );
    assert_eq!(parsed["nested"]["model"], "dont-touch-me");
}

#[tokio::test]
async fn new_request_uses_new_revision() {
    let p1 = make_pool("p1", "first-model", "gpt-4o", true, vec!["acc-1"]);
    let routes_v1 = validate_and_build_routes(&[p1.clone()], None).expect("v1");
    let registry = Arc::new(RwLock::new(Arc::new(PoolRegistrySnapshot {
        revision: 1,
        routes: routes_v1,
    })));

    let client = ClientContext::unrestricted();

    // v1 does not have "second-model"
    let snap_v1 = registry.read().await.clone();
    assert!(resolve_route(&snap_v1, &client, "second-model").is_err());

    // Update to v2 with "second-model" added
    let p2 = make_pool("p2", "second-model", "o1", true, vec!["acc-2"]);
    let routes_v2 = validate_and_build_routes(&[p1, p2], None).expect("v2");
    *registry.write().await = Arc::new(PoolRegistrySnapshot {
        revision: 2,
        routes: routes_v2,
    });

    // New request reads v2 and succeeds
    let snap_v2 = registry.read().await.clone();
    let res = resolve_route(&snap_v2, &client, "second-model").expect("resolved under v2");
    assert_eq!(res.upstream_model_id, "o1");
    assert_eq!(snap_v2.revision, 2);
}
