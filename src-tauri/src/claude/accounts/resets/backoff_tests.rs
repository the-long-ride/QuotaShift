use chrono::{DateTime, TimeZone, Utc};
use serde_json::json;

use super::client::FetchResetsError;
use super::parse::{
    parse_reset_credits, parse_reset_credits_outcome, ClaudeResetCredits, CACHE_TTL_SECS,
};
use super::{
    build_cached_outcome, record_remote_outcome, should_reuse_entry, CachedResetCredits,
    ClaudeResetDiskCache, PROVIDER_CIRCUIT_BREAKER_SECS,
};
use crate::system::retry_after::{load_json_cache, save_json_cache};

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 27, 12, 0, 0).unwrap()
}

fn err_429(retry_after: Option<&str>) -> FetchResetsError {
    FetchResetsError {
        reason: "http_429".to_string(),
        status: Some(429),
        retry_after: retry_after.map(str::to_string),
    }
}

#[test]
fn parses_piggybacked_five_hour_and_seven_day_windows() {
    let body = json!({
        "five_hour": { "utilization": 42.5, "resets_at": "2026-11-27T17:00:00Z" },
        "seven_day": { "utilization": 18.0, "resets_at": 1796299200 },
        "cedar_ember": {
            "eligible": true,
            "grants": [{ "resets_left": 1, "ends_at": "2026-12-10T00:00:00Z" }]
        }
    });
    let outcome = parse_reset_credits_outcome(&body, now());
    assert_eq!(outcome.credits.count, Some(1));
    assert_eq!(
        outcome.five_hour.as_ref().and_then(|w| w.used_percentage),
        Some(42.5)
    );
    assert_eq!(
        outcome.five_hour.as_ref().and_then(|w| w.resets_at),
        Some(
            Utc.with_ymd_and_hms(2026, 11, 27, 17, 0, 0)
                .unwrap()
                .timestamp()
        )
    );
    assert_eq!(
        outcome.seven_day.as_ref().and_then(|w| w.used_percentage),
        Some(18.0)
    );
    assert_eq!(
        outcome.seven_day.as_ref().and_then(|w| w.resets_at),
        Some(1796299200)
    );
}

#[test]
fn http_429_preserves_last_valid_count_prunes_expired_and_backs_off() {
    let mut store = ClaudeResetDiskCache::default();
    let t0 = now();
    let body = json!({
        "cedar_ember": {
            "eligible": true,
            "grants": [
                { "resets_left": 2, "ends_at": "2026-11-27T13:00:00Z" },
                { "resets_left": 1, "ends_at": "2026-12-10T00:00:00Z" }
            ]
        }
    });
    let initial = parse_reset_credits_outcome(&body, t0);
    record_remote_outcome(&mut store, "p1", Some(10), t0, Ok(initial), None);

    // 2 hours later, first grant expired; remote returns 429 with Retry-After: 0.
    let t1 = t0 + chrono::Duration::hours(2);
    let r1 = record_remote_outcome(
        &mut store,
        "p1",
        Some(10),
        t1,
        Err(err_429(Some("0"))),
        None,
    );
    assert_eq!(r1.credits.status, "available");
    assert_eq!(r1.credits.count, Some(1));
    assert!(r1.credits.stale);
    assert_eq!(r1.credits.reason.as_deref(), Some("http_429"));
    assert_eq!(r1.credits.retry_after_at, Some(t1.timestamp() + 900));
    assert_eq!(
        store.provider_circuit_until,
        Some(t1.timestamp() + PROVIDER_CIRCUIT_BREAKER_SECS)
    );

    // Consecutive 429 doubles backoff to 1800s -> 3600s -> 7200s -> 14400s.
    let r2 = record_remote_outcome(&mut store, "p1", Some(10), t1, Err(err_429(None)), None);
    assert_eq!(r2.credits.retry_after_at, Some(t1.timestamp() + 1_800));
    let r3 = record_remote_outcome(&mut store, "p1", Some(10), t1, Err(err_429(None)), None);
    assert_eq!(r3.credits.retry_after_at, Some(t1.timestamp() + 3_600));
    let r4 = record_remote_outcome(&mut store, "p1", Some(10), t1, Err(err_429(None)), None);
    assert_eq!(r4.credits.retry_after_at, Some(t1.timestamp() + 7_200));
    let r5 = record_remote_outcome(&mut store, "p1", Some(10), t1, Err(err_429(None)), None);
    assert_eq!(r5.credits.retry_after_at, Some(t1.timestamp() + 14_400));
}

