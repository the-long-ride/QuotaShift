pub mod bridge;
pub mod cli;
pub mod payload;
pub mod status;
pub mod transcript;
pub mod types;

pub use bridge::*;
pub use cli::*;
pub use payload::*;
pub use status::*;
pub use transcript::*;
pub use types::*;

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::io::{self, Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const SNAPSHOT_FILE: &str = "claude-session.json";

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
    transcript::scan_local_transcripts_internal(projects_root, now)
}

fn normalize_payload(value: &Value, captured_at_ms: u64) -> Result<ClaudeSessionSnapshot, String> {
    payload::normalize_payload_value(value, captured_at_ms)
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let temp_path = path.with_extension("quotashift-tmp");
    fs::write(&temp_path, bytes).map_err(|error| {
        format!(
            "Failed to write temporary file {}: {error}",
            temp_path.display()
        )
    })?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Failed to replace {}: {error}", path.display()))?;
    }
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to finalize {}: {error}", path.display()));
    }
    Ok(())
}

fn write_snapshot(raw: &str) -> Result<(), String> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|error| format!("Claude statusLine payload was not valid JSON: {error}"))?;
    let captured_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    let snapshot = normalize_payload(&value, captured_at_ms)?;
    let bytes = serde_json::to_vec_pretty(&snapshot)
        .map_err(|error| format!("Failed to serialize local Claude session snapshot: {error}"))?;
    write_atomic(&snapshot_path()?, &bytes)
}

fn run_shell_command(command: &str, input: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .args(["/D", "/S", "/C", command])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start previous Claude statusLine command: {error}"))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .args(["-lc", command])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start previous Claude statusLine command: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|error| format!("Failed to forward Claude statusLine payload: {error}"))?;
    }

    let output = child.wait_with_output().map_err(|error| {
        format!("Failed to wait for previous Claude statusLine command: {error}")
    })?;
    if !output.status.success() {
        return Err("Previous Claude statusLine command exited unsuccessfully".to_string());
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
    let run = |cmd_name: &str, args: &[&str]| -> io::Result<std::process::Output> {
        let mut cmd = Command::new(cmd_name);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
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

    let output = output.map_err(|e| format!("Failed to run claude -p /usage: {e}"))?;
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
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| format!("Failed to read Claude statusLine stdin: {error}"))?;
    let value: Value = serde_json::from_str(&input)
        .map_err(|error| format!("Claude statusLine payload was not valid JSON: {error}"))?;

    write_snapshot(&input)?;

    if let Some(command) = previous_command() {
        if let Ok(output) = run_shell_command(&command, &input) {
            print!("{output}");
            let _ = io::stdout().flush();
        }
    } else {
        println!("{}", fallback_status_line(&value));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
