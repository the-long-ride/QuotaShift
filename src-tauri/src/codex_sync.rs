//! Codex config sync — writes auth.json AND config.toml with custom provider.
//! Pattern learned from Antigravity-Manager's cli_sync.rs and ai-switcher's tools.rs.
//!
//! Writes:
//!   ~/.codex/auth.json     — OPENAI_API_KEY + OPENAI_BASE_URL
//!   ~/.codex/config.toml   — model_providers.custom with wire_api, base_url
//!
//! Uses atomic writes (tmp → rename) and creates .antigravity.bak backup on first sync.

use std::path::PathBuf;

use crate::session::get_home_dir;

/// Write Codex auth.json with API key + base URL
pub fn write_codex_auth_json(api_key: &str, base_url: &str) -> Result<(), String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let codex_dir = home.join(".codex");
    if !codex_dir.exists() {
        std::fs::create_dir_all(&codex_dir).map_err(|e| format!("Failed to create .codex dir: {}", e))?;
    }

    let path = codex_dir.join("auth.json");
    let content = serde_json::json!({
        "OPENAI_API_KEY": api_key,
        "OPENAI_BASE_URL": base_url,
    });
    let content_str = serde_json::to_string_pretty(&content).unwrap();

    atomic_write_with_backup(&path, &content_str, "auth.json")?;
    Ok(())
}

/// Write Codex config.toml with custom provider configuration
pub fn write_codex_config_toml(
    base_url: &str,
    model: Option<&str>,
) -> Result<(), String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let codex_dir = home.join(".codex");
    if !codex_dir.exists() {
        std::fs::create_dir_all(&codex_dir).map_err(|e| format!("Failed to create .codex dir: {}", e))?;
    }

    let path = codex_dir.join("config.toml");

    // Read existing config or start fresh
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

    // Root keys
    doc.insert("model_provider", toml_edit::value(provider_key));
    if let Some(m) = model {
        doc.insert("model", toml_edit::value(m));
    }
    doc.remove("openai_api_key");
    doc.remove("openai_base_url");

    // [model_providers.custom]
    let providers = doc
        .entry("model_providers")
        .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
    if let Some(p_table) = providers.as_table_mut() {
        let custom = p_table
            .entry(provider_key)
            .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
        if let Some(c_table) = custom.as_table_mut() {
            c_table.insert("name", toml_edit::value(display_name));
            c_table.insert("wire_api", toml_edit::value("responses"));
            c_table.insert("requires_openai_auth", toml_edit::value(true));
            c_table.insert("base_url", toml_edit::value(base_url));
            if let Some(m) = model {
                c_table.insert("model", toml_edit::value(m));
            }
        }
    }

    let content = doc.to_string();

    atomic_write_with_backup(&path, &content, "config.toml")?;
    Ok(())
}

/// Write both auth.json and config.toml for a complete Codex sync
pub fn sync_codex_config(
    api_key: &str,
    base_url: &str,
    model: Option<&str>,
) -> Result<(), String> {
    write_codex_auth_json(api_key, base_url)?;
    write_codex_config_toml(base_url, model)?;
    Ok(())
}

/// Restore Codex config from backup (if exists)
pub fn restore_codex_config() -> Result<(), String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let codex_dir = home.join(".codex");

    for name in &["auth.json", "config.toml"] {
        let bak_path = codex_dir.join(format!("{}.antigravity.bak", name));
        let target_path = codex_dir.join(name);
        if bak_path.exists() {
            std::fs::copy(&bak_path, &target_path)
                .map_err(|e| format!("Failed to restore {}: {}", name, e))?;
        }
    }
    Ok(())
}

/// Get current Codex config status
pub fn get_codex_sync_status() -> Result<serde_json::Value, String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let codex_dir = home.join(".codex");

    let auth_path = codex_dir.join("auth.json");
    let config_path = codex_dir.join("config.toml");
    let auth_bak = codex_dir.join("auth.json.antigravity.bak");
    let config_bak = codex_dir.join("config.toml.antigravity.bak");

    let mut auth_data = serde_json::json!({});
    let mut current_base_url: Option<String> = None;

    if auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&auth_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                auth_data = parsed;
                current_base_url = auth_data
                    .get("OPENAI_BASE_URL")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
        }
    }

    Ok(serde_json::json!({
        "authExists": auth_path.exists(),
        "configExists": config_path.exists(),
        "hasBackup": auth_bak.exists() || config_bak.exists(),
        "currentBaseUrl": current_base_url,
        "authData": auth_data,
    }))
}

/// Atomic write: write to .tmp, then rename. Creates backup on first sync.
fn atomic_write_with_backup(path: &PathBuf, content: &str, name: &str) -> Result<(), String> {
    // Create backup on first sync (only if no backup exists yet)
    if path.exists() {
        let backup_path = path.with_file_name(format!("{}.antigravity.bak", name));
        if !backup_path.exists() {
            std::fs::copy(path, &backup_path).map_err(|e| {
                format!("Failed to create backup for {}: {}", name, e)
            })?;
        }
    }

    // Atomic write: write to tmp, then rename
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, content)
        .map_err(|e| format!("Failed to write tmp {}: {}", name, e))?;
    std::fs::rename(&tmp_path, path)
        .map_err(|e| format!("Failed to rename {}: {}", name, e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atomic_write_creates_backup() {
        let tmp = std::env::temp_dir().join("qs_test_atomic");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();

        let path = tmp.join("test.json");

        // First write
        std::fs::write(&path, "original").unwrap();
        atomic_write_with_backup(&path, "updated", "test.json").unwrap();

        // Backup should exist
        let bak = tmp.join("test.json.antigravity.bak");
        assert!(bak.exists());
        assert_eq!(std::fs::read_to_string(&bak).unwrap(), "original");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "updated");

        // Second write — backup preserved
        atomic_write_with_backup(&path, "updated again", "test.json").unwrap();
        assert_eq!(std::fs::read_to_string(&bak).unwrap(), "original");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "updated again");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
