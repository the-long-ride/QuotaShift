use super::*;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

#[test]
fn atomic_write_creates_backup_and_preserves_it() {
    let temp = std::env::temp_dir().join("qs_test_atomic_oauth_maintenance");
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).unwrap();
    let path = temp.join("auth.json");

    std::fs::write(&path, "original").unwrap();
    atomic_write_with_backup(&path, "updated", "auth.json").unwrap();

    let backup = temp.join("auth.json.antigravity.bak");
    assert_eq!(std::fs::read_to_string(&backup).unwrap(), "original");
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "updated");

    atomic_write_with_backup(&path, "updated again", "auth.json").unwrap();
    assert_eq!(std::fs::read_to_string(&backup).unwrap(), "original");
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "updated again");

    let _ = std::fs::remove_dir_all(&temp);
}

#[test]
fn write_auth_value_at_preserves_unknown_fields() {
    let temp = std::env::temp_dir().join("qs_test_auth_json_value");
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).unwrap();
    let path = temp.join("auth.json");
    let value = serde_json::json!({
        "auth_mode": "chatgpt",
        "unknown": {"preserve": true},
        "tokens": {"access_token": "token"}
    });

    write_codex_auth_value_at(&path, &value).unwrap();
    let round_trip: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(round_trip, value);

    let _ = std::fs::remove_dir_all(&temp);
}

