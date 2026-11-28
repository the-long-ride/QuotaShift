use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use super::profile_snapshots::{is_default_config_dir, profile_config_hash};
use super::types::{ClaudeMonitorSource, ClaudeMonitorStatus};
use super::{home_dir, quotashift_dir, read_snapshot, write_atomic};

pub const BRIDGE_ARG: &str = "--claude-statusline-bridge";
pub const PREVIOUS_STATUS_LINE_FILE: &str = "claude-statusline-previous.json";
pub const PREVIOUS_STATUS_LINE_DIR: &str = "claude-statusline-previous";

pub fn claude_settings_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".claude").join("settings.json"))
}

pub fn previous_status_line_path() -> Result<PathBuf, String> {
    Ok(quotashift_dir()?.join(PREVIOUS_STATUS_LINE_FILE))
}

pub fn previous_status_line_path_for_dir_at(quotashift_dir: &Path, config_dir: &Path) -> PathBuf {
    quotashift_dir
        .join(PREVIOUS_STATUS_LINE_DIR)
        .join(format!("{}.json", profile_config_hash(config_dir)))
}

pub fn is_bridge_command(command: &str) -> bool {
    command.contains(BRIDGE_ARG)
}

pub fn install_bridge_in_value(
    settings: &mut Value,
    bridge_command: &str,
) -> Result<Option<Value>, String> {
    let root = settings
        .as_object_mut()
        .ok_or_else(|| "Claude Code settings.json must contain a JSON object".to_string())?;

    let existing = root.get("statusLine").cloned();
    let previous = match existing.as_ref() {
        Some(Value::Object(object)) => object
            .get("command")
            .and_then(Value::as_str)
            .filter(|command| !is_bridge_command(command))
            .map(|_| Value::Object(object.clone())),
        Some(Value::Null) | None => None,
        Some(_) => return Err(
            "Claude Code statusLine setting is not a command object; QuotaShift will not overwrite it"
                .to_string(),
        ),
    };

    let mut next_status_line = match existing {
        Some(Value::Object(object)) => object,
        Some(Value::Null) | None => Map::new(),
        Some(_) => unreachable!(),
    };
    next_status_line.insert("type".to_string(), Value::String("command".to_string()));
    next_status_line.insert(
        "command".to_string(),
        Value::String(bridge_command.to_string()),
    );
    root.insert("statusLine".to_string(), Value::Object(next_status_line));

    Ok(previous)
}

pub fn quoted_bridge_command(executable: &Path) -> String {
    #[cfg(target_os = "windows")]
    {
        let path = executable
            .to_string_lossy()
            .replace('\\', "/")
            .replace('\'', "''");
        format!("powershell -NoProfile -Command \"& '{path}' {BRIDGE_ARG}\"")
    }

    #[cfg(not(target_os = "windows"))]
    {
        let path = executable.to_string_lossy().replace('"', "\\\"");
        format!("\"{path}\" {BRIDGE_ARG}")
    }
}

pub fn read_settings(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Claude Code settings.json: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| {
        format!("Claude Code settings.json is invalid JSON; QuotaShift left it unchanged: {error}")
    })
}

pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| {
        format!("Failed to serialize local Claude Code integration data: {error}")
    })?;
    write_atomic(path, &bytes)
}

fn read_previous_command_from_path(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    value
        .get("command")?
        .as_str()
        .map(str::to_string)
        .filter(|command| !command.trim().is_empty() && !is_bridge_command(command))
}

pub fn read_previous_status_line() -> Option<Value> {
    let path = previous_status_line_path().ok()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn previous_command() -> Option<String> {
    read_previous_status_line()?
        .get("command")?
        .as_str()
        .map(str::to_string)
        .filter(|command| !command.trim().is_empty() && !is_bridge_command(command))
}

pub fn previous_command_for_dir_at(
    quotashift_dir: &Path,
    config_dir: &Path,
    home: &Path,
) -> Option<String> {
    let per_profile = previous_status_line_path_for_dir_at(quotashift_dir, config_dir);
    if let Some(command) = read_previous_command_from_path(&per_profile) {
        return Some(command);
    }
    if is_default_config_dir(config_dir, home) {
        let legacy = quotashift_dir.join(PREVIOUS_STATUS_LINE_FILE);
        return read_previous_command_from_path(&legacy);
    }
    None
}

pub fn previous_command_for_dir(config_dir: &Path) -> Option<String> {
    let home = home_dir().ok()?;
    let qs_dir = quotashift_dir().ok()?;
    previous_command_for_dir_at(&qs_dir, config_dir, &home)
}

fn persist_previous_status_line(path: &Path, previous: Option<&Value>) -> Result<(), String> {
    match previous {
        Some(value) => write_json(path, value),
        None => {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
            Ok(())
        }
    }
}

pub fn ensure_claude_statusline_bridge_for_dir_with(
    config_dir: &Path,
    home: &Path,
    qs_dir: &Path,
    executable: &Path,
) -> Result<bool, String> {
    let settings_path = config_dir.join("settings.json");
    let mut settings = read_settings(&settings_path)?;
    let command = quoted_bridge_command(executable);
    let current_command = settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str);
    let current_type = settings.pointer("/statusLine/type").and_then(Value::as_str);

    if current_type == Some("command") && current_command == Some(command.as_str()) {
        return Ok(false);
    }

    let was_bridge = current_command.is_some_and(is_bridge_command);
    let previous = install_bridge_in_value(&mut settings, &command)?;

    if !was_bridge {
        let per_profile_path = previous_status_line_path_for_dir_at(qs_dir, config_dir);
        persist_previous_status_line(&per_profile_path, previous.as_ref())?;
        if is_default_config_dir(config_dir, home) {
            let legacy_path = qs_dir.join(PREVIOUS_STATUS_LINE_FILE);
            persist_previous_status_line(&legacy_path, previous.as_ref())?;
        }
    }

    write_json(&settings_path, &settings)?;
    Ok(true)
}

pub fn ensure_claude_statusline_bridge_for_dir(config_dir: &Path) -> Result<bool, String> {
    let home = home_dir()?;
    let qs_dir = quotashift_dir()?;
    let executable = std::env::current_exe()
        .map_err(|error| format!("Failed to locate the QuotaShift executable: {error}"))?;
    ensure_claude_statusline_bridge_for_dir_with(config_dir, &home, &qs_dir, &executable)
}

pub fn ensure_claude_statusline_bridge_impl() -> Result<ClaudeMonitorStatus, String> {
    let default_dir = home_dir()?.join(".claude");
    let settings_path = default_dir.join("settings.json");
    ensure_claude_statusline_bridge_for_dir(&default_dir)?;
    let session = read_snapshot().ok().flatten();
    Ok(ClaudeMonitorStatus {
        installed: true,
        settings_path: Some(settings_path.to_string_lossy().to_string()),
        source: if session.is_some() {
            ClaudeMonitorSource::StatusLine
        } else {
            ClaudeMonitorSource::None
        },
        session,
        local_usage: None,
        error: None,
    })
}

pub fn get_claude_monitor_status_impl() -> Result<ClaudeMonitorStatus, String> {
    let settings_path = claude_settings_path()?;
    let settings = read_settings(&settings_path)?;
    let installed = settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str)
        .is_some_and(is_bridge_command);
    super::status::monitor_status(installed, settings_path)
}
