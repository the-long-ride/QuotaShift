#[path = "../src/codex/models.rs"]
mod codex_models;

use codex_models::{
    codex_catalog_model_count, codex_models_url, format_codex_models_request_in,
    format_codex_models_request_out, mask_codex_account_id, select_codex_client_version,
    validate_catalog_request_inputs, CODEX_MODELS_COMPAT_CLIENT_VERSION,
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

#[test]
fn model_catalog_logs_mask_account_and_report_model_count() {
    let account_id = "acct_1234567890abcdef";
    let masked = mask_codex_account_id(account_id);
    assert_ne!(masked, account_id);
    assert!(!masked.contains(account_id));
    assert_eq!(mask_codex_account_id("abcd"), "a***");
    assert_eq!(mask_codex_account_id("abcdef"), "ab***ef");

    assert_eq!(
        format_codex_models_request_in(account_id, "0.153.4"),
        format!("[codex_models] request in account={masked} client=0.153.4"),
    );

    let catalog = serde_json::json!({
        "models": [
            {"slug": "gpt-a"},
            {"slug": "gpt-b"}
        ]
    });
    assert_eq!(codex_catalog_model_count(&catalog), 2);
    assert_eq!(
        format_codex_models_request_out(account_id, "200", Some(2)),
        format!("[codex_models] request out account={masked} status=200 models=2"),
    );
    assert_eq!(
        format_codex_models_request_out(account_id, "network_error", None),
        format!("[codex_models] request out account={masked} status=network_error"),
    );
}
