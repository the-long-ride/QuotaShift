use super::accounts::{AccountCatalog, SiwcAccount, SiwcAccountStore};
use super::oauth::{
    generate_pkce_params, validate_oauth_callback, validate_token_claims, TokenClaims,
};
use super::registration::RegistrationStore;

#[test]
fn pkce_state_nonce_required() {
    let params = generate_pkce_params();
    assert!(!params.verifier.is_empty());
    assert!(!params.challenge.is_empty());
    assert!(!params.state.is_empty());
    assert!(!params.nonce.is_empty());
    assert_ne!(params.verifier, params.challenge);
}

#[test]
fn callback_wrong_state_rejected() {
    let params = generate_pkce_params();
    let result = validate_oauth_callback("auth-code-123", "wrong-state", &params.state);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "State mismatch in OAuth callback");
}

#[test]
fn token_issuer_audience_nonce_verified() {
    let claims = TokenClaims {
        iss: "https://auth.openai.com".to_string(),
        aud: "client-id-xyz".to_string(),
        nonce: Some("nonce-123".to_string()),
        sub: "user-456".to_string(),
        scope: "openid profile chatgpt.tokens.use.direct".to_string(),
    };

    assert!(validate_token_claims(
        &claims,
        "https://auth.openai.com",
        "client-id-xyz",
        Some("nonce-123"),
    )
    .is_ok());

    // Wrong issuer
    assert!(validate_token_claims(
        &claims,
        "https://malicious.issuer.com",
        "client-id-xyz",
        Some("nonce-123"),
    )
    .is_err());

    // Wrong audience
    assert!(validate_token_claims(
        &claims,
        "https://auth.openai.com",
        "different-client",
        Some("nonce-123"),
    )
    .is_err());

    // Wrong nonce
    assert!(validate_token_claims(
        &claims,
        "https://auth.openai.com",
        "client-id-xyz",
        Some("wrong-nonce"),
    )
    .is_err());
}

#[test]
fn identity_only_not_routable() {
    let claims = TokenClaims {
        iss: "https://auth.openai.com".to_string(),
        aud: "client-id-xyz".to_string(),
        nonce: None,
        sub: "user-456".to_string(),
        scope: "openid profile email".to_string(), // Missing SIWC plan-use scope
    };

    let is_routable = claims.is_routable();
    assert!(!is_routable, "Identity-only scope must not be routable");
}

#[test]
fn plan_scope_required() {
    let claims = TokenClaims {
        iss: "https://auth.openai.com".to_string(),
        aud: "client-id-xyz".to_string(),
        nonce: None,
        sub: "user-456".to_string(),
        scope: "openid profile chatgpt.tokens.use.direct".to_string(),
    };

    assert!(claims.is_routable(), "only SIWC plan-use scope is routable");
}

#[test]
fn workspace_client_registration_distinct_even_same_email() {
    let mut store = RegistrationStore::new();
    let reg1 = store
        .register_issued(
            "device-host-1",
            "issued-client-a",
            "subject",
            "user@example.com",
            Some("workspace-a"),
        )
        .unwrap();
    let reg2 = store
        .register_issued(
            "device-host-1",
            "issued-client-b",
            "subject",
            "user@example.com",
            Some("workspace-b"),
        )
        .unwrap();

    assert_ne!(reg1.registration_id, reg2.registration_id);
    assert_ne!(reg1.client_id, reg2.client_id);
    assert_eq!(store.len(), 2);
}

#[test]
fn refresh_rotation_atomic() {
    let mut store = SiwcAccountStore::new();
    let acc_id = "acc-rotate-1";
    store.insert_account(acc_id, "access-token-v1", "refresh-token-v1");

    // Atomic rotate with valid previous refresh token
    let rotated = store.rotate_refresh_token(
        acc_id,
        "refresh-token-v1",
        "access-token-v2",
        "refresh-token-v2",
    );
    assert!(rotated.is_ok());

    // Replaying stale refresh token is rejected
    let replay = store.rotate_refresh_token(
        acc_id,
        "refresh-token-v1",
        "access-token-v3",
        "refresh-token-v3",
    );
    assert!(replay.is_err());

    // Current tokens updated
    let creds = store.get_credentials(acc_id).expect("creds");
    assert_eq!(creds.access_token, "access-token-v2");
    assert_eq!(creds.refresh_token, "refresh-token-v2");
}

#[test]
fn revoked_registration_blocked() {
    let mut store = RegistrationStore::new();
    let reg = store
        .register_issued(
            "device-host-1",
            "issued-client",
            "subject",
            "user@example.com",
            None,
        )
        .unwrap();
    assert!(!reg.revoked);

    store.revoke_registration(&reg.registration_id);
    let active = store.is_active(&reg.registration_id);
    assert!(!active);
}

