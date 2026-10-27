use super::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static TEST_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temp_codex_home(name: &str) -> (PathBuf, PathBuf) {
    let count = TEST_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "qs_lifecycle_test_{name}_{}_{count}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let config_path = dir.join("config.toml");
    (dir, config_path)
}

#[tokio::test]
async fn gateway_start_does_not_write_codex_config() {
    let (codex_dir, config_path) = temp_codex_home("start_no_write");
    let original = "model = \"o1-mini\"\nuser_custom_setting = \"preserved\"\n";
    std::fs::write(&config_path, original).unwrap();

    // Set CODEX_HOME for this test scope
    std::env::set_var("CODEX_HOME", &codex_dir);

    // Default manager (production mode) must NOT write to config.toml when starting gateway
    let manager = CodexRouterManager::default();
    let status = manager.start_listener().await.expect("gateway starts");
    assert!(status.running);

    // Ensure config was untouched
    let current_config = std::fs::read_to_string(&config_path).unwrap();
    assert_eq!(
        current_config, original,
        "Gateway start must not modify CODEX config.toml"
    );
    assert!(
        !codex_dir
            .join(crate::codex_sync::ROUTER_RESTORE_FILE)
            .exists(),
        "Gateway start must not create router restore snapshot"
    );

    manager.stop_listener().await.expect("gateway stops");
    let _ = std::fs::remove_dir_all(codex_dir);
}

#[tokio::test]
async fn gateway_stop_without_connector_does_not_touch_config() {
    let (codex_dir, config_path) = temp_codex_home("stop_no_touch");
    let original = "model = \"o1-mini\"\nuser_custom_setting = \"preserved\"\n";
    std::fs::write(&config_path, original).unwrap();
    std::env::set_var("CODEX_HOME", &codex_dir);

    let manager = CodexRouterManager::default();
    manager.start_listener().await.expect("gateway starts");
    manager.stop_listener().await.expect("gateway stops");

    let current_config = std::fs::read_to_string(&config_path).unwrap();
    assert_eq!(
        current_config, original,
        "Gateway stop without connector must not touch config.toml"
    );

    let _ = std::fs::remove_dir_all(codex_dir);
}

#[tokio::test]
async fn explicit_codex_connect_patches_only_expected_keys() {
    let (codex_dir, config_path) = temp_codex_home("explicit_connect");
    let original = "model = \"o1-mini\"\nuser_preserved = true\n";
    std::fs::write(&config_path, original).unwrap();
    std::env::set_var("CODEX_HOME", &codex_dir);

    let manager = CodexRouterManager::default();
    let status = manager.start_listener().await.expect("gateway starts");
    let base_url = status.base_url.expect("base URL");

    // Explicit connect patches config.toml with router provider
    manager
        .connect_codex_cli_at(&codex_dir)
        .expect("explicit connect succeeds");

    let modified = std::fs::read_to_string(&config_path).unwrap();
    assert!(
        modified.contains("model_provider = \"quotashift_router\""),
        "Must set model_provider to quotashift_router"
    );
    assert!(
        modified.contains(&base_url),
        "Must configure loopback base URL"
    );
    assert!(
        modified.contains("user_preserved = true"),
        "Unrelated user keys must be preserved"
    );

    manager
        .disconnect_codex_cli_at(&codex_dir)
        .expect("disconnect succeeds");
    manager.stop_listener().await.expect("gateway stops");
    let _ = std::fs::remove_dir_all(codex_dir);
}

#[tokio::test]
async fn disconnect_preserves_intervening_user_edits() {
    let (codex_dir, config_path) = temp_codex_home("disconnect_preserves_edits");
    let original =
        "model_provider = \"direct\"\n[model_providers.direct]\nwire_api = \"responses\"\n";
    std::fs::write(&config_path, original).unwrap();
    std::env::set_var("CODEX_HOME", &codex_dir);

    let manager = CodexRouterManager::default();
    manager.start_listener().await.expect("gateway starts");

    manager
        .connect_codex_cli_at(&codex_dir)
        .expect("connect succeeds");

    // Simulate user editing config while connected
    let connected_content = std::fs::read_to_string(&config_path).unwrap();
    let edited = format!("user_added_setting = \"custom_value\"\n{connected_content}");
    std::fs::write(&config_path, &edited).unwrap();

    // Disconnect must restore original provider but preserve user_added_setting!
    manager
        .disconnect_codex_cli_at(&codex_dir)
        .expect("disconnect succeeds");

    let restored = std::fs::read_to_string(&config_path).unwrap();
    assert!(
        restored.contains("user_added_setting = \"custom_value\""),
        "Intervening user edits must be preserved after disconnect"
    );
    assert!(
        !restored.contains("model_provider = \"quotashift_router\""),
        "QuotaShift router provider must be disconnected"
    );

    manager.stop_listener().await.expect("gateway stops");
    let _ = std::fs::remove_dir_all(codex_dir);
}

#[tokio::test]
async fn gateway_restart_still_requires_client_auth() {
    let manager = CodexRouterManager::default();
    let first = manager.start_listener().await.expect("first start");
    let first_url = first.base_url.expect("first URL");
    let client = reqwest::Client::new();

    // Missing auth must be rejected 401
    let res = client
        .post(format!("{first_url}/responses"))
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-4o","input":"hi"}"#)
        .send()
        .await
        .expect("post");
    assert_eq!(res.status(), reqwest::StatusCode::UNAUTHORIZED);

    manager.stop_listener().await.expect("stop");

    // Restart on new port
    let second = manager.start_listener().await.expect("second start");
    let second_url = second.base_url.expect("second URL");

    let res2 = client
        .post(format!("{second_url}/responses"))
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-4o","input":"hi"}"#)
        .send()
        .await
        .expect("post2");
    assert_eq!(res2.status(), reqwest::StatusCode::UNAUTHORIZED);

    manager.stop_listener().await.expect("second stop");
}
