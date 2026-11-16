use chrono::{DateTime, TimeZone, Utc};
use serde_json::json;
use std::ffi::OsStr;
use std::path::Path;

use super::client::{access_token_from_credentials, cli_fallback_paths, parse_cli_version};
use super::desktop::scan_desktop_leveldb_dir;
use super::parse::{parse_reset_credits, should_reuse, ClaudeResetCredits, CACHE_TTL_SECS};
use super::{
    cache_ttl_secs, credentials_mtime, should_reuse_entry, CachedResetCredits,
    FAILURE_CACHE_TTL_SECS,
};

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
    let (now_ms, tok) = (now().timestamp_millis(), access_token_from_credentials);
    let live = json!({ "claudeAiOauth": { "accessToken": "abc", "expiresAt": now_ms + 60_000 } });
    assert_eq!(tok(&live, now_ms), Ok("abc".to_string()));
    let no_expiry = json!({ "claudeAiOauth": { "accessToken": "abc" } });
    assert_eq!(tok(&no_expiry, now_ms), Ok("abc".to_string()));
    let expired = json!({ "claudeAiOauth": { "accessToken": "abc", "expiresAt": now_ms - 1 } });
    assert_eq!(tok(&expired, now_ms), Err("token_expired"));
    let empty = json!({ "claudeAiOauth": { "accessToken": "" } });
    assert_eq!(tok(&empty, now_ms), Err("no_access_token"));
    assert_eq!(tok(&json!({}), now_ms), Err("no_oauth"));
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

#[test]
fn user_agent_keeps_the_cli_surface_the_endpoint_requires() {
    assert_eq!(
        super::client::user_agent("2.1.280"),
        "claude-cli/2.1.280 (external, cli)"
    );
}

#[test]
fn reset_grants_not_started_are_not_counted_as_available() {
    let body = json!({ "cedar_ember": { "eligible": true, "grants": [
        { "resets_left": 2, "starts_at": "2026-10-23T00:00:00Z", "ends_at": "2026-12-31T00:00:00Z" },
        { "resets_left": 1, "starts_at": "2026-09-22T00:00:00Z", "ends_at": "2026-12-31T00:00:00Z" }
    ]}});
    let result = parse_reset_credits(&body, now());
    assert_eq!(result.count, Some(1));
}

fn cached(credits: ClaudeResetCredits) -> CachedResetCredits {
    CachedResetCredits {
        credits,
        credentials_mtime: Some(100),
    }
}

fn assert_ttl(credits: ClaudeResetCredits, expected_ttl: i64) {
    assert_eq!(cache_ttl_secs(&credits), expected_ttl);
    let ts = now().timestamp();
    let entry = cached(credits);
    let (t1, t2) = (ts + expected_ttl - 1, ts + expected_ttl);
    assert!(should_reuse_entry(&entry, Some(100), t1, false));
    assert!(!should_reuse_entry(&entry, Some(100), t2, false));
}

#[test]
fn definitive_results_use_full_ttl_and_transient_errors_use_failure_ttl() {
    assert_eq!(CACHE_TTL_SECS, 1800);
    assert_eq!(FAILURE_CACHE_TTL_SECS, 90);
    let surface = ClaudeResetCredits {
        reason: Some("surface".to_string()),
        ..ClaudeResetCredits::unavailable("surface", now())
    };
    let avail = json!({ "cedar_ember": { "eligible": true, "grants": [{ "resets_left": 1 }] } });
    let empty = json!({ "cedar_ember": { "eligible": true, "grants": [] } });
    for credits in [
        parse_reset_credits(&avail, now()),
        parse_reset_credits(&empty, now()),
        surface,
    ] {
        assert_ttl(credits, CACHE_TTL_SECS);
    }
    for reason in [
        "token_expired",
        "cli_version_unknown",
        "network_error",
        "http_500",
        "http_429",
    ] {
        assert_ttl(
            ClaudeResetCredits::unavailable(reason, now()),
            FAILURE_CACHE_TTL_SECS,
        );
    }
}

#[test]
fn cache_invalidates_when_credentials_mtime_changes() {
    let entry = cached(ClaudeResetCredits::unavailable("token_expired", now()));
    let t = now().timestamp() + 10;
    assert!(!should_reuse_entry(&entry, Some(101), t, false));
    assert!(!should_reuse_entry(&entry, None, t, true));

    let temp = std::env::temp_dir().join(format!("quotashift-claude-mtime-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).unwrap();
    assert_eq!(credentials_mtime(&temp), None);
    std::fs::write(temp.join(".credentials.json"), "{}").unwrap();
    assert!(credentials_mtime(&temp).is_some());
    let _ = std::fs::remove_dir_all(&temp);
}

#[test]
fn cli_fallback_paths_include_expected_install_locations() {
    let home = Path::new("/tmp/test-home");
    let appdata = OsStr::new("C:\\Users\\test\\AppData\\Roaming");
    let paths = cli_fallback_paths(Some(home), Some(appdata));
    #[cfg(target_os = "windows")]
    {
        assert!(paths.contains(
            &Path::new("C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd").to_path_buf()
        ));
        assert!(paths.contains(&home.join(".local").join("bin").join("claude.exe")));
    }
    #[cfg(not(target_os = "windows"))]
    {
        assert!(paths.contains(&home.join(".local").join("bin").join("claude")));
        assert!(paths.contains(&Path::new("/usr/local/bin/claude").to_path_buf()));
        assert!(paths.contains(&Path::new("/opt/homebrew/bin/claude").to_path_buf()));
    }
}

#[test]
fn desktop_leveldb_fallback_verifies_email_and_parses_resets() {
    let base = std::env::temp_dir().join(format!("quotashift-desktop-ldb-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    std::fs::create_dir_all(&base).unwrap();
    let ts = now().timestamp();

    // Missing data returns None; non-ldb/log files (e.g. Cookies) are ignored.
    std::fs::write(
        base.join("Cookies"),
        b"alice@example.com {\"cedar_ember\":{\"eligible\":true,\"grants\":[{\"resets_left\":3}]}}",
    )
    .unwrap();
    assert_eq!(
        scan_desktop_leveldb_dir(&base, "alice@example.com", ts),
        None
    );

    // Same-account match (case-insensitive) extracts embedded cedar_ember JSON.
    let payload = b"\x00\x01email: Alice@Example.COM\x00{\"five_hour\":{\"utilization\":5},\"cedar_ember\":{\"eligible\":true,\"grants\":[{\"resets_left\":2,\"ends_at\":\"2026-10-01T10:00:00Z\"}]}}\x00";
    std::fs::write(base.join("000005.log"), payload).unwrap();
    let matched = scan_desktop_leveldb_dir(&base, "alice@example.com", ts).unwrap();
    assert_eq!(matched.status, "available");
    assert_eq!(matched.count, Some(2));

    // Mismatched or empty email is rejected.
    assert_eq!(scan_desktop_leveldb_dir(&base, "bob@example.com", ts), None);
    assert_eq!(scan_desktop_leveldb_dir(&base, "   ", ts), None);
    let _ = std::fs::remove_dir_all(&base);
}
