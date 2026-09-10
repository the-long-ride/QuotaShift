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
