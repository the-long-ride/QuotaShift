use super::*;
use chrono::TimeZone;

fn observed_at() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 7, 21, 7, 0, 0).unwrap()
}

#[test]
fn grouped_payload_emits_two_pools() {
    let value = serde_json::json!({
        "response": {"groups": [
            {"displayName": "Gemini Models", "buckets": [
                {"bucketId": "5h", "remainingFraction": 0.8, "windowMinutes": 300},
                {"bucketId": "weekly", "remainingFraction": 0.4, "windowMinutes": 10080}
            ]},
            {"displayName": "Claude and GPT Models", "buckets": [
                {"bucketId": "5h", "remainingFraction": 0.6, "windowSeconds": 18000},
                {"bucketId": "weekly", "remainingFraction": 0.3, "limit_window_seconds": 604800}
            ]}
        ]}
    });
    let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
    assert_eq!(result.quotas.len(), 2);
    assert_eq!(result.quotas[0].display_name, "Gemini Models");
    assert_eq!(result.quotas[0].weekly_percent, Some(40));
    assert_eq!(result.quotas[1].display_name, "Claude & OpenAI Models");
    assert_eq!(result.quotas[1].weekly_percent, Some(30));
}

#[test]
fn weekly_window_from_10080_minutes() {
    let value = serde_json::json!({"modelBuckets": [
        {"modelId": "gemini-3-pro", "remainingFraction": 0.25, "windowMinutes": 10080}
    ]});
    let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
    assert_eq!(result.quotas[0].weekly_percent, Some(25));
    assert_eq!(result.quotas[0].five_hour_percent, None);
}

#[test]
fn unknown_single_bucket_does_not_populate_weekly_lane() {
    let value = serde_json::json!({"modelBuckets": [
        {"modelId": "gemini-3-pro", "remainingFraction": 0.75}
    ]});
    let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
    assert_eq!(result.quotas[0].five_hour_percent, Some(75));
    assert_eq!(result.quotas[0].weekly_percent, None);
}

#[test]
fn multiple_unknown_verified_buckets_only_override_current_lane() {
    let available = serde_json::json!({"models": {
        "gemini-3-pro": {"quotaInfo": {"remainingFraction": 1.0}},
        "gemini-3-flash": {"quotaInfo": {"remainingFraction": 1.0}}
    }});
    let verified = serde_json::json!({"modelBuckets": [
        {"modelId": "gemini-3-pro", "remainingFraction": 0.7},
        {"modelId": "gemini-3-flash", "remainingFraction": 0.25}
    ]});
    let result = aggregate_antigravity_quotas(Some(&available), Some(&verified), observed_at());
    assert_eq!(result.quotas[0].five_hour_percent, Some(25));
    assert_eq!(result.quotas[0].weekly_percent, None);
}

#[test]
fn duplicate_models_select_lowest_percentage() {
    let value = serde_json::json!({"modelBuckets": [
        {"modelId": "gemini-3-pro", "remainingFraction": 0.8, "windowMinutes": 300},
        {"modelId": "gemini-3-flash", "remainingFraction": 0.2, "windowMinutes": 300}
    ]});
    let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
    assert_eq!(result.quotas[0].five_hour_percent, Some(20));
}

#[test]
fn reset_time_can_infer_weekly_window() {
    let value = serde_json::json!({"modelBuckets": [
        {"modelId": "claude-sonnet", "remainingFraction": 0.5, "resetTime": "2026-07-27T07:00:00Z"}
    ]});
    let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
    assert_eq!(result.quotas[0].weekly_percent, Some(50));
}

#[test]
fn unknown_models_are_excluded() {
    let value = serde_json::json!({"modelBuckets": [
        {"modelId": "mystery-model", "remainingFraction": 0.5, "windowMinutes": 300}
    ]});
    let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
    assert!(result.quotas.is_empty());
}

#[test]
fn available_catalog_excludes_stale_unavailable_pool() {
    let available = serde_json::json!({"models": {
        "gemini-pro": {"displayName": "Gemini Pro"},
        "claude-internal": {"isInternal": true}
    }});
    let user = serde_json::json!({"groups": [
        {"displayName": "Gemini Models", "buckets": [
            {"remainingFraction": 0.8, "windowMinutes": 300},
            {"remainingFraction": 0.4, "windowMinutes": 10080}
        ]},
        {"displayName": "Claude and GPT Models", "buckets": [
            {"remainingFraction": 0.6, "windowMinutes": 300}
        ]}
    ]});
    let result = aggregate_antigravity_quotas(Some(&available), Some(&user), observed_at());
    assert_eq!(result.quotas.len(), 1);
    assert_eq!(result.quotas[0].model_id, "gemini_pool");
    assert_eq!(result.quotas[0].weekly_percent, Some(40));
}

