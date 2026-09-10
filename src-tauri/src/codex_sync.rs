// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1
//! Codex config synchronization and safe credential persistence.

#[path = "codex_sync_auth.rs"]
pub mod auth;
#[path = "codex_sync_io.rs"]
pub mod io;

pub use auth::*;
pub use io::*;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use std::path::Path;

pub const ROUTER_RESTORE_FILE: &str = "config.toml.quotashift-router-restore";
pub(crate) const ROUTER_RESTORE_ABSENT_FILE: &str = "config.toml.quotashift-router-restore.absent";
pub(crate) const ROUTER_AUTH_HEADER: &str = "X-QuotaShift-Token";

pub(crate) fn generate_router_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub(crate) fn write_codex_router_config_at(
    path: &Path,
    loopback_url: &str,
    router_secret: &str,
) -> Result<(), String> {
    let existing = if path.exists() {
        std::fs::read_to_string(path).unwrap_or_default()
    } else {
        String::new()
    };
    let mut doc: toml_edit::DocumentMut = existing
        .parse()
        .unwrap_or_else(|_| toml_edit::DocumentMut::new());

    let provider_key = "quotashift_router";
    doc.insert("model_provider", toml_edit::value(provider_key));
    doc.remove("openai_api_key");
    doc.remove("openai_base_url");

    let providers = doc
        .entry("model_providers")
        .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
    if let Some(provider_table) = providers.as_table_mut() {
        let router = provider_table
            .entry(provider_key)
            .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
        if let Some(router_table) = router.as_table_mut() {
            router_table.insert("name", toml_edit::value("QuotaShift"));
            router_table.insert("wire_api", toml_edit::value("responses"));
            router_table.insert("requires_openai_auth", toml_edit::value(true));
            router_table.insert("base_url", toml_edit::value(loopback_url));
            router_table.remove("env_key");
            let headers = router_table
                .entry("http_headers")
                .or_insert(toml_edit::Item::Table(toml_edit::Table::new()));
            if let Some(headers) = headers.as_table_mut() {
                headers.insert(ROUTER_AUTH_HEADER, toml_edit::value(router_secret));
            }
        }
    }

    atomic_router_replace(path, doc.to_string().as_bytes(), "config.toml")
}

pub(crate) fn config_points_at_quotashift_loopback(path: &Path) -> bool {
    let Ok(content) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(doc) = content.parse::<toml_edit::DocumentMut>() else {
        return false;
    };
    let Some(provider_key) = doc.get("model_provider").and_then(toml_edit::Item::as_str) else {
        return false;
    };
    let Some(provider) = doc
        .get("model_providers")
        .and_then(toml_edit::Item::as_table)
        .and_then(|providers| providers.get(provider_key))
        .and_then(toml_edit::Item::as_table)
    else {
        return false;
    };
    let named_quotashift = provider
        .get("name")
        .and_then(toml_edit::Item::as_str)
        .is_some_and(|name| name == "QuotaShift");
    let loopback = provider
        .get("base_url")
        .and_then(toml_edit::Item::as_str)
        .is_some_and(|url| url.starts_with("http://127.0.0.1:"));
    named_quotashift && loopback
}

#[allow(dead_code)]
pub(crate) fn begin_codex_router_config_at(dir: &Path, loopback_url: &str) -> Result<(), String> {
    let router_secret = generate_router_secret();
    begin_codex_router_config_at_with_secret(dir, loopback_url, &router_secret)
}

pub(crate) fn begin_codex_router_config_at_with_secret(
    dir: &Path,
    loopback_url: &str,
    router_secret: &str,
) -> Result<(), String> {
    secure_directory(dir)?;
    let config_path = dir.join("config.toml");
    let restore_path = dir.join(ROUTER_RESTORE_FILE);
    let created_snapshot = !restore_path.exists();
    protect_existing_file(&restore_path, "Codex router restore snapshot")?;

    if created_snapshot {
        let absent_path = dir.join(ROUTER_RESTORE_ABSENT_FILE);
        let original = if config_path.exists() {
            if absent_path.exists() {
                std::fs::remove_file(&absent_path).map_err(|error| {
                    format!("Failed to clear stale Codex absence marker: {error}")
                })?;
            }
            std::fs::read(&config_path)
                .map_err(|error| format!("Failed to snapshot Codex config: {error}"))?
        } else {
            atomic_router_replace(&absent_path, b"absent", ROUTER_RESTORE_ABSENT_FILE)?;
            Vec::new()
        };
        atomic_router_replace(&restore_path, &original, ROUTER_RESTORE_FILE)?;
    }

    if let Err(error) = write_codex_router_config_at(&config_path, loopback_url, router_secret) {
        if created_snapshot {
            let _ = restore_codex_router_config_at(dir);
        }
        return Err(error);
    }
    Ok(())
}

