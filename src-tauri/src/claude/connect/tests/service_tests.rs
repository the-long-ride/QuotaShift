use super::service::{binding_active, connect, disconnect};
use super::test_support::{env, input, manager, no_spawn, Dirs, FakeStore, GOOD};
use super::ClaudeLaunchConfig;
use crate::codex::router::ClientBinding;
use serde_json::json;
use std::sync::{Arc, Mutex};

type Spawned = Arc<Mutex<Vec<ClaudeLaunchConfig>>>;

fn stored(s: &FakeStore) -> Vec<ClientBinding> {
    s.live()
}

#[tokio::test]
async fn connect_rejects_missing_default_slot() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let err = connect(
        &e,
        input(&d, "persistent-profile", &[("sonnet", "pool-sonnet")]),
    )
    .await
    .unwrap_err();
    assert!(err.contains("Default"), "{err}");
    assert!(stored(&s).is_empty());
    assert!(!d.settings().exists());
}

#[tokio::test]
async fn connect_rejects_disabled_alias() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let pairs = [("default", "pool-default"), ("opus", "pool-off")];
    let err = connect(&e, input(&d, "persistent-profile", &pairs))
        .await
        .unwrap_err();
    assert!(err.contains("pool-off"), "{err}");
    assert!(stored(&s).is_empty());
}

#[tokio::test]
async fn connect_rejects_legacy_codex_pool() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let err = connect(&e, input(&d, "launch-once", &[("default", "pool-legacy")]))
        .await
        .unwrap_err();
    assert!(err.contains("Legacy"), "{err}");
}

#[tokio::test]
async fn persistent_connect_writes_api_key_helper_not_token() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    std::fs::write(d.settings(), r#"{"theme":"dark"}"#).unwrap();
    let e = env(&m, &s, &d, &no_spawn);
    let result = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap();
    assert!(!result.launched);
    assert!(result.profile_settings_path.is_some());

    let text = std::fs::read_to_string(d.settings()).unwrap();
    let settings = d.read_settings();
    assert_eq!(
        settings["apiKeyHelper"],
        "\"C:/Apps/QuotaShift/quotashift.exe\" --claude-gateway-token prof_test"
    );
    assert_eq!(
        settings["env"]["ANTHROPIC_BASE_URL"],
        "http://127.0.0.1:4567"
    );
    assert_eq!(
        settings["env"]["ANTHROPIC_DEFAULT_SONNET_MODEL"],
        "pool-sonnet"
    );
    assert_eq!(settings["env"]["ANTHROPIC_MODEL"], "pool-default");
    assert_eq!(settings["env"]["CLAUDE_CODE_AUTO_MODE_SERVER"], "0");
    assert_eq!(settings["env"]["CLAUDE_CODE_ATTRIBUTION_HEADER"], "0");
    assert_eq!(
        settings["env"]["CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"],
        "1"
    );
    assert_eq!(settings["theme"], "dark");
    assert!(!text.contains("ANTHROPIC_AUTH_TOKEN"));

    let stored = stored(&s);
    assert_eq!(stored.len(), 1);
    assert!(!text.contains(&stored[0].secret));
    assert_eq!(stored[0].fallback_alias.as_deref(), Some("pool-default"));
    let mut aliases: Vec<_> = stored[0].allowed_aliases.iter().cloned().collect();
    aliases.sort();
    assert_eq!(aliases, ["pool-default", "pool-sonnet"]);
    assert!(binding_active(&m, &result.binding_id).await);
}

#[tokio::test]
async fn disconnect_reverts_profile_and_revokes() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    std::fs::write(d.settings(), r#"{"theme":"dark"}"#).unwrap();
    let e = env(&m, &s, &d, &no_spawn);
    let id = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    disconnect(&e, &id).await.unwrap();
    assert_eq!(d.read_settings(), json!({"theme":"dark"}));
    assert!(stored(&s).is_empty());
    assert!(!binding_active(&m, &id).await);
}

#[tokio::test]
async fn disconnect_conflict_is_error_but_still_revokes() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let id = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    let mut edited = d.read_settings();
    edited["apiKeyHelper"] = json!("user-owned-helper");
    std::fs::write(d.settings(), edited.to_string()).unwrap();
    let err = disconnect(&e, &id).await.unwrap_err();
    assert!(err.contains("conflict"), "{err}");
    assert!(stored(&s).is_empty());
    assert!(!binding_active(&m, &id).await);
}

#[tokio::test]
async fn reconnect_revokes_and_deletes_older_bindings() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    std::fs::write(d.settings(), r#"{"theme":"dark"}"#).unwrap();
    let e = env(&m, &s, &d, &no_spawn);
    let first = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    let pairs = [("default", "pool-sonnet")];
    let second = connect(&e, input(&d, "persistent-profile", &pairs))
        .await
        .unwrap()
        .binding_id;
    assert_ne!(first, second);
    let stored = stored(&s);
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].id.0, second);
    assert!(!binding_active(&m, &first).await);
    assert!(binding_active(&m, &second).await);
    assert_eq!(stored[0].fallback_alias.as_deref(), Some("pool-sonnet"));
    disconnect(&e, &second).await.unwrap();
    assert_eq!(d.read_settings()["theme"], "dark");
    assert!(d.read_settings().get("apiKeyHelper").is_none());
}

