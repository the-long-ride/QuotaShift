use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use crate::types::ExactAntigravityAccountRequest;

pub const WORKER_SCHEMA_VERSION: u32 = 1;
pub const WORKER_MARKER_FILE: &str = "worker-marker.json";
pub const PROFILE_WRITER: &str = include_str!("python/write_worker_vscdb.py");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerMarker {
    pub schema_version: u32,
    pub account_id: String,
    pub ownership_nonce: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct ManagedAntigravityWorker {
    pub account_id: String,
    pub profile_dir: PathBuf,
    pub ownership_nonce: String,
    pub root_pid: u32,
    pub language_server_pid: Option<u32>,
    pub port: Option<u16>,
    pub csrf_token: Option<String>,
    pub started_at: String,
}

pub fn now_string() -> String {
    Utc::now().to_rfc3339()
}

pub fn sanitize_account_id(account_id: &str) -> String {
    let value: String = account_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if value.is_empty() {
        "account".to_string()
    } else {
        value
    }
}

pub fn worker_root_dir() -> Result<PathBuf, String> {
    let home = crate::session::get_home_dir()
        .ok_or_else(|| "Could not locate the user home directory".to_string())?;
    Ok(home.join(".quotashift").join("antigravity-workers"))
}

pub fn worker_profile_dir(account_id: &str) -> Result<PathBuf, String> {
    Ok(worker_root_dir()?.join(sanitize_account_id(account_id)))
}

pub fn ensure_private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn generate_nonce() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn marker_path(profile_dir: &Path) -> PathBuf {
    profile_dir.join(WORKER_MARKER_FILE)
}

pub fn read_marker(profile_dir: &Path) -> Option<WorkerMarker> {
    let content = fs::read_to_string(marker_path(profile_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn marker_matches(worker: &ManagedAntigravityWorker) -> bool {
    read_marker(&worker.profile_dir)
        .map(|marker| {
            marker.schema_version == WORKER_SCHEMA_VERSION
                && marker.account_id == worker.account_id
                && marker.ownership_nonce == worker.ownership_nonce
        })
        .unwrap_or(false)
}

pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid worker file path".to_string())?;
    ensure_private_dir(parent)?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid worker file name".to_string())?;
    let mut temporary = None;
    let mut file = None;
    for _ in 0..8 {
        let candidate = parent.join(format!(".{name}.{}.tmp", generate_nonce()));
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);
        match options.open(&candidate) {
            Ok(handle) => {
                temporary = Some(candidate);
                file = Some(handle);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    let temporary =
        temporary.ok_or_else(|| "Could not create private worker temporary file".to_string())?;
    let mut file =
        file.ok_or_else(|| "Could not open private worker temporary file".to_string())?;
    if let Err(error) = file.write_all(content) {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    drop(file);
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn remove_owned_profile(profile_dir: &Path) -> Result<(), String> {
    if !profile_dir.exists() {
        return Ok(());
    }
    let marker = read_marker(profile_dir).ok_or_else(|| {
        format!(
            "Refusing to delete an unmarked worker profile: {}",
            profile_dir.display()
        )
    })?;
    if marker.schema_version != WORKER_SCHEMA_VERSION {
        return Err("Refusing to delete a worker profile with an unsupported marker".to_string());
    }
    fs::remove_dir_all(profile_dir).map_err(|error| error.to_string())
}

pub fn prepare_profile(
    request: &ExactAntigravityAccountRequest,
) -> Result<(PathBuf, String), String> {
    let profile_dir = worker_profile_dir(&request.account_id)?;
    if profile_dir.exists() {
        remove_owned_profile(&profile_dir)?;
    }
    let global_storage = profile_dir.join("User").join("globalStorage");
    let workspace = profile_dir.join("quotashift-empty-workspace");
    ensure_private_dir(&worker_root_dir()?)?;
    ensure_private_dir(&profile_dir)?;
    ensure_private_dir(&global_storage)?;
    ensure_private_dir(&workspace)?;

    let ownership_nonce = generate_nonce();
    let marker = WorkerMarker {
        schema_version: WORKER_SCHEMA_VERSION,
        account_id: request.account_id.clone(),
        ownership_nonce: ownership_nonce.clone(),
        created_at: now_string(),
    };
    let marker_bytes = serde_json::to_vec_pretty(&marker).map_err(|error| error.to_string())?;
    atomic_write(&marker_path(&profile_dir), &marker_bytes)?;

    let db_path = global_storage.join("state.vscdb");
    let payload = serde_json::json!({
        "db_paths": [db_path],
        "token": request.access_token.clone(),
        "profile_url": request.profile_url.clone(),
        "refresh_token": request.refresh_token.clone(),
        "email": request.email.clone(),
        "auth_method": request.auth_method.clone(),
    });
    let output = crate::session::run_python_json(PROFILE_WRITER, &payload)?;
    if !output.status.success() {
        return Err("Failed to prepare isolated Antigravity profile".to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.contains("SUCCESS") {
        return Err("Isolated profile writer did not confirm success".to_string());
    }
    Ok((profile_dir, ownership_nonce))
}
