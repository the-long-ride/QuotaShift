//! Tauri commands: Connect / Disconnect / status for Claude Code via QuotaShift.
use std::collections::HashMap;
use std::path::PathBuf;

use super::launcher::{build_launch_command, ClaudeLaunchConfig};
use super::service::{
    self, ClaudeConnectResult, ClaudeConnection, ConnectEnv, ConnectInput, GatewayStore,
};
use crate::codex::router::{ClientBinding, CodexRouterManager};
use crate::storage::secure_storage as vault;

struct NativeGatewayStore;

impl GatewayStore for NativeGatewayStore {
    fn save(&self, binding: &ClientBinding) -> Result<(), String> {
        vault::save_gateway_binding(binding)
    }
    fn delete(&self, binding_id: &str) -> Result<(), String> {
        vault::delete_gateway_binding(binding_id)
    }
    fn list(&self) -> Result<Vec<ClientBinding>, String> {
        vault::load_gateway_bindings()
    }
}

fn journal_dir() -> Result<PathBuf, String> {
    let store = vault::gateway_store_path()?;
    let parent = store.parent().ok_or("Gateway store path has no parent")?;
    Ok(parent.join("claude-connect-journals"))
}

/// Opens Claude in its own console window; the token travels in the child env only.
fn spawn_in_new_console(config: &ClaudeLaunchConfig) -> Result<(), String> {
    let mut command = build_launch_command(config)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0000_0010); // CREATE_NEW_CONSOLE
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch Claude Code: {e}"))
}

async fn running_base_url(manager: &CodexRouterManager) -> Result<(String, bool), String> {
    manager
        .endpoint()
        .await
        .ok_or_else(|| "Start Model Pool Routing before connecting Claude Code".to_string())
}

#[tauri::command]
pub async fn connect_claude_code(
    manager: tauri::State<'_, CodexRouterManager>,
    installation_path: String,
    profile_id: Option<String>,
    mode: String,
    mappings: HashMap<String, String>,
) -> Result<ClaudeConnectResult, String> {
    let (base_url, fixed_port) = running_base_url(&manager).await?;
    let targets = crate::claude::inventory::get_claude_connect_targets();
    let wanted = installation_path.to_ascii_lowercase();
    let installation = targets
        .installations
        .iter()
        .find(|i| {
            i.path.to_string_lossy().to_ascii_lowercase() == wanted
                || i.canonical_path.to_ascii_lowercase() == wanted
        })
        .ok_or("Selected Claude installation was not detected")?;
    let profile = profile_id
        .as_deref()
        .and_then(|id| targets.profiles.iter().find(|p| p.id == id))
        .ok_or("Selected Claude profile was not detected")?;
    let self_exe = std::env::current_exe().map_err(|e| format!("Cannot locate QuotaShift: {e}"))?;
    let journals = journal_dir()?;
    let env = ConnectEnv {
        manager: &manager,
        store: &NativeGatewayStore,
        journal_dir: &journals,
        base_url: &base_url,
        fixed_port,
        self_exe: &self_exe,
        spawn: &spawn_in_new_console,
    };
    let input = ConnectInput {
        claude_exe: installation.path.clone(),
        profile_id: Some(profile.id.clone()),
        config_dir: Some(profile.config_dir.clone()),
        mode,
        mappings,
    };
    service::connect(&env, input).await
}

#[tauri::command]
pub async fn disconnect_claude_code(
    manager: tauri::State<'_, CodexRouterManager>,
    binding_id: String,
) -> Result<(), String> {
    let journals = journal_dir()?;
    let env = ConnectEnv {
        manager: &manager,
        store: &NativeGatewayStore,
        journal_dir: &journals,
        base_url: "",
        fixed_port: false,
        self_exe: std::path::Path::new(""),
        spawn: &|_| Ok(()),
    };
    service::disconnect(&env, &binding_id).await
}

#[tauri::command]
pub async fn get_claude_gateway_status(
    manager: tauri::State<'_, CodexRouterManager>,
    binding_id: String,
) -> Result<bool, String> {
    let base_url = manager.status().await.base_url;
    let journals = journal_dir()?;
    let moved = service::binding_moved(&journals, &binding_id, base_url.as_deref());
    Ok(base_url.is_some() && !moved && service::binding_active(&manager, &binding_id).await)
}

/// Connections recovered from native state (store and router), so the UI can Disconnect
/// after a restart. Never includes a secret.
#[tauri::command]
pub async fn list_claude_gateway_connections(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<Vec<ClaudeConnection>, String> {
    let base_url = manager.status().await.base_url;
    let journals = journal_dir()?;
    Ok(service::list_connections(
        &manager,
        &NativeGatewayStore,
        &journals,
        base_url.as_deref(),
    )
    .await)
}

/// Forgets a leftover settings patch without touching settings.json.
#[tauri::command]
pub async fn dismiss_claude_gateway_cleanup(
    manager: tauri::State<'_, CodexRouterManager>,
    journal_id: String,
) -> Result<(), String> {
    let journals = journal_dir()?;
    let env = ConnectEnv {
        manager: &manager,
        store: &NativeGatewayStore,
        journal_dir: &journals,
        base_url: "",
        fixed_port: false,
        self_exe: std::path::Path::new(""),
        spawn: &|_| Ok(()),
    };
    service::dismiss_cleanup(&env, &journal_id).await
}

pub async fn sync_active_claude_journals(manager: &CodexRouterManager) {
    if let Ok(journals) = journal_dir() {
        super::journal::sync_journals_with_registry(&journals, manager).await;
    }
}

#[tauri::command]
pub async fn restore_claude_profile_settings(
    manager: tauri::State<'_, CodexRouterManager>,
    profile_id: String,
    config_dir: String,
) -> Result<String, String> {
    let journals = journal_dir()?;
    let self_exe = std::env::current_exe().map_err(|e| format!("Cannot locate QuotaShift: {e}"))?;
    super::journal::restore_profile_settings_to_default(
        &journals,
        &manager,
        &profile_id,
        &PathBuf::from(config_dir),
        &self_exe,
    )
    .await
}