#[tokio::test]
async fn launch_once_passes_env_only_and_persists_nothing() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let spawned: Spawned = Arc::default();
    let sink = spawned.clone();
    let spawn = move |c: &ClaudeLaunchConfig| {
        sink.lock().unwrap().push(c.clone());
        Ok(())
    };
    let e = env(&m, &s, &d, &spawn);
    let result = connect(&e, input(&d, "launch-once", GOOD)).await.unwrap();
    assert!(result.launched);
    assert!(result.profile_settings_path.is_none());
    assert!(stored(&s).is_empty());
    assert!(!d.settings().exists());
    let calls = spawned.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].gateway_base_url, "http://127.0.0.1:4567");
    assert_eq!(calls[0].model_mappings["default"], "pool-default");
    assert!(binding_active(&m, &result.binding_id).await);
}

#[tokio::test]
async fn launch_failure_leaves_no_active_binding() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let spawn = |_: &ClaudeLaunchConfig| Err("spawn failed".to_string());
    let e = env(&m, &s, &d, &spawn);
    let err = connect(&e, input(&d, "launch-once", GOOD))
        .await
        .unwrap_err();
    assert!(err.contains("spawn failed"));
    let bindings = m.client_bindings.read().await;
    assert!(bindings.values().all(|b| b.revoked));
}

#[tokio::test]
async fn connect_syncs_default_pool_thinking_budget_and_effort_to_claude_code() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    {
        let mut snap = (**m.registry.read().await).clone();
        let mut pool = (*snap.routes["pool-default"]).clone();
        pool.max_context_window_tokens = Some(400_000);
        pool.thinking_budget_tokens = Some(16_384);
        pool.reasoning_effort = Some("high".to_string());
        snap.routes
            .insert("pool-default".to_string(), Arc::new(pool));
        *m.registry.write().await = Arc::new(snap);
    }
    let e = env(&m, &s, &d, &no_spawn);
    let res = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap();
    let settings = d.read_settings();
    assert_eq!(settings["env"]["CLAUDE_CODE_MAX_CONTEXT_TOKENS"], "400000");
    assert_eq!(settings["env"]["MAX_THINKING_TOKENS"], "16384");
    assert_eq!(settings["effortLevel"], "high");
    assert!(settings["env"].get("CLAUDE_CODE_EFFORT_LEVEL").is_none());

    {
        let mut snap = (**m.registry.read().await).clone();
        let mut pool = (*snap.routes["pool-default"]).clone();
        pool.max_context_window_tokens = Some(1_000_000);
        pool.thinking_budget_tokens = Some(32_768);
        pool.reasoning_effort = Some("xhigh".to_string());
        snap.routes
            .insert("pool-default".to_string(), Arc::new(pool));
        *m.registry.write().await = Arc::new(snap);
    }
    super::journal::sync_journals_with_registry(&d.journals, &m).await;
    let updated = d.read_settings();
    assert_eq!(updated["env"]["CLAUDE_CODE_MAX_CONTEXT_TOKENS"], "1000000");
    assert_eq!(updated["env"]["MAX_THINKING_TOKENS"], "32768");
    assert_eq!(updated["effortLevel"], "high");
    assert!(updated["env"].get("CLAUDE_CODE_EFFORT_LEVEL").is_none());

    disconnect(&e, &res.binding_id).await.unwrap();
    assert_eq!(d.read_settings(), json!({}));
}

#[tokio::test]
async fn restore_profile_settings_to_default_heals_corrupted_or_outdated_settings() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let res = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap();

    // Simulate user corrupting settings.json, adding conflicting auth key, or having stale CLAUDE_CODE_EFFORT_LEVEL
    std::fs::write(
        d.settings(),
        r#"{"theme":"dark","env":{"ANTHROPIC_AUTH_TOKEN":"stale","ANTHROPIC_MODEL":"wrong","CLAUDE_CODE_EFFORT_LEVEL":"medium"}}"#,
    )
    .unwrap();

    let restored = super::journal::restore_profile_settings_to_default(
        &d.journals,
        &m,
        "prof_test",
        d.settings().parent().unwrap(),
        std::path::Path::new("C:/Apps/QuotaShift/quotashift.exe"),
    )
    .await
    .unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&restored).unwrap();
    assert_eq!(parsed["theme"], "dark");
    assert!(parsed["env"].get("ANTHROPIC_AUTH_TOKEN").is_none());
    assert!(parsed["env"].get("CLAUDE_CODE_EFFORT_LEVEL").is_none());
    assert_eq!(parsed["env"]["ANTHROPIC_MODEL"], "pool-default");
    assert_eq!(
        parsed["env"]["ANTHROPIC_DEFAULT_SONNET_MODEL"],
        "pool-sonnet"
    );
    assert!(parsed["env"]
        .get("CLAUDE_CODE_MAX_CONTEXT_TOKENS")
        .is_some());
    assert!(parsed["env"].get("MAX_THINKING_TOKENS").is_some());
    assert_eq!(parsed["env"]["CLAUDE_CODE_AUTO_MODE_SERVER"], "0");
    assert_eq!(parsed["env"]["CLAUDE_CODE_ATTRIBUTION_HEADER"], "0");
    assert_eq!(parsed["env"]["CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"], "1");
    assert_eq!(parsed["effortLevel"], "medium");

    disconnect(&e, &res.binding_id).await.unwrap();
    assert_eq!(d.read_settings(), json!({"theme":"dark"}));
}
