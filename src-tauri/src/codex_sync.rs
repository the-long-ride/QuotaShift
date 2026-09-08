// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1
//! Codex config synchronization and safe credential persistence.
//!
//! API-key sync writes both `~/.codex/auth.json` and `config.toml`.
//! OAuth callers write their OAuth JSON separately and update only provider config,
//! so an empty API key can never overwrite valid ChatGPT credentials.

use std::path::{Path, PathBuf};

use crate::session::get_home_dir;

pub const ROUTER_RESTORE_FILE: &str = "config.toml.quotashift-router-restore";
const ROUTER_RESTORE_ABSENT_FILE: &str = "config.toml.quotashift-router-restore.absent";

fn codex_dir() -> Result<PathBuf, String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let dir = home.join(".codex");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create .codex dir: {}", e))?;
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
    let value: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("Invalid Codex auth JSON: {}", e))?;
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
pub fn sync_codex_config(api_key: &str, base_url: &str, model: Option<&str>) -> Result<(), String> {
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

fn atomic_router_replace(path: &Path, bytes: &[u8], name: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create directory for {name}: {error}"))?;
    }
    let permissions = std::fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let temporary = path.with_file_name(format!("{name}.quotashift-router.tmp"));
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("Failed to write temporary {name}: {error}"))?;
    if let Some(permissions) = permissions {
        std::fs::set_permissions(&temporary, permissions)
            .map_err(|error| format!("Failed to preserve permissions for {name}: {error}"))?;
    }
    if let Err(rename_error) = std::fs::rename(&temporary, path) {
        if path.exists() {
            std::fs::remove_file(path).map_err(|error| {
                format!("Failed to replace {name} after {rename_error}: {error}")
            })?;
            std::fs::rename(&temporary, path)
                .map_err(|error| format!("Failed to install replacement {name}: {error}"))?;
        } else {
            return Err(format!("Failed to rename {name}: {rename_error}"));
        }
    }
    Ok(())
}

fn write_codex_router_config_at(path: &Path, loopback_url: &str) -> Result<(), String> {
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
        }
    }

    atomic_router_replace(path, doc.to_string().as_bytes(), "config.toml")
}

fn config_points_at_quotashift_loopback(path: &Path) -> bool {
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

pub(crate) fn begin_codex_router_config_at(dir: &Path, loopback_url: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir)
        .map_err(|error| format!("Failed to create Codex directory: {error}"))?;
    let config_path = dir.join("config.toml");
    let restore_path = dir.join(ROUTER_RESTORE_FILE);
    let created_snapshot = !restore_path.exists();

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

    if let Err(error) = write_codex_router_config_at(&config_path, loopback_url) {
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

pub(crate) fn begin_codex_router_config(loopback_url: &str) -> Result<(), String> {
    begin_codex_router_config_at(&codex_dir()?, loopback_url)
}

pub(crate) fn restore_codex_router_config() -> Result<(), String> {
    restore_codex_router_config_at(&codex_dir()?)
}

pub(crate) fn recover_stale_codex_router_config() -> Result<bool, String> {
    recover_stale_codex_router_config_at(&codex_dir()?)
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

    let existing_permissions = std::fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
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

// QUOTASHIFT_CODEX_ROUTER_TASK4_CONFIG_LIFECYCLE_TESTS
#[cfg(test)]
mod router_config_lifecycle_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(name: &str) -> PathBuf {
        let serial = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "quotashift-codex-router-{name}-{}-{serial}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn original_config() -> &'static [u8] {
        b"# keep this comment and formatting exactly\nmodel_provider = \"direct\"\nmodel = \"gpt-direct\"\n\n[model_providers.direct]\nname = \"Direct provider\"\nwire_api = \"responses\"\nbase_url = \"https://api.openai.com/v1\"\nrequires_openai_auth = true\n"
    }

    #[test]
    fn begin_snapshots_original_once_and_points_config_at_loopback() {
        let dir = temp_dir("begin");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:21001").unwrap();
        assert_eq!(std::fs::read(&restore).unwrap(), original_config());
        let first_routed = std::fs::read_to_string(&config).unwrap();
        assert!(first_routed.contains("http://127.0.0.1:21001"));

        begin_codex_router_config_at(&dir, "http://127.0.0.1:21002").unwrap();
        assert_eq!(std::fs::read(&restore).unwrap(), original_config());
        let second_routed = std::fs::read_to_string(&config).unwrap();
        assert!(second_routed.contains("http://127.0.0.1:21002"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_is_byte_exact_and_removes_router_restore_marker() {
        let dir = temp_dir("restore");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:22001").unwrap();
        restore_codex_router_config_at(&dir).unwrap();

        assert_eq!(std::fs::read(&config).unwrap(), original_config());
        assert!(!restore.exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_recovery_restores_stale_quotashift_loopback_config() {
        let dir = temp_dir("recover-stale");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:23001").unwrap();
        assert!(restore.exists());
        assert!(recover_stale_codex_router_config_at(&dir).unwrap());
        assert_eq!(std::fs::read(&config).unwrap(), original_config());
        assert!(!restore.exists());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_recovery_leaves_normal_direct_config_unchanged() {
        let dir = temp_dir("recover-direct");
        let config = dir.join("config.toml");
        let restore = dir.join(ROUTER_RESTORE_FILE);
        std::fs::write(&config, original_config()).unwrap();
        std::fs::write(
            &restore,
            b"stale snapshot that must not replace direct config",
        )
        .unwrap();

        assert!(!recover_stale_codex_router_config_at(&dir).unwrap());
        assert_eq!(std::fs::read(&config).unwrap(), original_config());
        assert!(!restore.exists());

        let _ = std::fs::remove_dir_all(dir);
    }
}

// QUOTASHIFT_CODEX_ROUTER_REVIEW_LIFECYCLE_TESTS
#[cfg(test)]
mod router_review_lifecycle_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(name: &str) -> PathBuf {
        let serial = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "quotashift-router-review-{name}-{}-{serial}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn restore_removes_config_when_it_was_absent_before_routing() {
        let dir = temp_dir("absent");
        let config = dir.join("config.toml");
        assert!(!config.exists());

        begin_codex_router_config_at(&dir, "http://127.0.0.1:24001").unwrap();
        assert!(config.exists());
        restore_codex_router_config_at(&dir).unwrap();

        assert!(
            !config.exists(),
            "restore must preserve the original absent state"
        );
        assert!(!dir.join(ROUTER_RESTORE_FILE).exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn recovery_restores_existing_snapshot_if_router_config_disappeared_mid_replace() {
        let dir = temp_dir("missing-mid-replace");
        let config = dir.join("config.toml");
        let original = b"model_provider = \"direct\"\n[model_providers.direct]\nbase_url = \"https://api.openai.com/v1\"\nwire_api = \"responses\"\n";
        std::fs::write(&config, original).unwrap();

        begin_codex_router_config_at(&dir, "http://127.0.0.1:24002").unwrap();
        std::fs::remove_file(&config).unwrap();

        assert!(recover_stale_codex_router_config_at(&dir).unwrap());
        assert_eq!(std::fs::read(&config).unwrap(), original);
        assert!(!dir.join(ROUTER_RESTORE_FILE).exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}
