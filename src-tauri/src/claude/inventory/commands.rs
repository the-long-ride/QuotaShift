//! Read-only Windows Claude Code discovery. Never executes candidate binaries or reads credentials.
use std::collections::HashSet;
use std::path::PathBuf;

use super::creation::{
    create_managed_profile_at, list_managed_profile_dirs, managed_profile_root, ProfileTemplate,
};
use super::launcher::{
    ensure_launcher_dir_on_user_path, install_claude_launcher_at, managed_launcher_bin,
};
use super::{
    discover_claude_installations, discover_claude_profiles, ClaudeInstallation, ClaudeProfile,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConnectTargets {
    pub(crate) installations: Vec<ClaudeInstallation>,
    pub(crate) profiles: Vec<ClaudeProfile>,
}

#[tauri::command]
pub fn get_claude_connect_targets() -> ClaudeConnectTargets {
    let mut executable_paths: Vec<PathBuf> = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for basename in ["claude.exe", "claude.cmd"] {
                let path = dir.join(basename);
                if path.is_file() {
                    executable_paths.push(path);
                }
            }
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        let home = PathBuf::from(home);
        executable_paths.push(home.join(".local").join("bin").join("claude.exe"));
    }
    executable_paths.retain(|p| p.is_file());
    let mut seen = HashSet::new();
    executable_paths.retain(|p| seen.insert(p.to_string_lossy().to_ascii_lowercase()));
    let installations = discover_claude_installations(&executable_paths);

    let mut dirs = Vec::new();
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        dirs.push(PathBuf::from(dir));
    }
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        dirs.push(PathBuf::from(home).join(".claude"));
    }
    let mut seen_profiles = HashSet::new();
    dirs.retain(|p| seen_profiles.insert(p.to_string_lossy().to_ascii_lowercase()));
    if let Ok(root) = managed_profile_root() {
        if let Ok(managed) = list_managed_profile_dirs(&root) {
            dirs.extend(managed);
        }
    }
    let profiles = discover_claude_profiles(&dirs);
    ClaudeConnectTargets {
        installations,
        profiles,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedClaudeProfile {
    #[serde(flatten)]
    pub profile: ClaudeProfile,
    pub command_name: String,
    pub launcher_path: PathBuf,
    pub path_added: bool,
    pub path_warning: Option<String>,
}

#[tauri::command]
pub fn create_managed_claude_profile(
    profile_name: String,
    template: ProfileTemplate,
    source_profile_id: Option<String>,
) -> Result<CreatedClaudeProfile, String> {
    let source = match template {
        ProfileTemplate::Default => {
            if source_profile_id.is_some() {
                return Err("Default profile must not specify a source".into());
            }
            None
        }
        ProfileTemplate::CopySettings => {
            let source_id =
                source_profile_id.ok_or("Choose a detected profile to copy settings")?;
            let targets = get_claude_connect_targets();
            let source = targets
                .profiles
                .into_iter()
                .find(|profile| profile.id == source_id)
                .ok_or("Source Claude profile no longer exists in discovered profiles")?;
            Some(source.config_dir)
        }
    };
    let root = managed_profile_root()?;
    let bin_dir = managed_launcher_bin()?;
    // Check collisions before creating the profile; never replace another command.
    let expected = bin_dir.join(format!("claude-{profile_name}.cmd"));
    if expected.exists() {
        return Err(format!("Launcher '{}' already exists", expected.display()));
    }
    let profile = create_managed_profile_at(&root, &profile_name, template, source.as_deref())?;
    let launcher_path =
        match install_claude_launcher_at(&bin_dir, &profile_name, &profile.config_dir) {
            Ok(path) => path,
            Err(error) => {
                // The new profile is independently usable, so preserve it if the optional
                // launcher cannot be written. Report an explicit failure so users can retry.
                return Err(format!(
                    "Profile created at '{}', but launcher installation failed: {error}",
                    profile.config_dir.display()
                ));
            }
        };
    let (path_added, path_warning) = match ensure_launcher_dir_on_user_path(&bin_dir) {
        Ok(added) => (added, None),
        Err(message) => (false, Some(format!(
            "Launcher saved but not registered on user PATH: {message}. Add '{}' to user PATH manually.",
            bin_dir.display()
        ))),
    };
    Ok(CreatedClaudeProfile {
        command_name: format!("claude-{profile_name}"),
        profile,
        launcher_path,
        path_added,
        path_warning,
    })
}

#[tauri::command]
pub fn read_claude_profile_settings(config_dir: String) -> Result<String, String> {
    let path = PathBuf::from(&config_dir).join("settings.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| {
        format!(
            "Failed to read settings.json from '{}': {e}",
            path.display()
        )
    })
}

