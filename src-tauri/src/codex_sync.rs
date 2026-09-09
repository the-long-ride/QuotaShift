// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1
//! Codex config synchronization and safe credential persistence.
//!
//! API-key sync writes both `~/.codex/auth.json` and `config.toml`.
//! OAuth callers write their OAuth JSON separately and update only provider config,
//! so an empty API key can never overwrite valid ChatGPT credentials.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use crate::session::get_home_dir;

pub const ROUTER_RESTORE_FILE: &str = "config.toml.quotashift-router-restore";
const ROUTER_RESTORE_ABSENT_FILE: &str = "config.toml.quotashift-router-restore.absent";
pub(crate) const ROUTER_AUTH_HEADER: &str = "X-QuotaShift-Token";

pub(crate) fn generate_router_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn secure_directory(dir: &Path) -> Result<(), String> {
    match fs::symlink_metadata(dir) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(format!("Refusing symlink Codex directory: {}", dir.display()))
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err(format!("Codex path is not a directory: {}", dir.display()))
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(dir)
                .map_err(|error| format!("Failed to create Codex directory: {error}"))?;
        }
        Err(error) => return Err(format!("Failed to inspect Codex directory: {error}")),
    }

    #[cfg(unix)]
    fs::set_permissions(dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Failed to protect Codex directory: {error}"))?;
    Ok(())
}

fn codex_dir() -> Result<PathBuf, String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let dir = home.join(".codex");
    secure_directory(&dir)?;
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

fn reject_symlink(path: &Path, name: &str) -> Result<(), String> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(format!("Refusing symlink {name}: {}", path.display()));
        }
    }
    Ok(())
}

#[cfg(unix)]
fn restrictive_permissions(path: &Path) -> fs::Permissions {
    let mode = fs::symlink_metadata(path)
        .ok()
        .map(|metadata| metadata.permissions().mode() & 0o777)
        .filter(|mode| mode & 0o077 == 0)
        .unwrap_or(0o600);
    fs::Permissions::from_mode(mode)
}

fn protect_existing_file(path: &Path, name: &str) -> Result<(), String> {
    reject_symlink(path, name)?;
    #[cfg(unix)]
    if path.exists() {
        fs::set_permissions(path, restrictive_permissions(path))
            .map_err(|error| format!("Failed to protect {name}: {error}"))?;
    }
    Ok(())
}

fn open_exclusive_private(path: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    options.open(path)
}

fn unique_temp_file(path: &Path, bytes: &[u8], name: &str) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Missing parent directory for {name}"))?;
    secure_directory(parent)?;
    for _ in 0..32 {
        let mut random = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut random);
        let suffix = URL_SAFE_NO_PAD.encode(random);
        let candidate = parent.join(format!(".{name}.quotashift-{suffix}.tmp"));
        match open_exclusive_private(&candidate) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
                    let _ = fs::remove_file(&candidate);
                    return Err(format!("Failed to write temporary {name}: {error}"));
                }
                #[cfg(unix)]
                if let Err(error) = fs::set_permissions(&candidate, restrictive_permissions(path)) {
                    let _ = fs::remove_file(&candidate);
                    return Err(format!("Failed to protect temporary {name}: {error}"));
                }
                return Ok(candidate);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create temporary {name}: {error}")),
        }
    }
    Err(format!("Failed to allocate unique temporary {name}"))
}

fn atomic_replace_bytes(path: &Path, bytes: &[u8], name: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        secure_directory(parent)?;
    }
    reject_symlink(path, name)?;
    let temporary = unique_temp_file(path, bytes, name)?;
    if let Err(rename_error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Failed to rename {name}: {rename_error}"));
    }
    Ok(())
}

fn atomic_router_replace(path: &Path, bytes: &[u8], name: &str) -> Result<(), String> {
    atomic_replace_bytes(path, bytes, name)
}

fn write_codex_router_config_at(
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

fn redact_sensitive_auth_fields(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(object) => {
            let keys: Vec<String> = object
                .keys()
                .filter(|key| {
                    let key = key.to_ascii_lowercase();
                    key.contains("token")
                        || key.contains("secret")
                        || key.contains("password")
                        || key.contains("api_key")
                        || key == "authorization"
                })
                .cloned()
                .collect();
            for key in keys {
                object.remove(&key);
            }
            for child in object.values_mut() {
                redact_sensitive_auth_fields(child);
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact_sensitive_auth_fields(value);
            }
        }
        _ => {}
    }
}

