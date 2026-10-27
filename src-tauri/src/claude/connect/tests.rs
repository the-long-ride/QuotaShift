use super::journal::{
    atomic_crash_recovery as run_atomic_recovery, save_journal, PatchJournalEntry,
};
use super::launcher::{
    build_launch_command, check_settings_precedence_conflicts, ClaudeLaunchConfig,
};
use super::settings_patch::{apply_profile_patch, check_stable_endpoint, revert_profile_patch};
use serde_json::json;
use std::collections::HashMap;

#[test]
fn launch_once_only_selected_exe_profile() {
    let temp_dir = std::env::temp_dir().join(format!("test_launch_once_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let dummy_exe = temp_dir.join("claude.exe");
    let _ = std::fs::write(&dummy_exe, "mock exe");

    let mut model_mappings = HashMap::new();
    model_mappings.insert("sonnet".to_string(), "codex-fast".to_string());

    let config = ClaudeLaunchConfig {
        executable_path: dummy_exe,
        config_dir: temp_dir.clone(),
        gateway_base_url: "http://127.0.0.1:4567".to_string(),
        gateway_token: "test_token_123".to_string(),
        model_mappings,
        max_context_window_tokens: Some(400_000),
        thinking_budget_tokens: Some(16_384),
        claude_effort_level: Some("high".to_string()),
    };

    let cmd = build_launch_command(&config).expect("build command");
    let envs: HashMap<String, Option<String>> = cmd
        .get_envs()
        .map(|(k, v)| {
            (
                k.to_string_lossy().to_string(),
                v.map(|s| s.to_string_lossy().to_string()),
            )
        })
        .collect();

    assert_eq!(
        envs.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_ref()),
        Some(&"http://127.0.0.1:4567".to_string())
    );
    assert_eq!(
        envs.get("ANTHROPIC_AUTH_TOKEN").and_then(|v| v.as_ref()),
        Some(&"test_token_123".to_string())
    );
    assert_eq!(
        envs.get("ANTHROPIC_DEFAULT_SONNET_MODEL")
            .and_then(|v| v.as_ref()),
        Some(&"codex-fast".to_string())
    );
    assert_eq!(
        envs.get("MAX_THINKING_TOKENS").and_then(|v| v.as_ref()),
        Some(&"16384".to_string())
    );
    assert!(envs.get("CLAUDE_CODE_EFFORT_LEVEL").is_none());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn effective_settings_precedence_conflict() {
    let temp_dir = std::env::temp_dir().join(format!("test_precedence_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    let settings_content = json!({
        "env": {
            "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
        }
    });
    let _ = std::fs::write(&settings_file, settings_content.to_string());

    let conflict = check_settings_precedence_conflicts(&temp_dir, "http://127.0.0.1:9999");
    assert!(conflict.is_err());
    assert!(conflict.unwrap_err().contains("Conflict"));

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn persistent_patch_only_selected_profile() {
    let temp_dir = std::env::temp_dir().join(format!("test_persist_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    let _ = std::fs::write(&settings_file, "{\"userCustom\": true}");

    let mut patch = HashMap::new();
    patch.insert(
        "env.ANTHROPIC_BASE_URL".to_string(),
        json!("http://127.0.0.1:4321"),
    );

    let journal = apply_profile_patch(&settings_file, &patch).expect("patch");
    assert_eq!(journal.patched_keys.len(), 1);

    let content = std::fs::read_to_string(&settings_file).expect("read");
    let parsed: serde_json::Value = serde_json::from_str(&content).expect("parse");
    assert_eq!(parsed["env"]["ANTHROPIC_BASE_URL"], "http://127.0.0.1:4321");
    assert!(
        parsed.get("env.ANTHROPIC_BASE_URL").is_none(),
        "Claude Code requires nested env settings, not dotted top-level keys"
    );
    assert_eq!(parsed["userCustom"], true);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn settings_json_unrelated_fields_preserved() {
    let temp_dir = std::env::temp_dir().join(format!("test_unrelated_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    let original = json!({
        "theme": "light",
        "customKey": "keep_me",
        "nested": { "foo": 123 }
    });
    let _ = std::fs::write(&settings_file, original.to_string());

    let mut patch = HashMap::new();
    patch.insert("managedKey".to_string(), json!("value"));

    let _ = apply_profile_patch(&settings_file, &patch).expect("patch");

    let after = std::fs::read_to_string(&settings_file).expect("read");
    let parsed: serde_json::Value = serde_json::from_str(&after).expect("parse");
    assert_eq!(parsed["theme"], "light");
    assert_eq!(parsed["customKey"], "keep_me");
    assert_eq!(parsed["nested"]["foo"], 123);
    assert_eq!(parsed["managedKey"], "value");

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn settings_invalid_json_no_partial_write() {
    let temp_dir = std::env::temp_dir().join(format!("test_invalid_json_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    let broken_json = "{ invalid json content ...";
    let _ = std::fs::write(&settings_file, broken_json);

    let mut patch = HashMap::new();
    patch.insert("test".to_string(), json!("val"));

    let result = apply_profile_patch(&settings_file, &patch);
    assert!(result.is_err());
    assert_eq!(
        std::fs::read_to_string(&settings_file).unwrap(),
        broken_json
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn nested_env_disconnect_preserves_concurrent_unrelated_env_changes() {
    let dir = std::env::temp_dir().join(format!("qs_nested_env_{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("settings.json");
    std::fs::write(&path, r#"{"env":{"EXISTING":"keep"}}"#).unwrap();
    let patch = HashMap::from([(
        "env.ANTHROPIC_BASE_URL".to_string(),
        json!("http://127.0.0.1:3333"),
    )]);
    let journal = apply_profile_patch(&path, &patch).unwrap();
    let mut edited: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    edited["env"]["ADDED_AFTER_CONNECT"] = json!("user");
    std::fs::write(&path, edited.to_string()).unwrap();
    revert_profile_patch(&path, &journal).unwrap();
    let final_value: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(final_value["env"]["EXISTING"], "keep");
    assert_eq!(final_value["env"]["ADDED_AFTER_CONNECT"], "user");
    assert!(final_value["env"].get("ANTHROPIC_BASE_URL").is_none());
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn raw_oauth_never_written() {
    let temp_dir = std::env::temp_dir().join(format!("test_leak_guard_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    let _ = std::fs::write(&settings_file, "{}");

    let mut patch = HashMap::new();
    patch.insert("apiKey".to_string(), json!("sk-proj-super-secret-key-123"));

    let res = apply_profile_patch(&settings_file, &patch);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Security violation"));

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn persistent_profile_must_not_store_reusable_gateway_bearer() {
    let dir = std::env::temp_dir().join(format!("qs_gateway_secret_guard_{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let settings = dir.join("settings.json");
    std::fs::write(&settings, "{}").unwrap();
    let patch = HashMap::from([(
        "env.ANTHROPIC_AUTH_TOKEN".to_string(),
        json!("qs_gw_profile_scoped_bearer"),
    )]);
    let result = apply_profile_patch(&settings, &patch);
    assert!(
        result.is_err(),
        "reusable gateway bearer needs a protected credential helper"
    );
    assert_eq!(std::fs::read_to_string(&settings).unwrap(), "{}");
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn per_key_cas_disconnect_preserves_user_edits() {
    let temp_dir = std::env::temp_dir().join(format!("test_disconnect_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    let _ = std::fs::write(&settings_file, "{\"initial\": true}");

    let mut patch = HashMap::new();
    patch.insert(
        "managedEndpoint".to_string(),
        json!("http://127.0.0.1:5000"),
    );

    let journal = apply_profile_patch(&settings_file, &patch).expect("patch");

    // Simulate user editing an unrelated setting during connection
    let mut current: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&settings_file).unwrap()).unwrap();
    current["userAddedKeyWhileConnected"] = json!("user_value");
    std::fs::write(&settings_file, serde_json::to_string(&current).unwrap()).unwrap();

    // Disconnect reverts only managed keys
    revert_profile_patch(&settings_file, &journal).expect("revert");

    let reverted: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&settings_file).unwrap()).unwrap();
    assert_eq!(reverted["initial"], true);
    assert_eq!(reverted["userAddedKeyWhileConnected"], "user_value");
    assert!(reverted.get("managedEndpoint").is_none());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn disconnect_rejects_conflicting_user_edit_to_managed_key() {
    let dir = std::env::temp_dir().join(format!("qs_cas_conflict_{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let settings = dir.join("settings.json");
    std::fs::write(&settings, r#"{"theme":"dark"}"#).unwrap();
    let patch = HashMap::from([(
        "managedEndpoint".to_string(),
        json!("http://127.0.0.1:5555"),
    )]);
    let journal = apply_profile_patch(&settings, &patch).unwrap();
    let edited = json!({"theme":"light", "managedEndpoint":"http://127.0.0.1:9876"});
    std::fs::write(&settings, edited.to_string()).unwrap();

    let error = revert_profile_patch(&settings, &journal).expect_err("managed key changed by user");
    assert!(error.contains("conflict"), "{error}");
    let actual: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&settings).unwrap()).unwrap();
    assert_eq!(actual, edited, "refuse to overwrite user modification");
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn atomic_crash_recovery() {
    let temp_dir = std::env::temp_dir().join(format!("test_crash_recovery_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    let journal_file = temp_dir.join("journal.json");

    let _ = std::fs::write(&settings_file, "{\"oldVal\": 1}");

    let mut original_keys = HashMap::new();
    original_keys.insert("managedKey".to_string(), None);
    original_keys.insert("oldVal".to_string(), Some(json!(1)));

    let entry = PatchJournalEntry {
        timestamp_ms: 1000,
        profile_path: settings_file.clone(),
        original_keys,
        patched_keys: vec!["managedKey".to_string()],
        patched_values: HashMap::from([("managedKey".to_string(), json!("crashed"))]),
        created_env: false,
        profile_id: String::new(),
    };
    save_journal(&entry, &journal_file).expect("save journal");

    // Settings got mutated mid-flight
    std::fs::write(
        &settings_file,
        "{\"oldVal\": 999, \"managedKey\": \"crashed\"}",
    )
    .unwrap();

    // Run crash recovery
    run_atomic_recovery(&journal_file, &settings_file).expect("recovery");

    let recovered: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&settings_file).unwrap()).unwrap();
    assert_eq!(
        recovered["oldVal"], 999,
        "recovery must preserve non-managed user edits"
    );
    assert!(recovered.get("managedKey").is_none());
    assert!(!journal_file.exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn stable_endpoint_needed_for_persistence() {
    assert!(check_stable_endpoint("http://127.0.0.1:4567", true).is_ok());
    assert!(check_stable_endpoint("", true).is_err());
    let err = check_stable_endpoint("http://127.0.0.1:4567", false).unwrap_err();
    assert!(
        err.contains("Router Server") && err.contains("Port"),
        "{err}"
    );
}
