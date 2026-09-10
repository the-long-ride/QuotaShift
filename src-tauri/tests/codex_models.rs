#[path = "../src/codex_models.rs"]
mod codex_models;

use codex_models::{
    codex_models_url, select_codex_client_version, validate_catalog_request_inputs,
    CODEX_MODELS_COMPAT_CLIENT_VERSION,
};

#[test]
fn catalog_url_always_contains_encoded_client_version() {
    let url = codex_models_url("1.2.3+desktop test").expect("valid URL");
    assert_eq!(url.scheme(), "https");
    assert_eq!(url.host_str(), Some("chatgpt.com"));
    assert_eq!(url.path(), "/backend-api/codex/models");
    assert_eq!(
        url.query_pairs()
            .find(|(key, _)| key == "client_version")
            .map(|(_, value)| value.into_owned()),
        Some("1.2.3+desktop test".to_string()),
    );
}

#[test]
fn client_version_prefers_explicit_then_installed_then_compatibility_fallback() {
    assert_eq!(
        select_codex_client_version(Some(" 9.8.7 "), Some("1.0.0")),
        "9.8.7",
    );
    assert_eq!(
        select_codex_client_version(Some("   "), Some(" 1.0.0 ")),
        "1.0.0",
    );
    assert_eq!(
        select_codex_client_version(None, Some("   ")),
        CODEX_MODELS_COMPAT_CLIENT_VERSION,
    );
}

#[test]
fn catalog_request_rejects_blank_secret_or_account_before_network_io() {
    assert!(validate_catalog_request_inputs("", "account-a").is_err());
    assert!(validate_catalog_request_inputs("token", "   ").is_err());
    assert!(validate_catalog_request_inputs(" token ", " account-a ").is_ok());
}