pub(crate) fn restore_codex_router_config_at(dir: &Path) -> Result<(), String> {
    let config_path = dir.join("config.toml");
    let restore_path = dir.join(ROUTER_RESTORE_FILE);
    let absent_path = dir.join(ROUTER_RESTORE_ABSENT_FILE);
    if !restore_path.exists() {
        if absent_path.exists() {
            std::fs::remove_file(&absent_path).map_err(|error| {
                format!("Failed to remove orphan Codex absence marker: {error}")
            })?;
        }
        return Ok(());
    }
    if absent_path.exists() {
        if config_path.exists() {
            std::fs::remove_file(&config_path)
                .map_err(|error| format!("Failed to restore absent Codex config: {error}"))?;
        }
    } else {
        let original = std::fs::read(&restore_path)
            .map_err(|error| format!("Failed to read Codex router restore snapshot: {error}"))?;
        atomic_router_replace(&config_path, &original, "config.toml")?;
    }
    std::fs::remove_file(&restore_path)
        .map_err(|error| format!("Failed to remove Codex router restore snapshot: {error}"))?;
    if absent_path.exists() {
        std::fs::remove_file(&absent_path)
            .map_err(|error| format!("Failed to remove Codex absence marker: {error}"))?;
    }
    Ok(())
}

pub(crate) fn recover_stale_codex_router_config_at(dir: &Path) -> Result<bool, String> {
    let config_path = dir.join("config.toml");
    let restore_path = dir.join(ROUTER_RESTORE_FILE);
    let absent_path = dir.join(ROUTER_RESTORE_ABSENT_FILE);
    if !restore_path.exists() {
        if absent_path.exists() {
            std::fs::remove_file(&absent_path).map_err(|error| {
                format!("Failed to remove orphan Codex absence marker: {error}")
            })?;
        }
        return Ok(false);
    }
    if config_points_at_quotashift_loopback(&config_path) {
        restore_codex_router_config_at(dir)?;
        return Ok(true);
    }
    if !config_path.exists() {
        if absent_path.exists() {
            std::fs::remove_file(&restore_path).map_err(|error| {
                format!("Failed to discard stale Codex router restore snapshot: {error}")
            })?;
            std::fs::remove_file(&absent_path)
                .map_err(|error| format!("Failed to remove Codex absence marker: {error}"))?;
            return Ok(false);
        }
        restore_codex_router_config_at(dir)?;
        return Ok(true);
    }
    std::fs::remove_file(&restore_path).map_err(|error| {
        format!("Failed to discard stale Codex router restore snapshot: {error}")
    })?;
    if absent_path.exists() {
        std::fs::remove_file(&absent_path)
            .map_err(|error| format!("Failed to remove Codex absence marker: {error}"))?;
    }
    Ok(false)
}

#[allow(dead_code)]
pub(crate) fn begin_codex_router_config(loopback_url: &str) -> Result<(), String> {
    let router_secret = generate_router_secret();
    begin_codex_router_config_with_secret(loopback_url, &router_secret)
}

pub(crate) fn begin_codex_router_config_with_secret(
    loopback_url: &str,
    router_secret: &str,
) -> Result<(), String> {
    begin_codex_router_config_at_with_secret(&codex_dir()?, loopback_url, router_secret)
}

pub(crate) fn restore_codex_router_config() -> Result<(), String> {
    restore_codex_router_config_at(&codex_dir()?)
}

pub(crate) fn recover_stale_codex_router_config() -> Result<bool, String> {
    recover_stale_codex_router_config_at(&codex_dir()?)
}

#[cfg(test)]
#[path = "codex_sync_test.rs"]
mod tests;
