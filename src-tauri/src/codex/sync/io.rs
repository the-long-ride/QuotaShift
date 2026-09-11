use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use crate::session::get_home_dir;

pub fn secure_directory(dir: &Path) -> Result<(), String> {
    match fs::symlink_metadata(dir) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(format!(
                "Refusing symlink Codex directory: {}",
                dir.display()
            ))
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

pub fn codex_dir() -> Result<PathBuf, String> {
    if let Ok(val) = std::env::var("CODEX_HOME") {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.exists() && path.is_dir() {
                secure_directory(&path)?;
                return Ok(path);
            }
        }
    }
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let dir = home.join(".codex");
    secure_directory(&dir)?;
    Ok(dir)
}

pub fn reject_symlink(path: &Path, name: &str) -> Result<(), String> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(format!("Refusing symlink {name}: {}", path.display()));
        }
    }
    Ok(())
}

#[cfg(unix)]
pub fn restrictive_permissions(path: &Path) -> fs::Permissions {
    let mode = fs::symlink_metadata(path)
        .ok()
        .map(|metadata| metadata.permissions().mode() & 0o777)
        .filter(|mode| mode & 0o077 == 0)
        .unwrap_or(0o600);
    fs::Permissions::from_mode(mode)
}

pub fn protect_existing_file(path: &Path, name: &str) -> Result<(), String> {
    reject_symlink(path, name)?;
    #[cfg(unix)]
    if path.exists() {
        fs::set_permissions(path, restrictive_permissions(path))
            .map_err(|error| format!("Failed to protect {name}: {error}"))?;
    }
    Ok(())
}

pub fn open_exclusive_private(path: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    options.open(path)
}

pub fn unique_temp_file(path: &Path, bytes: &[u8], name: &str) -> Result<PathBuf, String> {
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

pub fn atomic_replace_bytes(path: &Path, bytes: &[u8], name: &str) -> Result<(), String> {
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

pub fn atomic_router_replace(path: &Path, bytes: &[u8], name: &str) -> Result<(), String> {
    atomic_replace_bytes(path, bytes, name)
}

pub fn atomic_write_with_backup(path: &Path, content: &str, name: &str) -> Result<(), String> {
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
