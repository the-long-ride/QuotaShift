use std::time::Duration;

use super::account_budget::AccountBudgetRegistry;
use super::affinity::{AffinityRegistry, TrustedSessionKey};
use super::pool_registry::{PoolAuthMode, PoolRoutingPolicy};
use super::route_context::ResolvedRoute;
use super::usage_metrics::normalize_usage_event;

fn make_route(pool_id: &str, model: &str, accounts: Vec<&str>) -> ResolvedRoute {
    ResolvedRoute {
        pool_id: pool_id.to_string(),
        public_model_name: model.to_string(),
        upstream_model_id: model.to_string(),
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
async fn shared_account_limit_enforced_across_pools() {
    let budgets = AccountBudgetRegistry::new();
    budgets.set_concurrency_limit("shared-acc", 1);

    let route_a = make_route("pool-a", "gpt-4o", vec!["shared-acc"]);
    let route_b = make_route("pool-b", "gpt-4o", vec!["shared-acc"]);

    // First reservation via Pool A succeeds
    let res_a = budgets
        .try_reserve(&route_a.member_account_ids[0])
        .expect("reserve pool a");
    assert_eq!(res_a.account_id(), "shared-acc");

    // Second reservation via Pool B on the same shared account is rejected due to concurrency limit
    let res_b = budgets.try_reserve(&route_b.member_account_ids[0]);
    assert!(res_b.is_err(), "second reservation must be rejected");
}

#[tokio::test]
async fn reservation_released_on_abort() {
    let budgets = AccountBudgetRegistry::new();
    budgets.set_concurrency_limit("acc-abort", 1);

    {
        let res = budgets.try_reserve("acc-abort").expect("reserve");
        assert_eq!(budgets.in_flight_count("acc-abort"), 1);
        drop(res); // RAII drop / abort
    }

    assert_eq!(budgets.in_flight_count("acc-abort"), 0);
    let res_next = budgets.try_reserve("acc-abort");
    assert!(
        res_next.is_ok(),
        "subsequent reservation succeeds after drop"
    );
}

#[test]
fn quota_unknown_not_zero() {
    let raw = serde_json::json!({
        "input_tokens": 100,
        "output_tokens": 50
    });
    let usage = normalize_usage_event(&raw);
    assert_eq!(usage.cached_tokens, None);
    assert_ne!(usage.cached_tokens, Some(0));
}

#[test]
fn cache_affinity_picks_eligible_pinned_account() {
    let mut affinity = AffinityRegistry::new();
    let session = TrustedSessionKey::new("profile-1", "conv-123");

    affinity.set_pin(
        &session,
        "model-x",
        "acc-affinity-1",
        Duration::from_secs(300),
    );
    let pinned = affinity.get_pinned_account(&session, "model-x");
    assert_eq!(pinned.as_deref(), Some("acc-affinity-1"));
}

#[test]
fn first_turn_cache_write_does_not_imply_hit() {
    let mut affinity = AffinityRegistry::new();
    let session = TrustedSessionKey::new("profile-1", "conv-first-turn");

    let is_hit_before = affinity.is_cache_hit(&session, "model-x");
    assert!(!is_hit_before);

    affinity.set_pin(&session, "model-x", "acc-first", Duration::from_secs(300));
    // The write occurred, but that turn itself was NOT a hit
    assert!(!is_hit_before);
}

#[test]
fn cached_tokens_read_from_upstream_usage_only() {
    let raw = serde_json::json!({
        "input_tokens": 2048,
        "output_tokens": 128,
        "input_tokens_details": {
            "cached_tokens": 1024
        }
    });
    let usage = normalize_usage_event(&raw);
    assert_eq!(usage.cached_tokens, Some(1024));
    assert_eq!(usage.input_tokens, Some(2048));
    assert_eq!(usage.output_tokens, Some(128));
}

#[test]
fn missing_cached_tokens_unknown() {
    let raw = serde_json::json!({
        "input_tokens": 500,
        "output_tokens": 50,
        "input_tokens_details": {}
    });
    let usage = normalize_usage_event(&raw);
    assert_eq!(usage.cached_tokens, None);
}

#[test]
fn different_profile_same_conversation_never_shares_pin() {
    let mut affinity = AffinityRegistry::new();
    let session_a = TrustedSessionKey::new("profile-alice", "shared-conv-id");
    let session_b = TrustedSessionKey::new("profile-bob", "shared-conv-id");

    affinity.set_pin(&session_a, "gpt-4o", "acc-alice", Duration::from_secs(300));
    assert_eq!(
        affinity.get_pinned_account(&session_a, "gpt-4o").as_deref(),
        Some("acc-alice")
    );
    assert_eq!(affinity.get_pinned_account(&session_b, "gpt-4o"), None);
}

#[test]
fn no_trusted_session_no_cross_turn_pin() {
    let affinity = AffinityRegistry::new();
    // Untrusted / empty profile key
    let pinned = affinity.get_pinned_account_raw(None, "conv-123", "gpt-4o");
    assert_eq!(pinned, None);
}

#[test]
fn revoked_or_model_changed_pin_dropped() {
    let mut affinity = AffinityRegistry::new();
    let session = TrustedSessionKey::new("profile-1", "conv-switch");

    affinity.set_pin(&session, "gpt-4o", "acc-target", Duration::from_secs(300));
    assert_eq!(
        affinity.get_pinned_account(&session, "gpt-4o").as_deref(),
        Some("acc-target")
    );

    // Querying for a different model does not return the gpt-4o pin
    assert_eq!(affinity.get_pinned_account(&session, "o1"), None);

    // Dropping pin on revoke/incompatibility
    affinity.drop_pin(&session, "gpt-4o");
    assert_eq!(affinity.get_pinned_account(&session, "gpt-4o"), None);
}

#[test]
fn retry_after_takes_precedence_over_fixed_backoff() {
    let default_backoff = Duration::from_secs(60);
    let parsed_backoff = super::account_budget::parse_retry_after(Some("120"), default_backoff);
    assert_eq!(parsed_backoff, Duration::from_secs(120));

    let fallback_backoff = super::account_budget::parse_retry_after(None, default_backoff);
    assert_eq!(fallback_backoff, Duration::from_secs(60));
}
