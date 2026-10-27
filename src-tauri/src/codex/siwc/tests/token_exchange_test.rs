use super::*;

fn raw(scope: &str) -> serde_json::Value {
    serde_json::json!({
        "access_token":"synthetic-access", "refresh_token":"synthetic-refresh",
        "id_token":"synthetic-jwt", "token_type":"Bearer",
        "expires_in":3600, "scope":scope
    })
}

#[test]
fn grant_scope_must_be_explicit_for_plan_use() {
    let without: TokenGrant = serde_json::from_value(raw("openid profile model.request")).unwrap();
    assert!(without.validate(true).is_ok());
    assert!(!without.has_direct_scope());
    let with: TokenGrant = serde_json::from_value(raw("openid chatgpt.tokens.use.direct")).unwrap();
    assert!(with.has_direct_scope());
}

#[test]
fn native_siwc_workspace_link_survives_refresh_and_old_records() {
    let mut session = NativeSiwcSession {
        client_id: "issued-client".into(),
        subject: "subject-1".into(),
        email: "person@example.invalid".into(),
        scopes: vec![DIRECT_SCOPE.into()],
        access_token: "old-access".into(),
        refresh_token: "old-refresh".into(),
        id_token: "old-id".into(),
        linked_codex_account_id: Some("acct-oauth-workspace-1".into()),
        expires_at: 0,
    };
    assert_eq!(
        session.linked_codex_account_id(),
        Some("acct-oauth-workspace-1")
    );
    let serialized = serde_json::to_value(&session).unwrap();
    let mut legacy = serialized.clone();
    legacy
        .as_object_mut()
        .unwrap()
        .remove("linked_codex_account_id");
    assert_eq!(
        serde_json::from_value::<NativeSiwcSession>(legacy)
            .unwrap()
            .linked_codex_account_id(),
        None,
    );
    let refreshed: TokenGrant = serde_json::from_value(raw(DIRECT_SCOPE)).unwrap();
    session = refreshed.rotate_session(session).unwrap();
    assert_eq!(
        session.linked_codex_account_id(),
        Some("acct-oauth-workspace-1")
    );
}

#[test]
fn token_errors_surface_only_a_safe_oauth_code() {
    assert_eq!(
        oauth_error_code(br#"{"error":"invalid_grant","error_description":"private"}"#).as_deref(),
        Some("invalid_grant")
    );
    assert_eq!(
        oauth_error_code(br#"{"error":{"code":"invalid_request","message":"x"}}"#).as_deref(),
        Some("invalid_request")
    );
    assert_eq!(oauth_error_code(br#"{"error":"Bad <b>thing</b>"}"#), None);
    assert_eq!(oauth_error_code(b"not json"), None);
}

#[test]
fn initial_invalid_grant_explains_plan_eligibility_and_fresh_authorization() {
    let status = reqwest::StatusCode::BAD_REQUEST;
    let first = token_error_message(status, Some("invalid_grant"), true);
    assert!(first.contains("ChatGPT Plus or Pro plan"));
    assert!(first.contains("start the authorization again"));
    assert!(first.ends_with("(HTTP 400 Bad Request: invalid_grant)"));
    assert!(is_invalid_grant_error(&first));
    assert_eq!(
        token_error_message(status, Some("invalid_grant"), false),
        "SIWC OAuth token exchange failed (HTTP 400 Bad Request: invalid_grant)"
    );
    assert_eq!(
        token_error_message(status, None, true),
        "SIWC OAuth token exchange failed (HTTP 400 Bad Request)"
    );
}

#[test]
fn error_description_is_sanitized_and_capped() {
    assert_eq!(
        oauth_error_description(
            br#"{"error":"invalid_grant","error_description":"Plan not eligible\n\u0007"}"#
        )
        .as_deref(),
        Some("Plan not eligible")
    );
    let long = format!(r#"{{"error_description":"{}"}}"#, "a".repeat(500));
    assert_eq!(oauth_error_description(long.as_bytes()).unwrap().len(), 200);
    assert_eq!(
        oauth_error_description(br#"{"error":"invalid_grant"}"#),
        None
    );
}

#[test]
fn refuses_incomplete_or_non_bearer_grants() {
    let mut v = raw("openid");
    v["token_type"] = "Basic".into();
    assert!(serde_json::from_value::<TokenGrant>(v)
        .unwrap()
        .validate(true)
        .is_err());
}