#[test]
fn empty_catalog_is_authoritative_but_missing_catalog_preserves_quota_pools() {
    let user = serde_json::json!({"modelBuckets": [
        {"modelId": "claude-sonnet", "remainingFraction": 0.6}
    ]});
    let empty = serde_json::json!({"models": {}});
    assert!(
        aggregate_antigravity_quotas(Some(&empty), Some(&user), observed_at())
            .quotas
            .is_empty()
    );
    assert_eq!(
        aggregate_antigravity_quotas(None, Some(&user), observed_at())
            .quotas
            .len(),
        1
    );
}

#[test]
fn pro_account_with_argon_weekly_bucket_emits_three_pools() {
    let available = serde_json::json!({"models": {
        "gemini-3-pro": {"displayName": "Gemini 3 Pro", "quotaInfo": {"remainingFraction": 0.8}},
        "claude-sonnet": {"displayName": "Claude Sonnet", "quotaInfo": {"remainingFraction": 0.6}},
        "gemini-4-argon": {"displayName": "Gemini 4 Argon", "quotaInfo": {"remainingFraction": 0.75}}
    }});
    let user = serde_json::json!({"groups": [
        {"displayName": "Gemini Models", "buckets": [
            {"bucketId": "gemini-5h", "remainingFraction": 0.8, "windowMinutes": 300},
            {"bucketId": "gemini-weekly", "remainingFraction": 0.4, "windowMinutes": 10080}
        ]},
        {"displayName": "Claude and GPT Models", "buckets": [
            {"bucketId": "3p-5h", "remainingFraction": 0.6, "windowMinutes": 300},
            {"bucketId": "3p-weekly", "remainingFraction": 0.3, "windowMinutes": 10080}
        ]},
        {"displayName": "Argon Models", "buckets": [
            {"bucketId": "argon-weekly", "remainingFraction": 0.75, "windowMinutes": 10080}
        ]}
    ]});
    let result = aggregate_antigravity_quotas(Some(&available), Some(&user), observed_at());
    assert_eq!(result.quotas.len(), 3);
    assert_eq!(result.quotas[2].model_id, "argon_pool");
    assert_eq!(result.quotas[2].display_name, "Gemini 4 Argon");
    assert_eq!(result.quotas[2].five_hour_percent, None);
    assert_eq!(result.quotas[2].weekly_percent, Some(75));
}

#[test]
fn ultra_account_sharing_gemini_quota_for_argon_merges_into_two_pools() {
    let available = serde_json::json!({"models": {
        "gemini-3-pro": {
            "displayName": "Gemini 3 Pro",
            "quotaInfo": {"remainingFraction": 0.8, "resetTime": "2026-07-21T12:00:00Z"}
        },
        "gemini-4-argon": {
            "displayName": "Gemini 4 Argon",
            "quotaInfo": {"remainingFraction": 0.8, "resetTime": "2026-07-21T12:00:00Z"}
        },
        "claude-sonnet": {
            "displayName": "Claude Sonnet",
            "quotaInfo": {"remainingFraction": 0.6, "resetTime": "2026-07-21T12:00:00Z"}
        }
    }});
    let user = serde_json::json!({"groups": [
        {"displayName": "Gemini Models", "buckets": [
            {"bucketId": "gemini-5h", "remainingFraction": 0.8, "windowMinutes": 300, "resetTime": "2026-07-21T12:00:00Z"},
            {"bucketId": "gemini-weekly", "remainingFraction": 0.5, "windowMinutes": 10080, "resetTime": "2026-07-27T07:00:00Z"}
        ]},
        {"displayName": "Claude and GPT Models", "buckets": [
            {"bucketId": "3p-5h", "remainingFraction": 0.6, "windowMinutes": 300},
            {"bucketId": "3p-weekly", "remainingFraction": 0.3, "windowMinutes": 10080}
        ]}
    ]});
    let result = aggregate_antigravity_quotas(Some(&available), Some(&user), observed_at());
    assert_eq!(result.quotas.len(), 2);
    assert_eq!(result.quotas[0].display_name, "Gemini Models");
    assert_eq!(result.quotas[1].display_name, "Claude & OpenAI Models");
}

