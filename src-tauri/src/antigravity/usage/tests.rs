use super::*;

fn quota(
    model_id: &str,
    display_name: &str,
    remaining_fraction: f64,
    reset_at: Option<&str>,
) -> AntigravityModelQuota {
    AntigravityModelQuota {
        model_id: model_id.to_string(),
        display_name: display_name.to_string(),
        family: classify_family(model_id),
        remaining_fraction,
        remaining_percent: (remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32,
        reset_at: reset_at.map(str::to_string),
        five_hour_percent: None,
        five_hour_reset: None,
        five_hour_disabled: None,
        weekly_percent: None,
        weekly_reset: None,
        weekly_disabled: None,
    }
}

#[test]
fn all_full_detection_requires_every_quota_at_or_above_threshold() {
    assert!(!should_verify_full_quotas(&[]));
    assert!(should_verify_full_quotas(&[
        quota("gemini-a", "Gemini A", 0.999, None),
        quota("claude-b", "Claude B", 1.0, None),
    ]));
    assert!(!should_verify_full_quotas(&[
        quota("gemini-a", "Gemini A", 0.998, None),
        quota("claude-b", "Claude B", 1.0, None),
    ]));
}

#[test]
fn quota_summary_keeps_only_known_pool_bucket_ids() {
    let raw = serde_json::json!({
        "groups": [{
            "displayName": "anything",
            "buckets": [
                {"bucketId": "gemini-5h", "remainingFraction": 0.8},
                {"bucketId": "gemini-weekly", "remainingFraction": 0.7},
                {"bucketId": "3p-5h", "remainingFraction": 0.6},
                {"bucketId": "3p-weekly", "remainingFraction": 0.5},
                {"bucketId": "gemini-image-5h", "remainingFraction": 0.1}
            ]
        }]
    });
    let sanitized =
        sanitize_authoritative_quota_summary(&raw).expect("groups should be authoritative");
    let text = sanitized.to_string();
    assert!(text.contains("gemini-5h"));
    assert!(text.contains("gemini-weekly"));
    assert!(text.contains("3p-5h"));
    assert!(text.contains("3p-weekly"));
    assert!(!text.contains("gemini-image-5h"));
}

#[test]
fn empty_quota_summary_is_still_authoritative() {
    let raw = serde_json::json!({"groups": []});
    assert!(sanitize_authoritative_quota_summary(&raw).is_some());
}
