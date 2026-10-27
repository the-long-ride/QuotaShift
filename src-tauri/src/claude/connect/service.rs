//! Connect logic for Claude Code, free of Tauri types so it is unit-testable.
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::journal::save_journal;
use super::launcher::{
    check_auth_override_keys, resolve_claude_pool_limits, slot_env_keys, ClaudeLaunchConfig,
    ClaudePoolLimits,
};
use super::retire::{journal_path, retire_older, revert_previous_journals, safe_id};
use super::settings_patch::{apply_profile_patch, check_stable_endpoint, revert_profile_patch};
use crate::codex::router::{ClientBinding, CodexRouterManager, PoolAuthMode};

pub use super::connections::{
    binding_active, binding_moved, disconnect, dismiss_cleanup, list_connections, ClaudeConnection,
};

pub const DEFAULT_SLOT_HINT: &str = "Map the Default slot: unmapped Claude models use it.";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConnectResult {
    pub binding_id: String,
    pub mode: String,
    pub launched: bool,
    pub profile_settings_path: Option<String>,
}

/// Persistence for gateway bindings (production: encrypted native store).
pub trait GatewayStore: Sync {
    fn save(&self, binding: &ClientBinding) -> Result<(), String>;
    fn delete(&self, binding_id: &str) -> Result<(), String>;
    fn list(&self) -> Result<Vec<ClientBinding>, String>;
}

pub struct ConnectEnv<'a> {
    pub manager: &'a CodexRouterManager,
    pub store: &'a dyn GatewayStore,
    pub journal_dir: &'a Path,
    pub base_url: &'a str,
    /// The router listens on a port the user set explicitly (see `has_fixed_port`).
    pub fixed_port: bool,
    pub self_exe: &'a Path,
    pub spawn: &'a (dyn Fn(&ClaudeLaunchConfig) -> Result<(), String> + Sync),
}

pub struct ConnectInput {
    pub claude_exe: PathBuf,
    pub profile_id: Option<String>,
    pub config_dir: Option<PathBuf>,
    pub mode: String,
    pub mappings: HashMap<String, String>,
}

/// Validates mappings against enabled non-legacy pools; returns slot -> canonical alias.
async fn resolve_mappings(
    manager: &CodexRouterManager,
    mappings: &HashMap<String, String>,
) -> Result<HashMap<String, String>, String> {
    let mut slots = HashMap::new();
    for (slot, alias) in mappings {
        let (slot, alias) = (slot.trim().to_ascii_lowercase(), alias.trim());
        if alias.is_empty() {
            continue;
        }
        if slot_env_keys(&slot).is_empty() {
            return Err(format!("Unknown Claude model slot '{slot}'"));
        }
        slots.insert(slot, alias.to_string());
    }
    if !slots.contains_key("default") {
        return Err(DEFAULT_SLOT_HINT.into());
    }
    let snapshot = manager.registry.read().await.clone();
    for alias in slots.values_mut() {
        let pool = snapshot
            .routes
            .get(&alias.to_ascii_lowercase())
            .filter(|p| p.enabled)
            .ok_or_else(|| format!("Model pool '{alias}' is not an enabled pool"))?;
        if pool.auth_mode == PoolAuthMode::LegacyCodexOAuth {
            return Err(format!(
                "Legacy Codex OAuth pool '{alias}' cannot be used with Claude Code. Use a SIWC or API-key pool."
            ));
        }
        *alias = pool.public_model_name.clone();
    }
    Ok(slots)
}

fn persistent_patch(
    env: &ConnectEnv<'_>,
    profile_id: &str,
    slots: &HashMap<String, String>,
    limits: ClaudePoolLimits,
) -> HashMap<String, serde_json::Value> {
    let mut patch = HashMap::new();
    patch.insert("env.ANTHROPIC_BASE_URL".to_string(), env.base_url.into());
    patch.insert(
        "env.CLAUDE_CODE_AUTO_MODE_SERVER".to_string(),
        "0".to_string().into(),
    );
    patch.insert(
        "env.CLAUDE_CODE_ATTRIBUTION_HEADER".to_string(),
        "0".to_string().into(),
    );
    patch.insert(
        "env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS".to_string(),
        "1".to_string().into(),
    );
    for (slot, alias) in slots {
        for key in slot_env_keys(slot) {
            patch.insert(format!("env.{key}"), alias.as_str().into());
        }
    }
    if let Some(ctx) = limits.max_context_window_tokens {
        patch.insert(
            "env.CLAUDE_CODE_MAX_CONTEXT_TOKENS".to_string(),
            ctx.to_string().into(),
        );
    }
    if let Some(budget) = limits.thinking_budget_tokens {
        patch.insert(
            "env.MAX_THINKING_TOKENS".to_string(),
            budget.to_string().into(),
        );
    }
    if let Some(effort) = limits.claude_effort_level {
        patch.insert("effortLevel".to_string(), effort.into());
    }
    let helper = format!(
        "\"{}\" --claude-gateway-token {profile_id}",
        env.self_exe.display()
    );
    patch.insert("apiKeyHelper".to_string(), helper.into());
    patch
}

