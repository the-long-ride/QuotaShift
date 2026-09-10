use super::*;
use base64::Engine;

fn jwt_with_exp(exp: i64) -> String {
    let payload = serde_json::json!({"exp": exp});
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(serde_json::to_vec(&payload).unwrap());
    format!("header.{}.signature", encoded)
}

#[test]
fn refresh_decision_uses_five_minute_safety_window() {
    let now = 1_700_000_000;
    assert!(!oauth_token_needs_refresh(&jwt_with_exp(now + 301), now));
    assert!(oauth_token_needs_refresh(&jwt_with_exp(now + 300), now));
    assert!(oauth_token_needs_refresh("", now));
    assert!(!oauth_token_needs_refresh("not-a-jwt", now));
}

#[test]
fn refresh_merge_preserves_unknown_fields_and_existing_optional_tokens() {
    let mut auth = serde_json::json!({
        "auth_mode": "chatgpt",
        "custom": {"keep": true},
        "tokens": {
            "access_token": "old",
            "refresh_token": "old-refresh",
            "id_token": "old-id",
            "account_id": "account-1",
            "custom_token_field": 42
        }
    });

    merge_refresh_response(
        &mut auth,
        &serde_json::json!({"access_token": "new-access"}),
        "2026-07-21T00:00:00Z",
    )
    .unwrap();

    assert_eq!(
        auth.pointer("/custom/keep").and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        auth.pointer("/tokens/access_token").and_then(Value::as_str),
        Some("new-access")
    );
    assert_eq!(
        auth.pointer("/tokens/refresh_token")
            .and_then(Value::as_str),
        Some("old-refresh")
    );
    assert_eq!(
        auth.pointer("/tokens/id_token").and_then(Value::as_str),
        Some("old-id")
    );
    assert_eq!(
        auth.pointer("/tokens/account_id").and_then(Value::as_str),
        Some("account-1")
    );
    assert_eq!(
        auth.pointer("/tokens/custom_token_field")
            .and_then(Value::as_i64),
        Some(42)
    );
    assert_eq!(
        auth.get("last_refresh").and_then(Value::as_str),
        Some("2026-07-21T00:00:00Z")
    );
}
