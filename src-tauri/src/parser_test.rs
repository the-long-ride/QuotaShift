use super::parse_full_status;
use serde_json::json;

fn user_status(email: &str) -> serde_json::Value {
    json!({
        "userStatus": {
            "userInfo": { "email": email },
            "userTier": { "name": "standard-tier" }
        }
    })
}

#[test]
fn exact_groups_keep_five_hour_and_weekly_independent() {
    let summary = json!({
        "response": {
            "groups": [
                {
                    "displayName": "Gemini Models",
                    "buckets": [
                        { "bucketId": "gemini-5h", "window": "5h", "remainingFraction": 0.42, "resetTime": "five" },
                        { "bucketId": "gemini-week", "window": "weekly", "remainingFraction": 0.17, "resetTime": "week" }
                    ]
                },
                {
                    "displayName": "Claude and GPT Models",
                    "buckets": [
                        { "bucketId": "claude-5h", "limitWindowSeconds": 18000, "remainingFraction": 0.74 },
                        { "bucketId": "gpt-week", "limitWindowSeconds": 604800, "remainingFraction": 0.33 }
                    ]
                }
            ]
        }
    });

    let status = parse_full_status(user_status("user@example.com"), summary).unwrap();
    assert_eq!(status.quotas[0].five_hour_percent, Some(42));
    assert_eq!(status.quotas[0].weekly_percent, Some(17));
    assert_eq!(status.quotas[1].five_hour_percent, Some(74));
    assert_eq!(status.quotas[1].weekly_percent, Some(33));
}

#[test]
fn missing_percentage_in_recognized_lane_contributes_zero() {
    let summary = json!({
        "groups": [{
            "displayName": "Gemini Models",
            "buckets": [
                { "bucketId": "gemini-pro-5h", "window": "5h", "remainingFraction": 0.8 },
                { "bucketId": "gemini-flash-5h", "window": "5h", "isExhausted": true }
            ]
        }]
    });

    let status = parse_full_status(user_status("user@example.com"), summary).unwrap();
    assert_eq!(status.quotas[0].five_hour_percent, Some(0));
}

#[test]
fn missing_percentage_without_exhausted_flag_stays_unknown() {
    let summary = json!({
        "groups": [{
            "displayName": "Gemini Models",
            "buckets": [
                { "bucketId": "gemini-pro-5h", "window": "5h", "remainingFraction": 0.8 },
                { "bucketId": "gemini-flash-5h", "window": "5h" }
            ]
        }]
    });

    let status = parse_full_status(user_status("user@example.com"), summary).unwrap();
    assert_eq!(status.quotas[0].five_hour_percent, Some(80));
}

#[test]
fn unknown_window_is_not_copied_into_weekly() {
    let summary = json!({
        "groups": [{
            "displayName": "Gemini Models",
            "buckets": [{ "bucketId": "gemini-shared", "remainingFraction": 0.5 }]
        }]
    });

    let status = parse_full_status(user_status("user@example.com"), summary).unwrap();
    assert_eq!(status.quotas[0].five_hour_percent, None);
    assert_eq!(status.quotas[0].weekly_percent, None);
}