async fn default_pool_limits(
    manager: &CodexRouterManager,
    slots: &HashMap<String, String>,
) -> ClaudePoolLimits {
    let Some(default_alias) = slots.get("default").map(|s| s.to_ascii_lowercase()) else {
        return ClaudePoolLimits::default();
    };
    let snapshot = manager.registry.read().await.clone();
    let Some(pool) = snapshot.routes.get(&default_alias) else {
        return ClaudePoolLimits::default();
    };
    resolve_claude_pool_limits(pool)
}

async fn connect_persistent(
    env: &ConnectEnv<'_>,
    binding: ClientBinding,
    config_dir: &Path,
    slots: &HashMap<String, String>,
    limits: ClaudePoolLimits,
) -> Result<ClaudeConnectResult, String> {
    check_stable_endpoint(env.base_url, env.fixed_port)?;
    let settings_path = config_dir.join("settings.json");
    check_auth_override_keys(&settings_path)?;
    // Older journals are reverted and their bindings retired together, so a failure
    // below can never leave an earlier token live with nothing pointing at it.
    revert_previous_journals(env, &settings_path).await?;
    let patch = persistent_patch(env, &binding.profile_id, slots, limits);
    let mut journal = apply_profile_patch(&settings_path, &patch)?;
    journal.profile_id = binding.profile_id.clone();
    let saved = std::fs::create_dir_all(env.journal_dir)
        .map_err(|e| format!("Failed to create journal directory: {e}"))
        .and_then(|_| journal_path(env.journal_dir, &binding.id.0))
        .and_then(|path| save_journal(&journal, &path).map(|_| path))
        .and_then(|path| match env.store.save(&binding) {
            Ok(()) => Ok(path),
            Err(error) => {
                let _ = std::fs::remove_file(&path);
                Err(error)
            }
        });
    if let Err(error) = saved {
        return Err(match revert_profile_patch(&settings_path, &journal) {
            Ok(()) => error,
            Err(revert) => {
                // Keep the journal so the leftover patch shows up as cleanup pending.
                let _ = journal_path(env.journal_dir, &binding.id.0)
                    .and_then(|path| save_journal(&journal, &path));
                format!("{error}; reverting the profile settings also failed: {revert}")
            }
        });
    }
    let (id, profile_key) = (binding.id.0.clone(), binding.profile_id.clone());
    env.manager.register_client_binding(binding).await;
    retire_older(env, &profile_key, &id).await?;
    Ok(ClaudeConnectResult {
        binding_id: id,
        mode: "persistent-profile".into(),
        launched: false,
        profile_settings_path: Some(settings_path.to_string_lossy().into_owned()),
    })
}

async fn connect_once(
    env: &ConnectEnv<'_>,
    binding: ClientBinding,
    input: &ConnectInput,
    config_dir: &Path,
    slots: HashMap<String, String>,
    limits: ClaudePoolLimits,
) -> Result<ClaudeConnectResult, String> {
    check_auth_override_keys(&config_dir.join("settings.json"))?;
    let config = ClaudeLaunchConfig {
        executable_path: input.claude_exe.clone(),
        config_dir: config_dir.to_path_buf(),
        gateway_base_url: env.base_url.to_string(),
        gateway_token: binding.secret.clone(),
        model_mappings: slots,
        max_context_window_tokens: limits.max_context_window_tokens,
        thinking_budget_tokens: limits.thinking_budget_tokens,
        claude_effort_level: limits.claude_effort_level.map(str::to_string),
    };
    let (id, profile_key) = (binding.id.0.clone(), binding.profile_id.clone());
    env.manager.register_client_binding(binding).await;
    if let Err(error) = (env.spawn)(&config) {
        env.manager.revoke_client_binding(&id).await;
        return Err(error);
    }
    retire_older(env, &profile_key, &id).await?;
    Ok(ClaudeConnectResult {
        binding_id: id,
        mode: "launch-once".into(),
        launched: true,
        profile_settings_path: None,
    })
}

pub async fn connect(
    env: &ConnectEnv<'_>,
    input: ConnectInput,
) -> Result<ClaudeConnectResult, String> {
    let persistent = match input.mode.as_str() {
        "launch-once" => false,
        "persistent-profile" => true,
        other => return Err(format!("Unknown connection mode '{other}'")),
    };
    let (Some(profile_id), Some(config_dir)) = (input.profile_id.clone(), input.config_dir.clone())
    else {
        return Err("Choose a Claude configuration profile".into());
    };
    if !safe_id(&profile_id) {
        return Err("Invalid Claude profile reference".into());
    }
    let slots = resolve_mappings(env.manager, &input.mappings).await?;
    let limits = default_pool_limits(env.manager, &slots).await;
    let aliases: HashSet<String> = slots.values().cloned().collect();
    let key = if persistent {
        profile_id.clone()
    } else {
        format!("{profile_id}:launch-once")
    };
    let mut binding = ClientBinding::new(
        key,
        Some(input.claude_exe.to_string_lossy().into_owned()),
        aliases,
    );
    binding.fallback_alias = slots.get("default").cloned();
    if persistent {
        connect_persistent(env, binding, &config_dir, &slots, limits).await
    } else {
        connect_once(env, binding, &input, &config_dir, slots, limits).await
    }
}