#[test]
fn mtime_bump_never_clears_fresh_cache_or_active_429_cooldown() {
    let t = now().timestamp();
    let avail = parse_reset_credits(
        &json!({ "cedar_ember": { "eligible": true, "grants": [{ "resets_left": 1 }] } }),
        now(),
    );
    let fresh = CachedResetCredits {
        credits: avail.clone(),
        credentials_mtime: Some(100),
        last_valid: Some(avail.clone()),
        retry_after_at: None,
        consecutive_429s: 0,
        five_hour: None,
        seven_day: None,
    };
    assert!(should_reuse_entry(&fresh, Some(200), t + 60, false));
    assert!(should_reuse_entry(
        &fresh,
        Some(200),
        t + CACHE_TTL_SECS - 1,
        false
    ));

    let backed_off = CachedResetCredits {
        credits: avail.with_stale(now(), "http_429", Some(t + 900)),
        credentials_mtime: Some(100),
        last_valid: Some(avail),
        retry_after_at: Some(t + 900),
        consecutive_429s: 1,
        five_hour: None,
        seven_day: None,
    };
    // Neither mtime change nor force=true can bypass an active 429 cooldown.
    assert!(should_reuse_entry(&backed_off, Some(200), t + 120, true));
    assert!(!should_reuse_entry(&backed_off, Some(200), t + 900, false));
}

#[test]
fn desktop_leveldb_fallback_serves_fresh_count_during_429_backoff() {
    let t = now();
    let stale_entry = CachedResetCredits {
        credits: ClaudeResetCredits::unavailable("http_429", t),
        credentials_mtime: Some(10),
        last_valid: None,
        retry_after_at: Some(t.timestamp() + 900),
        consecutive_429s: 1,
        five_hour: None,
        seven_day: None,
    };
    let desktop = parse_reset_credits(
        &json!({ "cedar_ember": { "eligible": true, "grants": [{ "resets_left": 3 }] } }),
        t,
    );
    let outcome = build_cached_outcome(&stale_entry, None, t, Some(desktop));
    assert_eq!(outcome.credits.status, "available");
    assert_eq!(outcome.credits.count, Some(3));
    assert!(!outcome.credits.stale);
}

#[test]
fn disk_cache_roundtrip_persists_backoff_and_stays_token_free() {
    let path = std::env::temp_dir().join(format!("qs-cl-reset-{}.json", std::process::id()));
    let mut store = ClaudeResetDiskCache::default();
    let t0 = now();
    let initial = parse_reset_credits_outcome(
        &json!({ "cedar_ember": { "eligible": true, "grants": [{ "resets_left": 2 }] } }),
        t0,
    );
    record_remote_outcome(&mut store, "prof-a", Some(7), t0, Ok(initial), None);
    record_remote_outcome(
        &mut store,
        "prof-a",
        Some(7),
        t0,
        Err(err_429(Some("1200"))),
        None,
    );
    save_json_cache(&path, &store);

    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(!raw.contains("accessToken") && !raw.contains("refreshToken"));

    let loaded: ClaudeResetDiskCache = load_json_cache(&path);
    let entry = &loaded.entries["prof-a"];
    assert_eq!(entry.consecutive_429s, 1);
    assert_eq!(entry.retry_after_at, Some(t0.timestamp() + 1_200));
    assert_eq!(entry.last_valid.as_ref().and_then(|c| c.count), Some(2));
    assert!(loaded.provider_circuit_until.is_some());

    let _ = std::fs::remove_file(&path);
}