#[test]
fn token_never_in_renderer_dto() {
    let account = SiwcAccount {
        id: "siwc-acc-1".to_string(),
        label: "Work SIWC".to_string(),
        email: "alice@company.com".to_string(),
        workspace_id: Some("ws-123".to_string()),
        plan_type: "team".to_string(),
        is_routable: true,
    };

    let serialized = serde_json::to_string(&account).expect("serialize");
    assert!(!serialized.contains("token"));
    assert!(!serialized.contains("secret"));
    assert!(!serialized.contains("access_token"));
    assert!(!serialized.contains("refresh_token"));
}

#[test]
fn secrets_not_in_logs() {
    let safe_log = super::store::format_safe_audit_log(
        "siwc_login",
        "siwc-acc-1",
        "sk-secret-refresh-12345678",
    );
    assert!(!safe_log.contains("sk-secret-refresh-12345678"));
    assert!(safe_log.contains("siwc_login"));
    assert!(safe_log.contains("siwc-acc-1"));
    assert!(safe_log.contains("[REDACTED]"));
}

#[test]
fn account_removal_revokes_pool_eligibility() {
    let mut catalog = AccountCatalog::new();
    catalog.add_account("acc-active-1", true);
    assert!(catalog.is_eligible("acc-active-1"));

    catalog.remove_account("acc-active-1");
    assert!(!catalog.is_eligible("acc-active-1"));
}

#[test]
fn legacy_scope_is_not_siwc_plan_consent() {
    let claims = TokenClaims {
        iss: "https://auth.openai.com".into(),
        aud: "issued-client-id".into(),
        nonce: None,
        sub: "subject".into(),
        scope: "openid profile model.request".into(),
    };
    assert!(
        !claims.is_routable(),
        "legacy model.request is not SIWC consent"
    );
}

#[test]
fn issued_client_registration_keeps_exact_issuer_id_and_refuses_missing_ids() {
    let mut store = RegistrationStore::new();
    assert!(store
        .register_issued("host", "", "sub", "user@example.com", Some("work"))
        .is_err());
    let registered = store
        .register_issued(
            "host",
            "issued-real-client",
            "sub",
            "user@example.com",
            Some("work"),
        )
        .unwrap();
    assert_eq!(registered.client_id, "issued-real-client");
    assert_eq!(
        store.get(&registered.registration_id).unwrap().client_id,
        "issued-real-client"
    );
}

#[test]
fn registration_dtos_never_serialize_tokens() {
    let mut store = RegistrationStore::new();
    let item = store
        .register_issued("host", "issued-id", "subject", "person@foo.test", None)
        .unwrap();
    let serialized = serde_json::to_string(&item).unwrap();
    assert!(!serialized.contains("access_token"));
    assert!(!serialized.contains("refresh_token"));
    assert!(!serialized.contains("id_token"));
}

#[test]
fn siwc_authorization_url_contains_dynamic_issued_client_contract() {
    use super::oauth::build_siwc_authorization_url;
    let params = generate_pkce_params();
    let url = build_siwc_authorization_url(
        "urn:uuid:00000000-0000-4000-8000-000000000001",
        13555,
        None,
        &params,
    )
    .unwrap();
    let parsed = reqwest::Url::parse(&url).unwrap();
    let query: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    assert_eq!(
        parsed.as_str().split('?').next().unwrap(),
        "https://auth.openai.com/api/accounts/authorize"
    );
    assert_eq!(query["client_id"], "dynamic_agent_client");
    assert_eq!(query["agent_name_hint"], "QuotaShift");
    assert_eq!(
        query["redirect_uri"],
        "http://127.0.0.1:13555/auth/callback"
    );
    assert_eq!(query["resource"], "https://api.openai.com/v1");
    assert_eq!(query["code_challenge_method"], "S256");
    assert_eq!(query["code_challenge"], params.challenge);
    assert_eq!(query["state"], params.state);
    assert_eq!(query["nonce"], params.nonce);
    assert_eq!(
        query["ext_agent_host_id"],
        "urn:uuid:00000000-0000-4000-8000-000000000001"
    );
    assert_eq!(
        query["scope"],
        "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
    );
}

#[test]
fn siwc_returning_authorization_uses_issued_id_without_agent_hint() {
    use super::oauth::build_siwc_authorization_url;
    let url = build_siwc_authorization_url(
        "urn:uuid:00000000-0000-4000-8000-000000000001",
        1455,
        Some("oaiapp_issued_client"),
        &generate_pkce_params(),
    )
    .unwrap();
    let query: std::collections::HashMap<_, _> = reqwest::Url::parse(&url)
        .unwrap()
        .query_pairs()
        .into_owned()
        .collect();
    assert_eq!(query["client_id"], "oaiapp_issued_client");
    assert!(!query.contains_key("agent_name_hint"));
    assert!(build_siwc_authorization_url("host", 0, None, &generate_pkce_params()).is_err());
}

