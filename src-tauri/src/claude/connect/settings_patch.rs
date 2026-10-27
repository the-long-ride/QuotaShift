use std::collections::HashMap;
use std::path::Path;

use super::journal::PatchJournalEntry;
use super::settings_keys::{drop_created_env, get_setting, remove_setting, set_setting};

pub const FIXED_PORT_REQUIRED: &str = "Persist for this profile needs a fixed router port, because the address is written into settings.json. In Model Pools > Router Server, enter a Port (1024-65535), click Apply, then connect again. Launch once works on any port.";

/// A persistent profile stores the router address, so the router must run on a port the user
/// set explicitly. A random port or a fallback would break the profile on the next restart.
pub fn check_stable_endpoint(base_url: &str, fixed_port: bool) -> Result<(), String> {
    if base_url.trim().is_empty() {
        return Err("Gateway base URL is empty".to_string());
    }
    if !fixed_port {
        return Err(FIXED_PORT_REQUIRED.to_string());
    }
    Ok(())
}

pub fn apply_profile_patch(
    settings_path: &Path,
    patch_keys: &HashMap<String, serde_json::Value>,
) -> Result<PatchJournalEntry, String> {
    for (k, v) in patch_keys {
        let key_lower = k.to_ascii_lowercase();
        if matches!(
            key_lower.as_str(),
            "env.anthropic_auth_token" | "env.anthropic_api_key" | "env.openai_api_key"
        ) {
            return Err("Security violation: persistent bearer credentials require a protected native credential helper".to_string());
        }
        let v_str = v.to_string().to_lowercase();
        if v_str.contains("refresh_token")
            || v_str.contains("sk-proj-")
            || v_str.contains("access_token")
            || k.to_lowercase().contains("oauth")
        {
            return Err("Security violation: raw upstream OAuth tokens or API keys must never be written to Claude settings".to_string());
        }
    }

    let mut root = if settings_path.is_file() {
        let content = std::fs::read_to_string(settings_path)
            .map_err(|e| format!("Failed to read settings: {e}"))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("Invalid JSON in settings.json; refusing partial write: {e}"))?
    } else {
        serde_json::json!({})
    };

    if !root.is_object() {
        return Err("Settings root is not a JSON object".to_string());
    }

    let created_env = root.get("env").is_none() && patch_keys.keys().any(|k| k.starts_with("env."));
    let mut original_keys = HashMap::new();
    let mut patched_keys = Vec::new();

    for (key, new_val) in patch_keys {
        original_keys.insert(key.clone(), get_setting(&root, key).cloned());
        set_setting(&mut root, key, new_val.clone())?;
        patched_keys.push(key.clone());
    }

    let updated = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    std::fs::write(settings_path, updated).map_err(|e| {
        format!(
            "Failed to write settings to '{}': {e}",
            settings_path.display()
        )
    })?;

    Ok(PatchJournalEntry {
        timestamp_ms: chrono::Utc::now().timestamp_millis(),
        profile_path: settings_path.to_path_buf(),
        original_keys,
        patched_keys,
        patched_values: patch_keys.clone(),
        created_env,
        profile_id: String::new(),
    })
}

pub fn revert_profile_patch(
    settings_path: &Path,
    journal: &PatchJournalEntry,
) -> Result<(), String> {
    if !settings_path.is_file() {
        return Ok(());
    }

    let content = std::fs::read_to_string(settings_path)
        .map_err(|e| format!("Failed to read settings: {e}"))?;
    let mut root = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid JSON in settings.json: {e}"))?;

    if !root.is_object() {
        return Err("Settings root is not a JSON object".to_string());
    }

    // Check all managed keys before mutating any. A user edit wins over our journal.
    // `effortLevel` is excluded from conflict checks because Claude Code's `/effort`
    // command updates `effortLevel` in `settings.json` at runtime.
    let mut changed = Vec::new();
    for key in &journal.patched_keys {
        if key == "effortLevel" || key == "env.CLAUDE_CODE_EFFORT_LEVEL" {
            continue;
        }
        let expected = journal
            .patched_values
            .get(key)
            .ok_or_else(|| format!("disconnect conflict: missing committed value for {key}"))?;
        if get_setting(&root, key) != Some(expected) {
            changed.push(key.as_str());
        }
    }
    if !changed.is_empty() {
        changed.sort_unstable();
        return Err(format!(
            "disconnect conflict: you changed {} in settings.json since connecting. Use Dismiss to stop tracking it and leave your settings as they are.",
            changed.join(", ")
        ));
    }
    for key in &journal.patched_keys {
        let orig_val = journal
            .original_keys
            .get(key)
            .ok_or_else(|| format!("missing original value for {key}"))?;
        match orig_val {
            Some(val) => {
                set_setting(&mut root, key, val.clone())?;
            }
            None => {
                remove_setting(&mut root, key)?;
            }
        }
    }
    drop_created_env(&mut root, journal.created_env);

    let updated = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize reverted settings: {e}"))?;
    std::fs::write(settings_path, updated)
        .map_err(|e| format!("Failed to write reverted settings: {e}"))?;

    Ok(())
}
