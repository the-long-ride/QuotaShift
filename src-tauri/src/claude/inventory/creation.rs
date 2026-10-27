//! Isolated Claude Code homes, with safe preference-only settings import.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::profiles::{inspect_profile_dir, ClaudeProfile};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProfileTemplate {
    Default,
    CopySettings,
}

const SAFE_SETTINGS_KEYS: &[&str] = &[
    "theme",
    "language",
    "outputStyle",
    "model",
    "alwaysThinkingEnabled",
    "spinnerTipsEnabled",
    "spinnerVerbs",
    "showTurnDuration",
    "includeCoAuthoredBy",
    "respectGitignore",
    "terminalProgressBarEnabled",
    "autoUpdatesChannel",
    "prefersReducedMotion",
];

fn safe_preference_copy(source_dir: &Path) -> Result<Value, String> {
    let path = source_dir.join("settings.json");
    let bytes = fs::read(&path).map_err(|e| {
        format!(
            "Cannot read source profile settings '{}': {e}",
            path.display()
        )
    })?;
    if bytes.len() > 1024 * 1024 {
        return Err("Source settings.json is too large to copy safely".to_string());
    }
    let input: Value = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Source settings.json contains invalid JSON: {e}"))?;
    let input = input
        .as_object()
        .ok_or("Source settings.json must be a JSON object")?;
    let mut result = Map::new();
    for key in SAFE_SETTINGS_KEYS {
        if let Some(value) = input.get(*key) {
            // Do not copy arbitrary executable hooks, credentials, or environment values.
            if value.is_string()
                || value.is_boolean()
                || value.is_number()
                || (*key == "spinnerVerbs" && value.is_object())
            {
                result.insert((*key).to_string(), value.clone());
            }
        }
    }
    Ok(Value::Object(result))
}

pub fn list_managed_profile_dirs(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut dirs = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| format!("Cannot list managed profiles: {e}"))? {
        let entry = entry.map_err(|e| format!("Cannot inspect managed profile: {e}"))?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir()
            && entry.path().join("settings.json").is_file()
        {
            dirs.push(entry.path());
        }
    }
    dirs.sort();
    Ok(dirs)
}

pub fn create_managed_profile_at(
    root: &Path,
    profile_name: &str,
    template: ProfileTemplate,
    source_dir: Option<&Path>,
) -> Result<ClaudeProfile, String> {
    if profile_name.is_empty()
        || profile_name.len() > 48
        || !profile_name.starts_with(|c: char| c.is_ascii_alphanumeric())
        || !profile_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Profile name must be 1–48 characters: letters, numbers, hyphen, underscore; start with a letter or number".into());
    }
    let settings = match (template, source_dir) {
        (ProfileTemplate::Default, None) => serde_json::json!({}),
        (ProfileTemplate::CopySettings, Some(source)) => safe_preference_copy(source)?,
        _ => return Err("Select an existing profile when copying settings".into()),
    };
    fs::create_dir_all(root).map_err(|e| format!("Cannot prepare profile home: {e}"))?;
    // A symlinked managed root can redirect a create outside its intended home.
    let meta = fs::symlink_metadata(root).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        return Err("Managed profile root must not be a symbolic link".into());
    }
    let new_dir = root.join(profile_name);
    fs::create_dir(&new_dir).map_err(|e| {
        format!("Profile '{profile_name}' already exists or cannot be created: {e}")
    })?;
    let result = (|| {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&new_dir, fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("Cannot restrict new profile directory: {e}"))?;
        }
        let path = new_dir.join("settings.json");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| format!("Cannot create settings.json: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("Cannot restrict new profile settings: {e}"))?;
        }
        let mut bytes = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
        bytes.push(b'\n');
        file.write_all(&bytes)
            .map_err(|e| format!("Cannot write profile settings: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("Cannot flush profile settings: {e}"))?;
        inspect_profile_dir(&new_dir)
    })();
    if result.is_err() {
        // Only remove this newly-created directory; never touch pre-existing profiles.
        let _ = fs::remove_dir_all(&new_dir);
    }
    result
}

pub fn managed_profile_root() -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or("Cannot resolve user home for isolated Claude profiles")?;
    if !home.is_absolute() {
        return Err("Home directory must be an absolute path".into());
    }
    Ok(home.join(".quotashift").join("claude-profiles"))
}
