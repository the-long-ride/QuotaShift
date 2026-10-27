use std::path::Path;

use super::io::{atomic_router_replace, codex_dir};
use super::{
    begin_codex_router_config_at_with_secret, ROUTER_RESTORE_ABSENT_FILE, ROUTER_RESTORE_FILE,
};

pub fn connect_codex_cli_at(
    dir: &Path,
    loopback_url: &str,
    router_secret: &str,
) -> Result<(), String> {
    begin_codex_router_config_at_with_secret(dir, loopback_url, router_secret)
}

pub fn disconnect_codex_cli_at(dir: &Path) -> Result<(), String> {
    let config_path = dir.join("config.toml");
    let restore_path = dir.join(ROUTER_RESTORE_FILE);
    let absent_path = dir.join(ROUTER_RESTORE_ABSENT_FILE);

    if !restore_path.exists() {
        if absent_path.exists() {
            let _ = std::fs::remove_file(&absent_path);
        }
        return Ok(());
    }

    if absent_path.exists() {
        if config_path.exists() {
            std::fs::remove_file(&config_path)
                .map_err(|error| format!("Failed to restore absent Codex config: {error}"))?;
        }
    } else if config_path.exists() {
        let original_bytes = std::fs::read(&restore_path).unwrap_or_default();
        let original_doc = std::str::from_utf8(&original_bytes)
            .ok()
            .and_then(|s| s.parse::<toml_edit::DocumentMut>().ok());
        let previous_provider = original_doc
            .as_ref()
            .and_then(|doc| doc.get("model_provider").and_then(toml_edit::Item::as_str))
            .map(|s| s.to_string());

        let current_text = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read current config: {e}"))?;
        let mut doc: toml_edit::DocumentMut = current_text
            .parse()
            .map_err(|e| format!("Failed to parse config.toml: {e}"))?;

        if let Some(prev) = previous_provider {
            doc.insert("model_provider", toml_edit::value(prev));
        } else {
            doc.remove("model_provider");
        }

        if let Some(providers) = doc
            .get_mut("model_providers")
            .and_then(toml_edit::Item::as_table_mut)
        {
            providers.remove("quotashift_router");
            if providers.is_empty() {
                doc.remove("model_providers");
            }
        }

        atomic_router_replace(&config_path, doc.to_string().as_bytes(), "config.toml")?;
    }

    let _ = std::fs::remove_file(&restore_path);
    if absent_path.exists() {
        let _ = std::fs::remove_file(&absent_path);
    }
    Ok(())
}

#[allow(dead_code)]
pub fn connect_codex_cli(loopback_url: &str, router_secret: &str) -> Result<(), String> {
    connect_codex_cli_at(&codex_dir()?, loopback_url, router_secret)
}

#[allow(dead_code)]
pub fn disconnect_codex_cli() -> Result<(), String> {
    disconnect_codex_cli_at(&codex_dir()?)
}