#[test]
fn router_provider_config_uses_custom_secret_header_and_restores() {
    let temp =
        std::env::temp_dir().join(format!("qs-router-provider-secret-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).unwrap();
    let config = temp.join("config.toml");
    let secret = "synthetic-router-secret";
    std::fs::write(&config, "model_provider = \"direct\"\n").unwrap();

    begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29101", secret).unwrap();
    let routed = std::fs::read_to_string(&config).unwrap();
    assert!(routed.contains("http_headers"));
    assert!(routed.contains(ROUTER_AUTH_HEADER));
    assert!(routed.contains(secret));
    restore_codex_router_config_at(&temp).unwrap();
    assert_eq!(
        std::fs::read_to_string(&config).unwrap(),
        "model_provider = \"direct\"\n"
    );
    let _ = std::fs::remove_dir_all(&temp);
}

#[test]
fn router_temp_paths_are_unique_and_preexisting_deterministic_temp_is_untouched() {
    let temp = std::env::temp_dir().join(format!("qs-router-unique-temp-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).unwrap();
    let config = temp.join("config.toml");
    let old_temp = temp.join("config.toml.quotashift-router.tmp");
    std::fs::write(&old_temp, b"sentinel").unwrap();

    begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29102", "secret").unwrap();
    assert_eq!(std::fs::read(&old_temp).unwrap(), b"sentinel");
    assert!(std::fs::read_to_string(&config)
        .unwrap()
        .contains("X-QuotaShift-Token"));
    restore_codex_router_config_at(&temp).unwrap();
    let _ = std::fs::remove_dir_all(&temp);
}

#[cfg(unix)]
#[test]
fn router_auth_config_backup_and_directory_are_owner_only() {
    let temp = std::env::temp_dir().join(format!("qs-router-permissions-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).unwrap();
    let config = temp.join("config.toml");
    std::fs::write(&config, b"model_provider = \"direct\"\n").unwrap();

    begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29103", "secret").unwrap();
    let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&temp), 0o700);
    assert_eq!(mode(&config), 0o600);
    assert_eq!(mode(&temp.join(ROUTER_RESTORE_FILE)), 0o600);
    assert!(!temp.join("config.toml.quotashift-router.tmp").exists());

    let auth = temp.join("auth.json");
    std::fs::write(&auth, b"{\"old\":true}").unwrap();
    write_codex_auth_value_at(&auth, &serde_json::json!({"OPENAI_API_KEY": "synthetic"})).unwrap();
    assert_eq!(mode(&auth), 0o600);
    assert_eq!(mode(&temp.join("auth.json.antigravity.bak")), 0o600);

    restore_codex_router_config_at(&temp).unwrap();
    assert_eq!(mode(&config), 0o600);
    let _ = std::fs::remove_dir_all(&temp);
}

#[cfg(unix)]
#[test]
fn preexisting_temp_symlink_is_not_followed() {
    use std::os::unix::fs::symlink;

    let temp = std::env::temp_dir().join(format!("qs-router-temp-symlink-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).unwrap();
    let target = temp.join("sentinel");
    let old_temp = temp.join("config.toml.quotashift-router.tmp");
    std::fs::write(&target, b"sentinel").unwrap();
    symlink(&target, &old_temp).unwrap();

    begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29104", "secret").unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), b"sentinel");
    assert!(std::fs::symlink_metadata(&old_temp)
        .unwrap()
        .file_type()
        .is_symlink());
    restore_codex_router_config_at(&temp).unwrap();
    let _ = std::fs::remove_dir_all(&temp);
}

#[test]
fn status_redacts_authentication_fields() {
    let mut value = serde_json::json!({
        "auth_mode": "chatgpt",
        "tokens": {"access_token": "access", "refresh_token": "refresh"},
        "OPENAI_API_KEY": "api-key",
        "account_id": "account"
    });
    redact_sensitive_auth_fields(&mut value);
    assert_eq!(value["account_id"], "account");
    assert!(value.get("OPENAI_API_KEY").is_none());
    assert!(value["tokens"].get("access_token").is_none());
    assert!(value["tokens"].get("refresh_token").is_none());
}

mod router_config_lifecycle_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(name: &str) -> PathBuf {
        let serial = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "quotashift-codex-router-{name}-{}-{serial}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn original_config() -> &'static [u8] {
        b"# keep this comment and formatting exactly\nmodel_provider = \"direct\"\nmodel = \"gpt-direct\"\n\n[model_providers.direct]\nname = \"Direct provider\"\nwire_api = \"responses\"\nbase_url = \"https://api.openai.com/v1\"\nrequires_openai_auth = true\n"
    }

    #[test]
    fn begin_snapshots_original_once_and_points_config_at_loopback() {
        let dir = temp_dir("begin");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:21001").unwrap();
        assert_eq!(std::fs::read(&restore).unwrap(), original_config());
        let first_routed = std::fs::read_to_string(&config).unwrap();
        assert!(first_routed.contains("http://127.0.0.1:21001"));

        begin_codex_router_config_at(&dir, "http://127.0.0.1:21002").unwrap();
        assert_eq!(std::fs::read(&restore).unwrap(), original_config());
        let second_routed = std::fs::read_to_string(&config).unwrap();
        assert!(second_routed.contains("http://127.0.0.1:21002"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_is_byte_exact_and_removes_router_restore_marker() {
        let dir = temp_dir("restore");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:22001").unwrap();
        restore_codex_router_config_at(&dir).unwrap();

        assert_eq!(std::fs::read(&config).unwrap(), original_config());
        assert!(!restore.exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_recovery_restores_stale_quotashift_loopback_config() {
        let dir = temp_dir("recover-stale");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:23001").unwrap();
        assert!(restore.exists());
        assert!(recover_stale_codex_router_config_at(&dir).unwrap());
        assert_eq!(std::fs::read(&config).unwrap(), original_config());
        assert!(!restore.exists());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_recovery_leaves_normal_direct_config_unchanged() {
        let dir = temp_dir("recover-direct");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();
        std::fs::write(
            &restore,
            b"stale snapshot that must not replace direct config",
        )
        .unwrap();

        assert!(!recover_stale_codex_router_config_at(&dir).unwrap());
        assert_eq!(std::fs::read(&config).unwrap(), original_config());
        assert!(!restore.exists());

        let _ = std::fs::remove_dir_all(dir);
    }
}

mod router_review_lifecycle_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(name: &str) -> PathBuf {
        let serial = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "quotashift-router-review-{name}-{}-{serial}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn restore_removes_config_when_it_was_absent_before_routing() {
        let dir = temp_dir("absent");
        let config = dir.join("config.toml");
        assert!(!config.exists());

        begin_codex_router_config_at(&dir, "http://127.0.0.1:24001").unwrap();
        assert!(config.exists());
        restore_codex_router_config_at(&dir).unwrap();

        assert!(
            !config.exists(),
            "restore must preserve the original absent state"
        );
        assert!(!dir.join(ROUTER_RESTORE_FILE).exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn recovery_restores_existing_snapshot_if_router_config_disappeared_mid_replace() {
        let dir = temp_dir("missing-mid-replace");
        let config = dir.join("config.toml");
        let original = b"model_provider = \"direct\"\n[model_providers.direct]\nbase_url = \"https://api.openai.com/v1\"\nwire_api = \"responses\"\n";
        std::fs::write(&config, original).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:24002").unwrap();
        std::fs::remove_file(&config).unwrap();

        assert!(recover_stale_codex_router_config_at(&dir).unwrap());
        assert_eq!(std::fs::read(&config).unwrap(), original);
        assert!(!dir.join(ROUTER_RESTORE_FILE).exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}
