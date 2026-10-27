//! Shared fixtures for the Claude connect service tests.
use super::service::{ConnectEnv, ConnectInput, GatewayStore};
use super::ClaudeLaunchConfig;
use crate::codex::router::{
    validate_and_build_routes, ClientBinding, CodexModelPoolV2, CodexRouterManager, PoolAuthMode,
    PoolRegistrySnapshot, PoolRoutingPolicy,
};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub(super) struct FakeStore {
    pub(super) items: Mutex<Vec<ClientBinding>>,
    pub(super) fail_save: AtomicBool,
    pub(super) fail_delete: AtomicBool,
    /// Corrupts this file and then fails the next save (simulates a failing rollback).
    pub(super) corrupt_on_save: Mutex<Option<PathBuf>>,
}

impl GatewayStore for FakeStore {
    fn save(&self, binding: &ClientBinding) -> Result<(), String> {
        if let Some(path) = self.corrupt_on_save.lock().unwrap().take() {
            std::fs::write(path, "not json").unwrap();
            return Err("store save failed".into());
        }
        if self.fail_save.load(Ordering::SeqCst) {
            return Err("store save failed".into());
        }
        let mut items = self.items.lock().unwrap();
        items.retain(|b| b.id != binding.id);
        items.push(binding.clone());
        Ok(())
    }
    fn delete(&self, binding_id: &str) -> Result<(), String> {
        if self.fail_delete.load(Ordering::SeqCst) {
            return Err("store delete failed".into());
        }
        self.items.lock().unwrap().retain(|b| b.id.0 != binding_id);
        Ok(())
    }
    fn list(&self) -> Result<Vec<ClientBinding>, String> {
        Ok(self.items.lock().unwrap().clone())
    }
}

impl FakeStore {
    pub(super) fn live(&self) -> Vec<ClientBinding> {
        self.list()
            .unwrap()
            .into_iter()
            .filter(|b| !b.revoked)
            .collect()
    }
}

fn pool(id: &str, alias: &str, enabled: bool, mode: PoolAuthMode) -> CodexModelPoolV2 {
    CodexModelPoolV2 {
        id: id.into(),
        display_name: id.into(),
        public_model_name: alias.into(),
        upstream_model_id: "upstream".into(),
        enabled,
        member_account_ids: vec!["acct".into()],
        model_selection_mode: "manual".into(),
        routing_policy: PoolRoutingPolicy::Priority,
        auth_mode: mode,
        max_context_window_tokens: None,
        thinking_budget_tokens: None,
        reasoning_effort: None,
    }
}

pub(super) async fn manager() -> CodexRouterManager {
    let manager = CodexRouterManager::default();
    let pools = [
        pool("p1", "pool-sonnet", true, PoolAuthMode::Siwc),
        pool("p2", "pool-default", true, PoolAuthMode::OpenAiApiKey),
        pool("p3", "pool-off", false, PoolAuthMode::Siwc),
        pool("p4", "pool-legacy", true, PoolAuthMode::LegacyCodexOAuth),
    ];
    let routes = validate_and_build_routes(&pools, None).unwrap();
    *manager.registry.write().await = Arc::new(PoolRegistrySnapshot {
        revision: 1,
        routes,
    });
    manager
}

pub(super) struct Dirs {
    root: PathBuf,
    pub(super) journals: PathBuf,
}

impl Dirs {
    pub(super) fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "qs-claude-connect-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(root.join("profile")).unwrap();
        let journals = root.join("journals");
        Self { root, journals }
    }
    pub(super) fn profile(&self) -> PathBuf {
        self.root.join("profile")
    }
    pub(super) fn settings(&self) -> PathBuf {
        self.profile().join("settings.json")
    }
    pub(super) fn read_settings(&self) -> Value {
        serde_json::from_str(&std::fs::read_to_string(self.settings()).unwrap()).unwrap()
    }
}

impl Drop for Dirs {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

pub(super) fn env<'a>(
    m: &'a CodexRouterManager,
    store: &'a FakeStore,
    dirs: &'a Dirs,
    spawn: &'a (dyn Fn(&ClaudeLaunchConfig) -> Result<(), String> + Sync),
) -> ConnectEnv<'a> {
    ConnectEnv {
        manager: m,
        store,
        journal_dir: &dirs.journals,
        base_url: BASE_URL,
        fixed_port: true,
        self_exe: Path::new("C:/Apps/QuotaShift/quotashift.exe"),
        spawn,
    }
}

pub(super) fn input(dirs: &Dirs, mode: &str, pairs: &[(&str, &str)]) -> ConnectInput {
    ConnectInput {
        claude_exe: PathBuf::from("claude.exe"),
        profile_id: Some("prof_test".into()),
        config_dir: Some(dirs.profile()),
        mode: mode.into(),
        mappings: pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<HashMap<_, _>>(),
    }
}

pub(super) fn no_spawn(_: &ClaudeLaunchConfig) -> Result<(), String> {
    Ok(())
}

pub(super) const BASE_URL: &str = "http://127.0.0.1:4567";
pub(super) const GOOD: &[(&str, &str)] = &[("sonnet", "pool-sonnet"), ("default", "pool-default")];