/// Shape captured read-only from a live Google AI Pro account on 2026-10-25.
#[test]
fn live_pro_summary_with_window_labels_maps_both_lanes() {
    let available = serde_json::json!({"models": {
        "gemini-3.8-flash-high": {"displayName": "Gemini 3.8 Flash (High)",
            "quotaInfo": {"remainingFraction": 0.96515435, "resetTime": "2026-10-25T14:37:43Z"}},
        "claude-sonnet-4-6": {"displayName": "Claude Sonnet 4.6 (Thinking)",
            "quotaInfo": {"remainingFraction": 1, "resetTime": "2026-10-25T14:53:43Z"}},
        "gpt-oss-120b-medium": {"displayName": "GPT-OSS 120B (Medium)",
            "quotaInfo": {"remainingFraction": 1, "resetTime": "2026-10-25T14:53:43Z"}},
        "chat_23310": {"quotaInfo": {"remainingFraction": 1}}
    }});
    let user = serde_json::json!({"groups": [
        {"displayName": "Gemini Models", "description": "Models within this group: Gemini Flash, Gemini Pro",
         "buckets": [
            {"bucketId": "gemini-weekly", "displayName": "Weekly Limit Remaining", "window": "weekly",
             "resetTime": "2026-11-01T09:37:43Z", "remainingFraction": 0.97996193,
             "description": "You have used some of your weekly limit, it will fully refresh in 6 days, 23 hours."},
            {"bucketId": "gemini-5h", "displayName": "Five Hour Limit Remaining", "window": "5h",
             "resetTime": "2026-10-25T14:37:43Z", "remainingFraction": 0.96139336,
             "description": "You have used some of your 5-hour limit, it will fully refresh in 4 hours, 43 minutes."}
        ]},
        {"displayName": "Claude and GPT models", "description": "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
         "buckets": [
            {"bucketId": "3p-weekly", "displayName": "Weekly Limit Remaining", "window": "weekly",
             "resetTime": "2026-11-01T09:53:44Z", "remainingFraction": 1},
            {"bucketId": "3p-5h", "displayName": "Five Hour Limit Remaining", "window": "5h",
             "resetTime": "2026-10-25T14:53:44Z", "remainingFraction": 1}
        ]}
    ]});
    let observed = Utc.with_ymd_and_hms(2026, 10, 25, 9, 54, 0).unwrap();
    let result = aggregate_antigravity_quotas(Some(&available), Some(&user), observed);
    let names: Vec<_> = result.quotas.iter().map(|q| q.model_id.as_str()).collect();
    assert_eq!(
        names,
        ["gemini_pool", "claude_gpt_pool"],
        "{:?}",
        result.diagnostics
    );
    let gemini = &result.quotas[0];
    assert_eq!(gemini.five_hour_percent, Some(96));
    assert_eq!(
        gemini.five_hour_reset.as_deref(),
        Some("2026-10-25T14:37:43Z")
    );
    assert_eq!(gemini.weekly_percent, Some(98));
    assert_eq!(gemini.weekly_reset.as_deref(), Some("2026-11-01T09:37:43Z"));
    let other = &result.quotas[1];
    assert_eq!(other.five_hour_percent, Some(100));
    assert_eq!(
        other.five_hour_reset.as_deref(),
        Some("2026-10-25T14:53:44Z")
    );
    assert_eq!(other.weekly_percent, Some(100));
    assert_eq!(other.weekly_reset.as_deref(), Some("2026-11-01T09:53:44Z"));
}

