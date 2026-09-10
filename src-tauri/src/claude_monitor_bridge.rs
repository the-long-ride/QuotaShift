use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use super::types::ClaudeMonitorStatus;
use super::{home_dir, quotashift_dir, write_atomic};

pub const BRIDGE_ARG: &str = "--claude-statusline-bridge";
pub const PREVIOUS_STATUS_LINE_FILE: &str = "claude-statusline-previous.json";

pub fn claude_settings_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".claude").join("settings.json"))
}

pub fn previous_status_line_path() -> Result<PathBuf, String> {
    Ok(quotashift_dir()?.join(PREVIOUS_STATUS_LINE_FILE))
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
        .ok_or_else(|| "Claude settings.json must contain a JSON object".to_string())?;

    let existing = root.get("statusLine").cloned();
    let previous = match existing.as_ref() {
        Some(Value::Object(object)) => object
            .get("command")
            .and_then(Value::as_str)
            .filter(|command| !is_bridge_command(command))
            .map(|_| Value::Object(object.clone())),
        Some(Value::Null) | None => None,
        Some(_) => return Err(
            "Claude statusLine setting is not a command object; QuotaShift will not overwrite it"
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
        return format!("powershell -NoProfile -Command \"& '{path}' {BRIDGE_ARG}\"");
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
        .map_err(|error| format!("Failed to read Claude settings.json: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| {
        format!("Claude settings.json is invalid JSON; QuotaShift left it unchanged: {error}")
    })
}

pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize local Claude integration data: {error}"))?;
    write_atomic(path, &bytes)
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

pub fn ensure_claude_statusline_bridge_impl() -> Result<ClaudeMonitorStatus, String> {
    let settings_path = claude_settings_path()?;
    let mut settings = read_settings(&settings_path)?;
    let was_bridge = settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str)
        .is_some_and(is_bridge_command);
    let executable = std::env::current_exe()
        .map_err(|error| format!("Failed to locate the QuotaShift executable: {error}"))?;
    let command = quoted_bridge_command(&executable);
    let previous = install_bridge_in_value(&mut settings, &command)?;

    if !was_bridge {
        let previous_path = previous_status_line_path()?;
        match previous {
            Some(value) => write_json(&previous_path, &value)?,
            None => {
                if previous_path.exists() {
                    let _ = fs::remove_file(previous_path);
                }
            }
        }
    }

    write_json(&settings_path, &settings)?;
    super::status::monitor_status(true, settings_path)
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
