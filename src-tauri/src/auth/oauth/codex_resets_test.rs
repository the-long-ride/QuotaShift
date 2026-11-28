use chrono::{DateTime, TimeZone, Utc};
use serde_json::json;

use super::policy::{apply_codex_fetch_err, apply_codex_fetch_ok, should_fetch_codex};
use super::CodexResetDiskCache;
use crate::system::retry_after::{load_json_cache, save_json_cache};

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 27, 12, 0, 0).unwrap()
}

#[test]
fn ttl_sharp_drop_and_expired_grant_trigger_refresh() {
    let mut store = CodexResetDiskCache::default();
    let t = now().timestamp();
    let data = json!({
        "available_count": 1,
        "credits": [{ "status": "available", "expires_at": "2026-11-27T14:00:00Z" }]
    });
    apply_codex_fetch_ok(&mut store, "acct-1", data, Some(85.0), t);
    let e = store.entries.get("acct-1");
    // Reused within 3h (10,800s) before grant expiry.
    assert!(!should_fetch_codex(e, None, Some(85.0), t + 3_600, false));
    // Grant expired at 14:00Z (+7200s) triggers refresh early.
    assert!(should_fetch_codex(e, None, Some(85.0), t + 7_200, false));
    // Sharp drop >=80% -> <=20% triggers refresh early.
    assert!(should_fetch_codex(e, None, Some(15.0), t + 60, false));
    // With a non-expiring grant, TTL boundary is exact at 10,800s.
    apply_codex_fetch_ok(
        &mut store,
        "acct-2",
        json!({ "available_count": 1, "credits": [{ "status": "available", "expires_at": "2026-12-01T00:00:00Z" }] }),
        Some(40.0),
        t,
    );
    let e2 = store.entries.get("acct-2");
    assert!(!should_fetch_codex(e2, None, Some(40.0), t + 10_799, false));
    assert!(should_fetch_codex(e2, None, Some(40.0), t + 10_800, false));
}

#[test]
fn http_429_preserves_stale_prunes_expired_and_trips_circuit() {
    let mut store = CodexResetDiskCache::default();
    let t0 = now();
    let data = json!({
        "available_count": 2,
        "credits": [
            { "status": "available", "expires_at": "2026-11-27T11:00:00Z" },
            { "status": "available", "expires_at": "2026-12-01T00:00:00Z" }
        ]
    });
    apply_codex_fetch_ok(&mut store, "a1", data, Some(50.0), t0.timestamp());
    let r1 = apply_codex_fetch_err(&mut store, "a1", Some(429), Some("0"), t0);
    assert!(r1.stale && r1.rate_limited);
    assert_eq!(r1.retry_after_at, Some(t0.timestamp() + 900));
    assert_eq!(r1.data.as_ref().unwrap()["available_count"], 1);
    assert!(!should_fetch_codex(
        None,
        store.provider_circuit_until,
        None,
        t0.timestamp() + 599,
        true
    ));
    let r2 = apply_codex_fetch_err(&mut store, "a1", Some(429), None, t0);
    assert_eq!(r2.retry_after_at, Some(t0.timestamp() + 1_800));
    assert_eq!(r2.into_rate_limit_value().unwrap()["stale"], true);
}

#[test]
fn disk_cache_roundtrip_is_token_free() {
    let path = std::env::temp_dir().join(format!("qs-cx-reset-{}.json", std::process::id()));
    let mut store = CodexResetDiskCache::default();
    apply_codex_fetch_ok(
        &mut store,
        "acct-x",
        json!({"available_count": 1}),
        None,
        100,
    );
    apply_codex_fetch_err(&mut store, "acct-x", Some(429), Some("1200"), now());
    save_json_cache(&path, &store);
    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(!raw.contains("accessToken") && !raw.contains("refreshToken"));
    let loaded: CodexResetDiskCache = load_json_cache(&path);
    assert_eq!(loaded.entries["acct-x"].consecutive_429s, 1);
    assert!(loaded.provider_circuit_until.is_some());
    let _ = std::fs::remove_file(&path);
}

#[test]
fn definitive_4xx_caches_for_full_ttl_without_rate_limiting() {
    let mut store = CodexResetDiskCache::default();
    let t0 = now();
    let res = apply_codex_fetch_err(&mut store, "free-acct", Some(403), None, t0);
    assert!(!res.rate_limited);
    assert_eq!(res.retry_after_at, None);
    assert!(store.provider_circuit_until.is_none());
    let entry = store.entries.get("free-acct").unwrap();
    assert!(!should_fetch_codex(
        Some(entry),
        None,
        None,
        t0.timestamp() + 10_799,
        false
    ));
    assert!(should_fetch_codex(
        Some(entry),
        None,
        None,
        t0.timestamp() + 10_800,
        false
    ));
}

#[test]
fn cache_key_hashes_account_id_and_jwt_sub() {
    use base64::Engine;
    let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(r#"{"sub":"auth0|sensitive-user-sub-999"}"#);
    let jwt = format!("hdr.{payload}.sig");

    let by_sub = super::cache_key(None, &jwt);
    assert_eq!(by_sub.len(), 16);
    assert!(!by_sub.contains("sensitive-user-sub"));

    let by_aid = super::cache_key(Some("ws-uuid-raw-123"), &jwt);
    assert_eq!(by_aid.len(), 16);
    assert!(!by_aid.contains("ws-uuid-raw-123"));
    assert_ne!(by_aid, by_sub);
}
