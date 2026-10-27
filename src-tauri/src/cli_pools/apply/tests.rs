use super::*;
use crate::cli_pools::types::CliProvider;

#[test]
fn test_unimplemented_agy_apply_does_not_report_success() {
    let creds = serde_json::json!({
        "tokens": {
            "access_token": "token-123",
            "refresh_token": "refresh-123",
            "account_id": "acc-new"
        }
    });

    let res = apply_cli_credentials(CliProvider::Agy, "acc-new", Some("acc-old"), &creds, 1000);
    assert!(res.is_err());
}

#[test]
fn test_apply_account_fails_if_credentials_empty() {
    let empty_creds = serde_json::Value::Null;

    let res = apply_cli_credentials(
        CliProvider::Agy,
        "acc-new",
        Some("acc-old"),
        &empty_creds,
        1000,
    );

    assert_eq!(
        res.err(),
        Some(ApplyError::CredentialsMissingOrInvalid(
            "acc-new".to_string()
        ))
    );
}

#[test]
fn test_apply_codex_writes_auth_json_atomically() {
    let dir = std::env::temp_dir().join(format!("quotashift_apply_test_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let auth_path = dir.join("auth.json");

    let creds = serde_json::json!({
        "OPENAI_API_KEY": "sk-test",
        "auth_mode": "openai_api_key"
    });

    let res = apply_codex_credentials_at(&auth_path, "acc-1", &creds);
    assert!(res.is_ok());

    let written = std::fs::read_to_string(&auth_path).unwrap();
    assert!(written.contains("sk-test"));

    let _ = std::fs::remove_dir_all(&dir);
}