/// Live shape (2026-10-25): the weekly window resets before the five-hour one.
#[test]
fn weekly_bucket_resetting_before_five_hour_stays_weekly() {
    let available = serde_json::json!({"models": {
        "gemini-3.8-flash-high": {"displayName": "Gemini 3.8 Flash (High)",
            "quotaInfo": {"remainingFraction": 1, "resetTime": "2026-10-25T14:55:37Z"}},
        "claude-opus-5-5-high": {"displayName": "Claude Opus 5.5 (High)",
            "quotaInfo": {"remainingFraction": 1, "resetTime": "2026-10-25T14:55:37Z"}},
        "chat_23310": {"quotaInfo": {"remainingFraction": 1}, "isInternal": true}
    }});
    let user = serde_json::json!({"groups": [
        {"displayName": "Gemini Models", "description": "Models within this group: Gemini Flash, Gemini Pro",
         "buckets": [
            {"bucketId": "gemini-weekly", "displayName": "Weekly Limit Remaining", "window": "weekly",
             "resetTime": "2026-10-25T13:26:33Z", "remainingFraction": 0.6375428,
             "description": "You have used some of your weekly limit, it will fully refresh in 3 hours, 30 minutes."},
            {"bucketId": "gemini-5h", "displayName": "Five Hour Limit Remaining", "window": "5h",
             "resetTime": "2026-10-25T14:55:38Z", "remainingFraction": 1}
        ]},
        {"displayName": "Claude and GPT models", "description": "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
         "buckets": [
            {"bucketId": "3p-weekly", "displayName": "Weekly Limit Remaining", "window": "weekly",
             "resetTime": "2026-11-01T09:55:38Z", "remainingFraction": 1},
            {"bucketId": "3p-5h", "displayName": "Five Hour Limit Remaining", "window": "5h",
             "resetTime": "2026-10-25T14:55:38Z", "remainingFraction": 1}
        ]}
    ]});
    let observed = Utc.with_ymd_and_hms(2026, 10, 25, 9, 56, 0).unwrap();
    let result = aggregate_antigravity_quotas(Some(&available), Some(&user), observed);
    assert_eq!(result.quotas.len(), 2, "{:?}", result.diagnostics);
    let gemini = &result.quotas[0];
    assert_eq!(gemini.five_hour_percent, Some(100));
    assert_eq!(
        gemini.five_hour_reset.as_deref(),
        Some("2026-10-25T14:55:38Z")
    );
    assert_eq!(gemini.weekly_percent, Some(64));
    assert_eq!(gemini.weekly_reset.as_deref(), Some("2026-10-25T13:26:33Z"));
    assert_eq!(result.quotas[1].weekly_percent, Some(100));
    assert_eq!(result.quotas[1].five_hour_percent, Some(100));
}

/// Fresh Pro account captured read-only on 2026-10-25: Argon and Gemini both report 100% with
/// the same weekly reset, and the quota summary request failed.
#[test]
fn argon_stays_separate_when_the_summary_is_unavailable() {
    let available = serde_json::json!({"models": {
        "gemini-3.8-flash-high": {"displayName": "Gemini 3.8 Flash (High)",
            "quotaInfo": {"remainingFraction": 1, "resetTime": "2026-11-01T11:24:07Z"}},
        "gemini-4-argon-high": {"displayName": "Gemini 4 Argon (High)",
            "quotaInfo": {"remainingFraction": 1, "resetTime": "2026-11-01T11:24:07Z"}},
        "claude-sonnet-4-6": {"displayName": "Claude Sonnet 4.6 (Thinking)",
            "quotaInfo": {"remainingFraction": 1, "resetTime": "2026-11-01T11:24:07Z"}}
    }});
    let result = aggregate_antigravity_quotas(Some(&available), None, observed_at());
    let argon = result
        .quotas
        .iter()
        .find(|quota| quota.model_id == "argon_pool")
        .expect("Argon pool must not be merged into Gemini without a summary");
    assert_eq!(argon.display_name, "Gemini 4 Argon");
    assert_eq!(argon.weekly_percent, Some(100));
}

/// Pro account captured read-only on 2026-10-25 with the quota summary unavailable: Claude's
/// binding limit is weekly, Gemini's is five-hour.
#[test]
fn catalog_fallback_places_each_model_limit_in_its_own_lane() {
    let available = serde_json::json!({"models": {
        "gemini-3.8-flash-high": {"displayName": "Gemini 3.8 Flash (High)",
            "quotaInfo": {"remainingFraction": 0.9775215, "resetTime": "2026-07-21T09:55:36Z"}},
        "claude-sonnet-5-5-high": {"displayName": "Claude Sonnet 5.5 (High)",
            "quotaInfo": {"remainingFraction": 0.43295, "resetTime": "2026-07-27T22:59:52Z"}},
        "gemini-4-argon-high": {"displayName": "Gemini 4 Argon (High)",
            "quotaInfo": {"remainingFraction": 0.012279066, "resetTime": "2026-07-27T22:48:24Z"}}
    }});
    let result = aggregate_antigravity_quotas(Some(&available), None, observed_at());
    let pool = |id: &str| result.quotas.iter().find(|q| q.model_id == id).unwrap();
    assert_eq!(pool("gemini_pool").five_hour_percent, Some(98));
    assert_eq!(pool("gemini_pool").weekly_percent, None);
    assert_eq!(pool("claude_gpt_pool").five_hour_percent, None);
    assert_eq!(pool("claude_gpt_pool").weekly_percent, Some(43));
    assert_eq!(pool("argon_pool").weekly_percent, Some(1));
}
