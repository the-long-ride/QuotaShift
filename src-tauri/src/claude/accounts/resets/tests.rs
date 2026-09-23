use chrono::{DateTime, TimeZone, Utc};
use serde_json::json;

use super::client::{access_token_from_credentials, parse_cli_version};
use super::parse::{parse_reset_credits, should_reuse, ClaudeResetCredits, CACHE_TTL_SECS};

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 23, 12, 0, 0).unwrap()
}

#[test]
fn sums_live_grants_and_reports_the_nearest_expiry() {
    let body = json!({
        "cedar_ember": {
            "eligible": true,
            "grants": [
                { "id": "g1", "resets_left": 1, "ends_at": "2026-10-22T23:59:00Z" },
                { "id": "g2", "resets_left": 2, "ends_at": "2026-10-01T10:00:00Z" },
                { "id": "g3", "resets_left": 1 }
            ]
        }
    });
    let result = parse_reset_credits(&body, now());
    assert_eq!(result.status, "available");
    assert_eq!(result.count, Some(4));
    assert_eq!(result.grants.len(), 3);
    assert_eq!(result.grants[0].resets_left, 1);
    assert_eq!(
        result.grants[0].expires_at.as_deref(),
        Some("2026-10-22T23:59:00Z")
    );
    assert_eq!(result.grants[2].expires_at, None);
    assert_eq!(
        result.nearest_expires_at.as_deref(),
        Some("2026-10-01T10:00:00Z")
    );
    assert_eq!(result.reason, None);
    assert_eq!(result.fetched_at, now().timestamp());
}

#[test]
fn skips_paused_expired_empty_and_malformed_grants() {
    let body = json!({
        "cedar_ember": {
            "eligible": true,
            "grants": [
                { "id": "paused", "resets_left": 3, "paused": true },
                { "id": "expired", "resets_left": 3, "ends_at": "2026-09-01T00:00:00Z" },
                { "id": "empty", "resets_left": 0, "ends_at": "2026-09-30T00:00:00Z" },
                { "id": "bad-date", "resets_left": 3, "ends_at": "soon" },
                { "id": "no-count" },
                "not-an-object",
                { "id": "live", "resets_left": 1, "ends_at": "2026-10-22T23:59:00Z" }
            ]
        }
    });
    let result = parse_reset_credits(&body, now());
    assert_eq!(result.status, "available");
    assert_eq!(result.count, Some(1));
    assert_eq!(result.grants.len(), 1);
    assert_eq!(result.grants[0].resets_left, 1);
    assert_eq!(
        result.nearest_expires_at.as_deref(),
        Some("2026-10-22T23:59:00Z")
    );
}

#[test]
fn zero_live_resets_is_none() {
    let body = json!({ "cedar_ember": { "eligible": true, "grants": [] } });
    let result = parse_reset_credits(&body, now());
    assert_eq!(result.status, "none");
    assert_eq!(result.count, Some(0));
    assert!(result.grants.is_empty());
    assert_eq!(result.nearest_expires_at, None);
}

#[test]
fn ineligible_accounts_keep_the_reason() {
    let body = json!({ "cedar_ember": { "eligible": false, "ineligible_reason": "surface" } });
    let result = parse_reset_credits(&body, now());
    assert_eq!(result.status, "ineligible");
    assert_eq!(result.count, None);
    assert_eq!(result.reason.as_deref(), Some("surface"));
}

#[test]
fn missing_reset_data_is_unavailable() {
    for body in [
        json!({}),
        json!({ "cedar_ember": null }),
        json!({ "cedar_ember": 3 }),
    ] {
        let result = parse_reset_credits(&body, now());
        assert_eq!(result.status, "unavailable");
        assert_eq!(result.reason.as_deref(), Some("no_reset_data"));
    }
}

#[test]
fn cache_is_reused_within_ttl_and_force_only_after_cooldown() {
    let t = 1_000_000;
    assert!(should_reuse(t, t + CACHE_TTL_SECS - 1, false));
    assert!(!should_reuse(t, t + CACHE_TTL_SECS, false));
    assert!(should_reuse(t, t + 59, true));
    assert!(!should_reuse(t, t + 60, true));
    assert!(
        !should_reuse(t, t - 5, false),
        "clock going backwards must refetch"
    );
}

#[test]
fn access_token_requires_a_live_token() {
    let now_ms = now().timestamp_millis();
    let live = json!({ "claudeAiOauth": { "accessToken": "abc", "expiresAt": now_ms + 60_000 } });
    assert_eq!(
        access_token_from_credentials(&live, now_ms),
        Ok("abc".to_string())
    );

    let no_expiry = json!({ "claudeAiOauth": { "accessToken": "abc" } });
    assert_eq!(
        access_token_from_credentials(&no_expiry, now_ms),
        Ok("abc".to_string())
    );

    let expired = json!({ "claudeAiOauth": { "accessToken": "abc", "expiresAt": now_ms - 1 } });
    assert_eq!(
        access_token_from_credentials(&expired, now_ms),
        Err("token_expired")
    );

    let empty = json!({ "claudeAiOauth": { "accessToken": "" } });
    assert_eq!(
        access_token_from_credentials(&empty, now_ms),
        Err("no_access_token")
    );

    assert_eq!(
        access_token_from_credentials(&json!({}), now_ms),
        Err("no_oauth")
    );
}

#[test]
fn parses_the_installed_cli_version() {
    assert_eq!(
        parse_cli_version("2.1.40 (Claude Code)\n"),
        Some("2.1.40".to_string())
    );
    assert_eq!(
        parse_cli_version("claude v1.0.3"),
        Some("1.0.3".to_string())
    );
    assert_eq!(parse_cli_version("not installed"), None);
    assert_eq!(parse_cli_version(""), None);
}

#[test]
fn serialized_result_is_camel_case_and_token_free() {
    let result = ClaudeResetCredits::unavailable("token_expired", now());
    let serialized = serde_json::to_string(&result).unwrap();
    assert!(serialized.contains("\"nearestExpiresAt\":null"));
    assert!(serialized.contains("\"fetchedAt\":"));
    assert!(!serialized.contains("accessToken"));
}
