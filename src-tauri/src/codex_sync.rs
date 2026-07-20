// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1
//! Codex config synchronization and safe credential persistence.
//!
//! API-key sync writes both `~/.codex/auth.json` and `config.toml`.
//! OAuth callers write their OAuth JSON separately and update only provider config,
//! so an empty API key can never overwrite valid ChatGPT credentials.

use std::path::{Path, PathBuf};

use crate::session::get_home_dir;

fn codex_dir() -> Result<PathBuf, String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let dir = home.join(".codex");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create .codex dir: {}", e))?;
    }
    Ok(dir)
}

/// Write Codex auth.json with API-key credentials.
pub fn write_codex_auth_json(api_key: &str, base_url: &str) -> Result<(), String> {
    let content = serde_json::json!({
        "auth_mode": "openai_api_key",
        "OPENAI_API_KEY": api_key,
        "OPENAI_BASE_URL": base_url,
    });
    write_codex_auth_value(&content)
}

/// Validate and atomically write complete Codex auth JSON supplied by an OAuth or API-key caller.
pub fn write_codex_auth_content(content: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("Invalid Codex auth JSON: {}", e))?;
    write_codex_auth_value(&value)
}

/// Atomically write a complete Codex auth value while preserving a one-time backup.
pub fn write_codex_auth_value(value: &serde_json::Value) -> Result<(), String> {
    let path = codex_dir()?.join("auth.json");
    write_codex_auth_value_at(&path, value)
}

pub(crate) fn write_codex_auth_value_at(
    path: &Path,
    value: &serde_json::Value,
) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize Codex auth JSON: {}", e))?;
    atomic_write_with_backup(path, &content, "auth.json")
}

/// Write Codex config.toml with custom provider configuration.
pub fn write_codex_config_toml(base_url: &str, model: Option<&str>) -> Result<(), String> {
    let path = codex_dir()?.join("config.toml");

    let existing = if path.exists() {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };

    let mut doc: toml_edit::DocumentMut = existing
        .parse()
        .unwrap_or_else(|_| toml_edit::DocumentMut::new());

    let provider_key = "custom";
    let display_name = "QuotaShift";

    doc.insert("model_provider", toml_edit::value(provider_key));
    if let Some(model) = model {
        doc.insert("model", toml_edit::value(model));
    }
    doc.remove("openai_api_key");
    doc.remove("openai_base_url");

    let providers = doc
        .entry("model_providers")
        .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
    if let Some(provider_table) = providers.as_table_mut() {
        let custom = provider_table
            .entry(provider_key)
            .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
        if let Some(custom_table) = custom.as_table_mut() {
            custom_table.insert("name", toml_edit::value(display_name));
            custom_table.insert("wire_api", toml_edit::value("responses"));
            custom_table.insert("requires_openai_auth", toml_edit::value(true));
            custom_table.insert("base_url", toml_edit::value(base_url));
            if let Some(model) = model {
                custom_table.insert("model", toml_edit::value(model));
            }
        }
    }

    atomic_write_with_backup(&path, &doc.to_string(), "config.toml")
}

/// Write both API-key auth.json and provider config for a complete API-key sync.
pub fn sync_codex_config(
    api_key: &str,
    base_url: &str,
    model: Option<&str>,
) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("Refusing to overwrite Codex auth.json with an empty API key".to_string());
    }
    write_codex_auth_json(api_key, base_url)?;
    write_codex_config_toml(base_url, model)
}

/// Update provider settings without replacing OAuth credentials.
pub fn sync_codex_provider_config(base_url: &str, model: Option<&str>) -> Result<(), String> {
    write_codex_config_toml(base_url, model)
}

/// Restore Codex config from backup (if exists).
pub fn restore_codex_config() -> Result<(), String> {
    let dir = codex_dir()?;

    for name in &["auth.json", "config.toml"] {
        let backup_path = dir.join(format!("{}.antigravity.bak", name));
        let target_path = dir.join(name);
        if backup_path.exists() {
            std::fs::copy(&backup_path, &target_path)
                .map_err(|e| format!("Failed to restore {}: {}", name, e))?;
        }
    }
    Ok(())
}

/// Get current Codex config status.
pub fn get_codex_sync_status() -> Result<serde_json::Value, String> {
    let dir = codex_dir()?;
    let auth_path = dir.join("auth.json");
    let config_path = dir.join("config.toml");
    let auth_backup = dir.join("auth.json.antigravity.bak");
    let config_backup = dir.join("config.toml.antigravity.bak");

    let mut auth_data = serde_json::json!({});
    let mut current_base_url: Option<String> = None;

    if auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&auth_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                auth_data = parsed;
                current_base_url = auth_data
                    .get("OPENAI_BASE_URL")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
            }
        }
    }

    Ok(serde_json::json!({
        "authExists": auth_path.exists(),
        "configExists": config_path.exists(),
        "hasBackup": auth_backup.exists() || config_backup.exists(),
        "currentBaseUrl": current_base_url,
        "authData": auth_data,
    }))
}

/// Best-effort atomic write: write a sibling temporary file, preserve permissions,
/// then rename it into place. A deterministic backup is created once.
fn atomic_write_with_backup(path: &Path, content: &str, name: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory for {}: {}", name, e))?;
    }

    let existing_permissions = std::fs::metadata(path).ok().map(|metadata| metadata.permissions());
    if path.exists() {
        let backup_path = path.with_file_name(format!("{}.antigravity.bak", name));
        if !backup_path.exists() {
            std::fs::copy(path, &backup_path)
                .map_err(|e| format!("Failed to create backup for {}: {}", name, e))?;
        }
    }

    let temporary_path = path.with_file_name(format!("{}.quotashift.tmp", name));
    std::fs::write(&temporary_path, content)
        .map_err(|e| format!("Failed to write temporary {}: {}", name, e))?;
    if let Some(permissions) = existing_permissions {
        std::fs::set_permissions(&temporary_path, permissions)
            .map_err(|e| format!("Failed to preserve permissions for {}: {}", name, e))?;
    }

    if let Err(rename_error) = std::fs::rename(&temporary_path, path) {
        if path.exists() {
            std::fs::remove_file(path)
                .map_err(|e| format!("Failed to replace {} after {}: {}", name, rename_error, e))?;
            std::fs::rename(&temporary_path, path)
                .map_err(|e| format!("Failed to install replacement {}: {}", name, e))?;
        } else {
            return Err(format!("Failed to rename {}: {}", name, rename_error));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
