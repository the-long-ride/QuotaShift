use serde_json::Value;
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::bridge::previous_command_for_dir_at;
use super::types::ClaudeSessionSnapshot;
use super::{
    fallback_status_line, home_dir, quotashift_dir, run_shell_command, write_atomic,
    write_snapshot_to, SNAPSHOT_FILE,
};
use crate::claude::accounts::normalize_config_dir_key;

pub const PROFILE_SESSIONS_DIR: &str = "claude-profile-sessions";

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn profile_config_hash(config_dir: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize_config_dir_key(config_dir).as_bytes());
    hex_encode(&hasher.finalize())[..16].to_string()
}

pub fn is_default_config_dir(config_dir: &Path, home: &Path) -> bool {
    normalize_config_dir_key(config_dir) == normalize_config_dir_key(&home.join(".claude"))
}

pub fn resolve_active_config_dir_with(env_value: Option<OsString>, home: &Path) -> PathBuf {
    let Some(raw) = env_value else {
        return home.join(".claude");
    };
    if let Some(text) = raw.to_str() {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return home.join(".claude");
        }
        if let Some(rest) = trimmed.strip_prefix('~') {
            return home.join(rest.trim_start_matches(['/', '\\']));
        }
        return PathBuf::from(trimmed);
    }
    if raw.is_empty() {
        home.join(".claude")
    } else {
        PathBuf::from(raw)
    }
}

pub fn resolve_active_config_dir() -> Result<PathBuf, String> {
    let home = home_dir()?;
    Ok(resolve_active_config_dir_with(
        std::env::var_os("CLAUDE_CONFIG_DIR"),
        &home,
    ))
}

pub fn profile_snapshot_path_at(quotashift_dir: &Path, config_dir: &Path) -> PathBuf {
    quotashift_dir
        .join(PROFILE_SESSIONS_DIR)
        .join(format!("{}.json", profile_config_hash(config_dir)))
}

pub fn save_profile_snapshot_at(
    quotashift_dir: &Path,
    config_dir: &Path,
    snapshot: &ClaudeSessionSnapshot,
) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(snapshot).map_err(|error| {
        format!("Failed to serialize local Claude Code profile snapshot: {error}")
    })?;
    write_atomic(
        &profile_snapshot_path_at(quotashift_dir, config_dir),
        &bytes,
    )
}

pub fn read_profile_snapshot_at(
    quotashift_dir: &Path,
    config_dir: &Path,
) -> Option<ClaudeSessionSnapshot> {
    let path = profile_snapshot_path_at(quotashift_dir, config_dir);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<ClaudeSessionSnapshot>(&raw).ok()
}

pub fn read_profile_snapshot(config_dir: &Path) -> Option<ClaudeSessionSnapshot> {
    let qs_dir = quotashift_dir().ok()?;
    read_profile_snapshot_at(&qs_dir, config_dir)
}

pub(crate) fn process_statusline_payload_at(
    raw: &str,
    config_dir: &Path,
    home: &Path,
    qs_dir: &Path,
    captured_at_ms: u64,
) -> Result<(ClaudeSessionSnapshot, Option<String>), String> {
    let profile_path = profile_snapshot_path_at(qs_dir, config_dir);
    let snapshot = write_snapshot_to(&profile_path, raw, captured_at_ms)?;
    if is_default_config_dir(config_dir, home) {
        let legacy_path = qs_dir.join(SNAPSHOT_FILE);
        let bytes = serde_json::to_vec_pretty(&snapshot).map_err(|error| {
            format!("Failed to serialize local Claude Code session snapshot: {error}")
        })?;
        write_atomic(&legacy_path, &bytes)?;
    }
    let previous = previous_command_for_dir_at(qs_dir, config_dir, home);
    Ok((snapshot, previous))
}

pub fn run_claude_statusline_bridge_impl() -> Result<(), String> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| format!("Failed to read Claude Code statusLine stdin: {error}"))?;
    let value: Value = serde_json::from_str(&input)
        .map_err(|error| format!("Claude Code statusLine payload was not valid JSON: {error}"))?;

    let captured_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    let home = home_dir()?;
    let qs_dir = quotashift_dir()?;
    let config_dir = resolve_active_config_dir()?;

    let (_, previous) =
        process_statusline_payload_at(&input, &config_dir, &home, &qs_dir, captured_at_ms)?;

    if let Some(command) = previous {
        if let Ok(output) = run_shell_command(&command, &input) {
            print!("{output}");
            let _ = io::stdout().flush();
        }
    } else {
        println!("{}", fallback_status_line(&value));
    }
    Ok(())
}
