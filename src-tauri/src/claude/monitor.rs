pub mod bridge;
pub mod cli;
pub mod login_notice;
pub mod payload;
pub mod profile_snapshots;
pub mod status;
pub mod transcript;
mod transcript_cache;
pub mod transcript_index;
pub mod types;
pub mod usage_scheduler;

pub use bridge::*;
pub use cli::*;
pub use payload::*;
pub use profile_snapshots::*;
pub use status::*;
pub use transcript::*;
pub use transcript_index::*;
pub use types::*;
pub use usage_scheduler::*;

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
#[cfg(test)]
use std::fs;
use std::io::{self, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub(crate) const SNAPSHOT_FILE: &str = "claude-session.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalTranscriptRecord {
    timestamp: Option<String>,
    session_id: Option<String>,
    cwd: Option<String>,
    version: Option<String>,
    message: Option<LocalAssistantMessage>,
}

#[derive(Debug, Deserialize)]
struct LocalAssistantMessage {
    id: Option<String>,
    model: Option<String>,
    usage: Option<LocalUsageFields>,
}

pub fn home_dir() -> Result<PathBuf, String> {
    crate::session::get_home_dir()
        .ok_or_else(|| "Could not locate the user home directory".to_string())
}

pub fn quotashift_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".quotashift"))
}

pub fn snapshot_path() -> Result<PathBuf, String> {
    Ok(quotashift_dir()?.join(SNAPSHOT_FILE))
}

pub fn claude_projects_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".claude").join("projects"))
}

pub fn scan_local_transcripts_at(projects_root: &Path, now: DateTime<Utc>) -> LocalTranscriptScan {
    transcript_index::scan_incremental_transcripts(projects_root, now)
}

fn normalize_payload(value: &Value, captured_at_ms: u64) -> Result<ClaudeSessionSnapshot, String> {
    payload::normalize_payload_value(value, captured_at_ms)
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    crate::system::retry_after::write_atomic_bytes(path, bytes)
}

pub(crate) fn write_snapshot_to(
    path: &Path,
    raw: &str,
    captured_at_ms: u64,
) -> Result<ClaudeSessionSnapshot, String> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|error| format!("Claude Code statusLine payload was not valid JSON: {error}"))?;
    let snapshot = normalize_payload(&value, captured_at_ms)?;
    let bytes = serde_json::to_vec_pretty(&snapshot).map_err(|error| {
        format!("Failed to serialize local Claude Code session snapshot: {error}")
    })?;
    write_atomic(path, &bytes)?;
    Ok(snapshot)
}

pub(crate) fn run_shell_command(command: &str, input: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .args(["/D", "/S", "/C", command])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!("Failed to start previous Claude Code statusLine command: {error}")
        })?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .args(["-lc", command])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!("Failed to start previous Claude Code statusLine command: {error}")
        })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input.as_bytes()).map_err(|error| {
            format!("Failed to forward Claude Code statusLine payload: {error}")
        })?;
    }

    let output = child.wait_with_output().map_err(|error| {
        format!("Failed to wait for previous Claude Code statusLine command: {error}")
    })?;
    if !output.status.success() {
        return Err("Previous Claude Code statusLine command exited unsuccessfully".to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn format_claude_model_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Claude".to_string();
    }
    if trimmed == "claude-sonnet-5" {
        return "Claude Sonnet  5".to_string();
    }
    let replaced = trimmed.replace("claude-sonnet-5", "Claude Sonnet  5");
    if replaced != trimmed {
        return replaced;
    }
    if trimmed == "claude-opus-5" {
        return "Claude Opus  5".to_string();
    }
    if trimmed == "claude-haiku-5" {
        return "Claude Haiku  5".to_string();
    }
    if trimmed.starts_with("claude-haiku-4-5") {
        return "Claude Haiku 4.5".to_string();
    }
    trimmed.to_string()
}

pub fn extract_cli_usage_from_output(
    output: &str,
    now: DateTime<Utc>,
) -> (Option<ClaudeRateLimitWindow>, Option<ClaudeRateLimitWindow>) {
    let session_re = regex::Regex::new(
        r"(?i)Current\s+session\s*:\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·\s]\s*resets\s*([^\r\n]+))?",
    ).ok();
    let week_re = regex::Regex::new(
        r"(?i)Current\s+week(?:\s*\([^)]*\))?\s*:\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·\s]\s*resets\s*([^\r\n]+))?",
    ).ok();

    let session_window = session_re.as_ref().and_then(|re| {
        let caps = re.captures(output)?;
        let pct: f64 = caps.get(1)?.as_str().parse().ok()?;
        let resets_at = caps
            .get(2)
            .and_then(|m| cli::parse_cli_reset_timestamp(m.as_str().trim(), now));
        Some(ClaudeRateLimitWindow {
            used_percentage: Some(pct),
            resets_at,
        })
    });

    let week_window = week_re.as_ref().and_then(|re| {
        let caps = re.captures(output)?;
        let pct: f64 = caps.get(1)?.as_str().parse().ok()?;
        let resets_at = caps
            .get(2)
            .and_then(|m| cli::parse_cli_reset_timestamp(m.as_str().trim(), now));
        Some(ClaudeRateLimitWindow {
            used_percentage: Some(pct),
            resets_at,
        })
    });

    (session_window, week_window)
}

pub fn run_claude_cli_usage() -> Result<String, String> {
    run_claude_cli_usage_for_config(None)
}

pub fn run_claude_cli_usage_for_config(config_dir: Option<&Path>) -> Result<String, String> {
    let target = config_dir.map_or("default", |p| p.to_str().unwrap_or("."));
    crate::log_eprintln!(
        "[claude_cli] executing `claude -p /usage` (config={})",
        target
    );
    let run = |cmd_name: &str, args: &[&str]| -> io::Result<std::process::Output> {
        let mut cmd = Command::new(cmd_name);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(config_dir) = config_dir {
            cmd.env("CLAUDE_CONFIG_DIR", config_dir);
        }
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output()
    };

    #[cfg(target_os = "windows")]
    let output = run("claude", &["-p", "/usage"])
        .or_else(|_| run("cmd", &["/C", "claude", "-p", "/usage"]))
        .or_else(|_| {
            if let Ok(home) = home_dir() {
                let local_bin = home.join(".local").join("bin").join("claude.exe");
                if local_bin.exists() {
                    return run(local_bin.to_string_lossy().as_ref(), &["-p", "/usage"]);
                }
            }
            Err(io::Error::new(io::ErrorKind::NotFound, "claude not found"))
        });

    #[cfg(not(target_os = "windows"))]
    let output =
        run("claude", &["-p", "/usage"]).or_else(|_| run("sh", &["-lc", "claude -p /usage"]));

    let output = output.map_err(|error| format!("Failed to run claude -p /usage: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "claude -p /usage exited with code {:?}: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn ensure_claude_statusline_bridge() -> Result<ClaudeMonitorStatus, String> {
    bridge::ensure_claude_statusline_bridge_impl()
}

#[tauri::command]
pub fn get_claude_monitor_status() -> Result<ClaudeMonitorStatus, String> {
    bridge::get_claude_monitor_status_impl()
}

pub fn run_claude_statusline_bridge() -> Result<(), String> {
    profile_snapshots::run_claude_statusline_bridge_impl()
}

#[cfg(test)]
mod bridge_tests;
#[cfg(test)]
mod tests;