/// Restore Codex config from backup (if exists).
pub fn restore_codex_config() -> Result<(), String> {
    let dir = codex_dir()?;

    for name in &["auth.json", "config.toml"] {
        let backup_path = dir.join(format!("{}.antigravity.bak", name));
        let target_path = dir.join(name);
        if backup_path.exists() {
            reject_symlink(&backup_path, "Codex backup")?;
            let content = fs::read(&backup_path)
                .map_err(|error| format!("Failed to read backup for {name}: {error}"))?;
            atomic_replace_bytes(&target_path, &content, name)?;
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
                redact_sensitive_auth_fields(&mut auth_data);
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
        secure_directory(parent)?;
    }
    reject_symlink(path, name)?;
    if path.exists() {
        let backup_path = path.with_file_name(format!("{}.antigravity.bak", name));
        reject_symlink(&backup_path, "Codex backup")?;
        if !backup_path.exists() {
            let original = fs::read(path)
                .map_err(|error| format!("Failed to read source for {name} backup: {error}"))?;
            atomic_replace_bytes(&backup_path, &original, "Codex backup")?;
        } else {
            protect_existing_file(&backup_path, "Codex backup")?;
        }
    }
    atomic_replace_bytes(path, content.as_bytes(), name)
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

    #[test]
    fn router_provider_config_uses_custom_secret_header_and_restores() {
        let temp = std::env::temp_dir().join(format!(
            "qs-router-provider-secret-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        let config = temp.join("config.toml");
        let secret = "synthetic-router-secret";
        std::fs::write(&config, "model_provider = \"direct\"\n").unwrap();

        begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29101", secret)
            .unwrap();
        let routed = std::fs::read_to_string(&config).unwrap();
        assert!(routed.contains("http_headers"));
        assert!(routed.contains(ROUTER_AUTH_HEADER));
        assert!(routed.contains(secret));
        restore_codex_router_config_at(&temp).unwrap();
        assert_eq!(std::fs::read_to_string(&config).unwrap(), "model_provider = \"direct\"\n");
        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn router_temp_paths_are_unique_and_preexisting_deterministic_temp_is_untouched() {
        let temp = std::env::temp_dir().join(format!(
            "qs-router-unique-temp-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        let config = temp.join("config.toml");
        let old_temp = temp.join("config.toml.quotashift-router.tmp");
        std::fs::write(&old_temp, b"sentinel").unwrap();

        begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29102", "secret")
            .unwrap();
        assert_eq!(std::fs::read(&old_temp).unwrap(), b"sentinel");
        assert!(std::fs::read_to_string(&config)
            .unwrap()
            .contains("X-QuotaShift-Token"));
        restore_codex_router_config_at(&temp).unwrap();
        let _ = std::fs::remove_dir_all(&temp);
    }

    #[cfg(unix)]
    #[test]
    fn router_auth_config_backup_and_directory_are_owner_only() {
        let temp = std::env::temp_dir().join(format!(
            "qs-router-permissions-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        let config = temp.join("config.toml");
        std::fs::write(&config, b"model_provider = \"direct\"\n").unwrap();

        begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29103", "secret")
            .unwrap();
        let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&temp), 0o700);
        assert_eq!(mode(&config), 0o600);
        assert_eq!(mode(&temp.join(ROUTER_RESTORE_FILE)), 0o600);
        assert!(!temp.join("config.toml.quotashift-router.tmp").exists());

        let auth = temp.join("auth.json");
        std::fs::write(&auth, b"{\"old\":true}").unwrap();
        write_codex_auth_value_at(&auth, &serde_json::json!({"OPENAI_API_KEY": "synthetic"}))
            .unwrap();
        assert_eq!(mode(&auth), 0o600);
        assert_eq!(mode(&temp.join("auth.json.antigravity.bak")), 0o600);

        restore_codex_router_config_at(&temp).unwrap();
        assert_eq!(mode(&config), 0o600);
        let _ = std::fs::remove_dir_all(&temp);
    }

    #[cfg(unix)]
    #[test]
    fn preexisting_temp_symlink_is_not_followed() {
        use std::os::unix::fs::symlink;

        let temp = std::env::temp_dir().join(format!(
            "qs-router-temp-symlink-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        let target = temp.join("sentinel");
        let old_temp = temp.join("config.toml.quotashift-router.tmp");
        std::fs::write(&target, b"sentinel").unwrap();
        symlink(&target, &old_temp).unwrap();

        begin_codex_router_config_at_with_secret(&temp, "http://127.0.0.1:29104", "secret")
            .unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"sentinel");
        assert!(std::fs::symlink_metadata(&old_temp)
            .unwrap()
            .file_type()
            .is_symlink());
        restore_codex_router_config_at(&temp).unwrap();
        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn status_redacts_authentication_fields() {
        let mut value = serde_json::json!({
            "auth_mode": "chatgpt",
            "tokens": {"access_token": "access", "refresh_token": "refresh"},
            "OPENAI_API_KEY": "api-key",
            "account_id": "account"
        });
        redact_sensitive_auth_fields(&mut value);
        assert_eq!(value["account_id"], "account");
        assert!(value.get("OPENAI_API_KEY").is_none());
        assert!(value["tokens"].get("access_token").is_none());
        assert!(value["tokens"].get("refresh_token").is_none());
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