#[test]
fn siwc_callback_requires_issued_client_id_on_initial_registration() {
    use super::oauth::validate_siwc_callback;
    let params = generate_pkce_params();
    assert!(validate_siwc_callback("code", &params.state, &params.state, None, None).is_err());
    let issued = validate_siwc_callback(
        "code",
        &params.state,
        &params.state,
        Some("oaiapp_issued"),
        None,
    )
    .unwrap();
    assert_eq!(issued, "oaiapp_issued");
    assert!(
        validate_siwc_callback("code", &params.state, "wrong", Some("oaiapp_issued"), None)
            .is_err()
    );
    assert!(validate_siwc_callback(
        "code",
        &params.state,
        &params.state,
        Some("other"),
        Some("oaiapp_issued")
    )
    .is_err());
    assert_eq!(
        validate_siwc_callback(
            "code",
            &params.state,
            &params.state,
            None,
            Some("oaiapp_issued")
        )
        .unwrap(),
        "oaiapp_issued"
    );
    assert!(validate_siwc_callback(
        "code",
        &params.state,
        &params.state,
        Some("dynamic_agent_client"),
        None
    )
    .is_err());
}

#[test]
fn siwc_catalog_uses_only_list_visible_models_and_keeps_server_order() {
    let catalog = serde_json::json!({
        "models": [
            {"slug":"gpt-x","display_name":"GPT X","visibility":"list"},
            {"slug":"secret-internal","display_name":"Hidden","visibility":"hidden"},
            {"slug":"gpt-y","display_name":"GPT Y","visibility":"list"},
            {"slug":"gpt-x","display_name":"Duplicate","visibility":"list"}
        ]
    });
    let models = super::models::parse_siwc_model_catalog(&catalog).unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].slug, "gpt-x");
    assert_eq!(models[0].display_name, "GPT X");
    assert_eq!(models[1].slug, "gpt-y");
    assert!(serde_json::to_string(&models)
        .unwrap()
        .contains("displayName"));
}

#[test]
fn siwc_catalog_rejects_malformed_or_missing_models_without_importing_codex_models() {
    for bad in [
        serde_json::json!({"data":[{"id":"legacy-codex"}]}),
        serde_json::json!({"models":"invalid"}),
        serde_json::json!({"models":[{"slug":123,"visibility":"list"}]}),
    ] {
        assert!(super::models::parse_siwc_model_catalog(&bad).is_err());
    }
}

#[test]
fn siwc_sign_in_state_tracks_reuses_and_cancels_active_session() {
    use super::commands::SiwcSignInState;
    let state = SiwcSignInState::default();
    assert!(!state.status().pending);

    let (tx, mut rx) = tokio::sync::oneshot::channel();
    let attempt_id = state
        .begin_attempt(
            Some("reg-1".to_string()),
            Some("sub-1".to_string()),
            Some("acct-oauth-1".to_string()),
        )
        .expect("begin first attempt");
    state.activate_attempt(
        attempt_id,
        "https://auth.openai.com/api/accounts/authorize?state=s1".to_string(),
        tx,
    );

    let status = state.status();
    assert!(status.pending);
    assert_eq!(status.registration_id.as_deref(), Some("reg-1"));
    assert_eq!(
        status.linked_codex_account_id.as_deref(),
        Some("acct-oauth-1")
    );

    // Matching target reuses active authorization URL
    assert_eq!(
        state
            .existing_url_for(Some("reg-1"), Some("sub-1"), Some("acct-oauth-1"))
            .as_deref(),
        Some("https://auth.openai.com/api/accounts/authorize?state=s1")
    );

    // Different target cannot start a parallel attempt while pending
    assert!(state
        .begin_attempt(
            None,
            Some("sub-2".to_string()),
            Some("acct-oauth-2".to_string())
        )
        .is_err());

    // Canceling signals the listener and clears pending status
    assert!(state.cancel());
    assert!(rx.try_recv().is_ok());
    assert!(!state.status().pending);

    // Recording an error surfaces it in status until next attempt
    state.record_error("Token exchange failed");
    assert_eq!(
        state.status().last_error.as_deref(),
        Some("Token exchange failed")
    );
    let next_attempt = state
        .begin_attempt(None, None, None)
        .expect("begin second attempt clears last_error");
    assert_eq!(state.status().last_error, None);
    state.clear_attempt(next_attempt);
}

#[test]
fn native_siwc_session_binds_codex_subject_for_cross_client_linking() {
    use super::oidc::VerifiedSiwcIdentity;
    use super::token_exchange::TokenGrant;

    let grant: TokenGrant = serde_json::from_value(serde_json::json!({
        "access_token": "acc-tok",
        "refresh_token": "ref-tok",
        "id_token": "id-tok",
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "openid profile email chatgpt.tokens.use.direct"
    }))
    .unwrap();
    let identity = VerifiedSiwcIdentity::new_for_test(
        "user-siwc-dynamic-subject",
        Some("user@example.com".to_string()),
    );
    let mut session = grant
        .into_session("oaiapp_issued".to_string(), &identity)
        .unwrap();
    session.bind_subject("google-oauth2|123456789".to_string());
    session.bind_codex_account(Some("acct-oauth-ws1".to_string()));
    assert_eq!(session.subject(), "google-oauth2|123456789");
    assert_eq!(session.linked_codex_account_id(), Some("acct-oauth-ws1"));
    assert!(session.is_routable());
}