#[tauri::command]
pub fn save_claude_profile_settings(config_dir: String, content: String) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON settings format: {e}"))?;
    let path = PathBuf::from(&config_dir).join("settings.json");
    let formatted = serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("Failed to format JSON settings: {e}"))?;
    std::fs::write(&path, formatted)
        .map_err(|e| format!("Failed to save settings.json to '{}': {e}", path.display()))
}

#[tauri::command]
pub fn delete_claude_profile(profile_name: String) -> Result<(), String> {
    if profile_name.is_empty()
        || profile_name.len() > 48
        || !profile_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid profile name to delete".into());
    }
    let root = managed_profile_root()?;
    let target_dir = root.join(&profile_name);
    if target_dir.exists() {
        std::fs::remove_dir_all(&target_dir).map_err(|e| {
            format!(
                "Failed to remove profile directory '{}': {e}",
                target_dir.display()
            )
        })?;
    }
    let bin_dir = managed_launcher_bin()?;
    let launcher = bin_dir.join(format!("claude-{profile_name}.cmd"));
    if launcher.exists() {
        let _ = std::fs::remove_file(&launcher);
    }
    Ok(())
}

pub use super::profiles::update_profile_settings_routing_key;

#[tauri::command]
pub fn update_claude_profiles_routing_key(
    manager: tauri::State<'_, crate::codex::router::CodexRouterManager>,
    new_key: String,
) -> Result<Vec<String>, String> {
    if new_key.trim().is_empty() {
        return Err("Routing key cannot be empty".into());
    }
    let root = match managed_profile_root() {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };
    let dirs = match list_managed_profile_dirs(&root) {
        Ok(d) => d,
        Err(_) => return Ok(Vec::new()),
    };
    let mut updated_profiles = Vec::new();
    let mut bindings = crate::storage::secure_storage::load_gateway_bindings().unwrap_or_default();

    for dir in dirs {
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let profile_opt = super::inspect_profile_dir(&dir).ok();
        let has_binding = profile_opt.as_ref().is_some_and(|prof| {
            bindings
                .iter()
                .any(|b| b.profile_id == prof.id && !b.revoked)
        });
        let settings_path = dir.join("settings.json");
        let mut root_val: serde_json::Value = if settings_path.is_file() {
            std::fs::read_to_string(&settings_path)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_else(|| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        update_profile_settings_routing_key(&mut root_val, &new_key, has_binding);

        let formatted = serde_json::to_string_pretty(&root_val)
            .map_err(|e| format!("Failed to serialize settings: {e}"))?;
        std::fs::write(&settings_path, formatted).map_err(|e| {
            format!(
                "Failed to write settings to '{}': {e}",
                settings_path.display()
            )
        })?;

        if let Some(profile) = profile_opt {
            for b in bindings.iter_mut() {
                if b.profile_id == profile.id && !b.revoked {
                    b.secret = new_key.clone();
                    let _ = crate::storage::secure_storage::save_gateway_binding(b);
                    if let Ok(mut map) = manager.client_bindings.try_write() {
                        map.insert(b.id.0.clone(), b.clone());
                    }
                }
            }
        }

        updated_profiles.push(name);
    }
    Ok(updated_profiles)
}
