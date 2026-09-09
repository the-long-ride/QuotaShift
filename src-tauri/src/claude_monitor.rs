use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const BRIDGE_ARG: &str = "--claude-statusline-bridge";
const SNAPSHOT_FILE: &str = "claude-session.json";
const PREVIOUS_STATUS_LINE_FILE: &str = "claude-statusline-previous.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeRateLimitWindow {
    pub used_percentage: Option<f64>,
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionSnapshot {
    pub session_id: String,
    pub session_name: Option<String>,
    pub model_id: Option<String>,
    pub model_display_name: Option<String>,
    pub claude_code_version: Option<String>,
    pub current_dir: Option<String>,
    pub project_dir: Option<String>,
    pub captured_at_ms: u64,
    pub total_cost_usd: Option<f64>,
    pub total_duration_ms: Option<u64>,
    pub total_api_duration_ms: Option<u64>,
    pub total_input_tokens: Option<u64>,
    pub total_output_tokens: Option<u64>,
    pub context_window_size: Option<u64>,
    pub context_used_percentage: Option<f64>,
    pub context_remaining_percentage: Option<f64>,
    pub current_input_tokens: Option<u64>,
    pub current_output_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
    pub five_hour: Option<ClaudeRateLimitWindow>,
    pub seven_day: Option<ClaudeRateLimitWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ClaudeMonitorSource {
    StatusLine,
    LocalTranscript,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMonitorStatus {
    pub installed: bool,
    pub settings_path: Option<String>,
    pub source: ClaudeMonitorSource,
    pub session: Option<ClaudeSessionSnapshot>,
    pub local_usage: Option<ClaudeObservedUsage>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeObservedUsageWindow {
    pub request_count: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub processed_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeObservedUsage {
    pub five_hour: ClaudeObservedUsageWindow,
    pub seven_day: ClaudeObservedUsageWindow,
    pub captured_at_ms: u64,
}

#[derive(Debug, Clone, Default)]
struct LocalTranscriptScan {
    latest_main_session: Option<ClaudeSessionSnapshot>,
    observed_usage: Option<ClaudeObservedUsage>,
}

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

#[derive(Debug, Clone, Deserialize)]
struct LocalUsageFields {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
}

#[derive(Debug, Clone)]
struct ObservedUsageRecord {
    timestamp: DateTime<Utc>,
    usage: LocalUsageFields,
}
#[derive(Debug, Clone)]
struct TranscriptCache {
    scanned_at: Instant,
    value: LocalTranscriptScan,
}

static TRANSCRIPT_CACHE: OnceLock<Mutex<Option<TranscriptCache>>> = OnceLock::new();
fn home_dir() -> Result<PathBuf, String> {
    crate::session::get_home_dir()
        .ok_or_else(|| "Could not locate the user home directory".to_string())
}

fn claude_settings_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".claude").join("settings.json"))
}

fn quotashift_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".quotashift"))
}

fn snapshot_path() -> Result<PathBuf, String> {
    Ok(quotashift_dir()?.join(SNAPSHOT_FILE))
}

fn previous_status_line_path() -> Result<PathBuf, String> {
    Ok(quotashift_dir()?.join(PREVIOUS_STATUS_LINE_FILE))
}

fn collect_recent_transcript_files(
    directory: &Path,
    modified_cutoff: DateTime<Utc>,
    files: &mut Vec<PathBuf>,
) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            collect_recent_transcript_files(&path, modified_cutoff, files);
            continue;
        }
        if !file_type.is_file()
            || path.extension().and_then(|extension| extension.to_str()) != Some("jsonl")
        {
            continue;
        }

        let Ok(modified) = entry.metadata().and_then(|metadata| metadata.modified()) else {
            continue;
        };
        let modified: DateTime<Utc> = modified.into();
        if modified >= modified_cutoff {
            files.push(path);
        }
    }
}

fn add_usage(window: &mut ClaudeObservedUsageWindow, usage: &LocalUsageFields) {
    let input = usage.input_tokens.unwrap_or(0);
    let output = usage.output_tokens.unwrap_or(0);
    let cache_create = usage.cache_creation_input_tokens.unwrap_or(0);
    let cache_read = usage.cache_read_input_tokens.unwrap_or(0);

    window.request_count = window.request_count.saturating_add(1);
    window.input_tokens = window.input_tokens.saturating_add(input);
    window.output_tokens = window.output_tokens.saturating_add(output);
    window.cache_creation_input_tokens = window
        .cache_creation_input_tokens
        .saturating_add(cache_create);
    window.cache_read_input_tokens = window.cache_read_input_tokens.saturating_add(cache_read);
    window.processed_tokens = window.processed_tokens.saturating_add(
        input
            .saturating_add(output)
            .saturating_add(cache_create)
            .saturating_add(cache_read),
    );
}

fn is_subagent_transcript(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "subagents")
}

fn scan_local_transcripts_at(projects_root: &Path, now: DateTime<Utc>) -> LocalTranscriptScan {
    if !projects_root.is_dir() {
        return LocalTranscriptScan::default();
    }

    let mut files = Vec::new();
    collect_recent_transcript_files(projects_root, now - ChronoDuration::days(8), &mut files);

    let five_hour_cutoff = now - ChronoDuration::hours(5);
    let seven_day_cutoff = now - ChronoDuration::days(7);
    let mut unique_messages: HashMap<String, ObservedUsageRecord> = HashMap::new();
    let mut latest_main_session: Option<ClaudeSessionSnapshot> = None;

    for path in files {
        let Ok(file) = File::open(&path) else {
            continue;
        };
        let is_main_transcript = !is_subagent_transcript(&path);
        let mut file_first_timestamp: Option<DateTime<Utc>> = None;
        let mut file_latest_usage: Option<(
            DateTime<Utc>,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            LocalUsageFields,
        )> = None;

        for line in BufReader::new(file).lines() {
            let Ok(line) = line else {
                continue;
            };
            let Ok(record) = serde_json::from_str::<LocalTranscriptRecord>(&line) else {
                continue;
            };
            let Some(timestamp) = record
                .timestamp
                .as_deref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&Utc))
            else {
                continue;
            };
            if timestamp > now {
                continue;
            }

            if is_main_transcript {
                file_first_timestamp = Some(
                    file_first_timestamp
                        .map(|current| current.min(timestamp))
                        .unwrap_or(timestamp),
                );
            }

            let Some(message) = record.message else {
                continue;
            };
            let Some(usage) = message.usage else {
                continue;
            };

            if is_main_transcript {
                if let Some(session_id) = record
                    .session_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    let should_replace = file_latest_usage
                        .as_ref()
                        .map(|(current, ..)| *current < timestamp)
                        .unwrap_or(true);
                    if should_replace {
                        file_latest_usage = Some((
                            timestamp,
                            session_id.to_string(),
                            record.cwd.clone(),
                            record.version.clone(),
                            message.model.clone(),
                            usage.clone(),
                        ));
                    }
                }
            }

            if timestamp < seven_day_cutoff {
                continue;
            }
            let Some(message_id) = message.id.map(|value| value.trim().to_string()) else {
                continue;
            };
            if message_id.is_empty() {
                continue;
            }

            match unique_messages.get_mut(&message_id) {
                Some(existing) if existing.timestamp < timestamp => {
                    *existing = ObservedUsageRecord { timestamp, usage };
                }
                None => {
                    unique_messages.insert(message_id, ObservedUsageRecord { timestamp, usage });
                }
                _ => {}
            }
        }

        if let Some((timestamp, session_id, cwd, version, model, usage)) = file_latest_usage {
            let input = usage.input_tokens.unwrap_or(0);
            let output = usage.output_tokens.unwrap_or(0);
            let cache_create = usage.cache_creation_input_tokens.unwrap_or(0);
            let cache_read = usage.cache_read_input_tokens.unwrap_or(0);
            let total_input = input
                .saturating_add(cache_create)
                .saturating_add(cache_read);
            let started = file_first_timestamp.unwrap_or(timestamp);
            let duration_ms = timestamp
                .signed_duration_since(started)
                .num_milliseconds()
                .max(0) as u64;
            let captured_at_ms = timestamp.timestamp_millis().max(0) as u64;
            let session = ClaudeSessionSnapshot {
                session_id,
                session_name: None,
                model_id: model.clone(),
                model_display_name: model.as_deref().map(format_claude_model_name),
                claude_code_version: version,
                current_dir: cwd.clone(),
                project_dir: cwd,
                captured_at_ms,
                total_cost_usd: None,
                total_duration_ms: Some(duration_ms),
                total_api_duration_ms: None,
                total_input_tokens: Some(total_input),
                total_output_tokens: Some(output),
                context_window_size: None,
                context_used_percentage: None,
                context_remaining_percentage: None,
                current_input_tokens: Some(input),
                current_output_tokens: Some(output),
                cache_creation_input_tokens: Some(cache_create),
                cache_read_input_tokens: Some(cache_read),
                five_hour: None,
                seven_day: None,
            };

            let should_replace = latest_main_session
                .as_ref()
                .map(|current| current.captured_at_ms < captured_at_ms)
                .unwrap_or(true);
            if should_replace {
                latest_main_session = Some(session);
            }
        }
    }

    let observed_usage = if unique_messages.is_empty() {
        None
    } else {
        let mut five_hour = ClaudeObservedUsageWindow::default();
        let mut seven_day = ClaudeObservedUsageWindow::default();
        for record in unique_messages.values() {
            if record.timestamp >= seven_day_cutoff {
                add_usage(&mut seven_day, &record.usage);
            }
            if record.timestamp >= five_hour_cutoff {
                add_usage(&mut five_hour, &record.usage);
            }
        }
        Some(ClaudeObservedUsage {
            five_hour,
            seven_day,
            captured_at_ms: now.timestamp_millis().max(0) as u64,
        })
    };

    LocalTranscriptScan {
        latest_main_session,
        observed_usage,
    }
}
fn value_string(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn value_u64(value: &Value, pointer: &str) -> Option<u64> {
    value.pointer(pointer).and_then(Value::as_u64)
}

fn value_f64(value: &Value, pointer: &str) -> Option<f64> {
    value.pointer(pointer).and_then(Value::as_f64)
}

fn rate_limit_window(value: &Value, pointer: &str) -> Option<ClaudeRateLimitWindow> {
    let window = value.pointer(pointer)?;
    if !window.is_object() {
        return None;
    }
    Some(ClaudeRateLimitWindow {
        used_percentage: window.get("used_percentage").and_then(Value::as_f64),
        resets_at: window.get("resets_at").and_then(Value::as_i64),
    })
}

fn normalize_payload(value: &Value, captured_at_ms: u64) -> Result<ClaudeSessionSnapshot, String> {
    let session_id = value
        .get("session_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "Claude statusLine payload is missing session_id".to_string())?
        .to_string();

    Ok(ClaudeSessionSnapshot {
        session_id,
        session_name: value_string(value, "/session_name"),
        model_id: value_string(value, "/model/id"),
        model_display_name: value_string(value, "/model/display_name")
            .map(|m| format_claude_model_name(&m))
            .or_else(|| value_string(value, "/model/id").as_deref().map(format_claude_model_name)),
        claude_code_version: value_string(value, "/version"),
        current_dir: value_string(value, "/workspace/current_dir")
            .or_else(|| value_string(value, "/cwd")),
        project_dir: value_string(value, "/workspace/project_dir"),
        captured_at_ms,
        total_cost_usd: value_f64(value, "/cost/total_cost_usd"),
        total_duration_ms: value_u64(value, "/cost/total_duration_ms"),
        total_api_duration_ms: value_u64(value, "/cost/total_api_duration_ms"),
        total_input_tokens: value_u64(value, "/context_window/total_input_tokens"),
        total_output_tokens: value_u64(value, "/context_window/total_output_tokens"),
        context_window_size: value_u64(value, "/context_window/context_window_size"),
        context_used_percentage: value_f64(value, "/context_window/used_percentage"),
        context_remaining_percentage: value_f64(value, "/context_window/remaining_percentage"),
        current_input_tokens: value_u64(value, "/context_window/current_usage/input_tokens"),
        current_output_tokens: value_u64(value, "/context_window/current_usage/output_tokens"),
        cache_creation_input_tokens: value_u64(
            value,
            "/context_window/current_usage/cache_creation_input_tokens",
        ),
        cache_read_input_tokens: value_u64(
            value,
            "/context_window/current_usage/cache_read_input_tokens",
        ),
        five_hour: rate_limit_window(value, "/rate_limits/five_hour"),
        seven_day: rate_limit_window(value, "/rate_limits/seven_day"),
    })
}

fn is_bridge_command(command: &str) -> bool {
    command.contains(BRIDGE_ARG)
}

fn install_bridge_in_value(
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

fn quoted_bridge_command(executable: &Path) -> String {
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

fn read_settings(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Claude settings.json: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| {
        format!("Claude settings.json is invalid JSON; QuotaShift left it unchanged: {error}")
    })
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
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

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize local Claude integration data: {error}"))?;
    write_atomic(path, &bytes)
}

fn read_previous_status_line() -> Option<Value> {
    let path = previous_status_line_path().ok()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn previous_command() -> Option<String> {
    read_previous_status_line()?
        .get("command")?
        .as_str()
        .map(str::to_string)
        .filter(|command| !command.trim().is_empty() && !is_bridge_command(command))
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

fn fallback_status_line(value: &Value) -> String {
    let model = value
        .pointer("/model/display_name")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/model/id").and_then(Value::as_str))
        .unwrap_or("Claude");
    match value
        .pointer("/context_window/used_percentage")
        .and_then(Value::as_f64)
    {
        Some(percent) if percent.fract().abs() < f64::EPSILON => {
            format!("{model} · {:.0}% context", percent)
        }
        Some(percent) => format!("{model} · {:.1}% context", percent),
        None => model.to_string(),
    }
}

fn read_snapshot() -> Result<Option<ClaudeSessionSnapshot>, String> {
    let path = snapshot_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read local Claude session snapshot: {error}"))?;
    serde_json::from_str::<ClaudeSessionSnapshot>(&raw)
        .map(Some)
        .map_err(|error| format!("Local Claude session snapshot is invalid JSON: {error}"))
}

fn claude_projects_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".claude").join("projects"))
}

fn read_local_transcript_scan() -> Result<LocalTranscriptScan, String> {
    let cache = TRANSCRIPT_CACHE.get_or_init(|| Mutex::new(None));
    {
        let guard = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(cached) = guard.as_ref() {
            if cached.scanned_at.elapsed() < Duration::from_secs(2) {
                return Ok(cached.value.clone());
            }
        }
    }

    let value = scan_local_transcripts_at(&claude_projects_path()?, Utc::now());
    let mut guard = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(TranscriptCache {
        scanned_at: Instant::now(),
        value: value.clone(),
    });
    Ok(value)
}

fn merge_monitor_sources(
    statusline: Option<ClaudeSessionSnapshot>,
    transcript: LocalTranscriptScan,
    now_ms: u64,
) -> (
    ClaudeMonitorSource,
    Option<ClaudeSessionSnapshot>,
    Option<ClaudeObservedUsage>,
) {
    let LocalTranscriptScan {
        latest_main_session,
        observed_usage,
    } = transcript;

    match (statusline, latest_main_session) {
        (Some(statusline_session), Some(mut transcript_session)) => {
            if transcript_session.captured_at_ms > statusline_session.captured_at_ms {
                if now_ms.saturating_sub(statusline_session.captured_at_ms) <= 300_000 {
                    transcript_session.five_hour = statusline_session.five_hour.clone();
                    transcript_session.seven_day = statusline_session.seven_day.clone();
                }
                (
                    ClaudeMonitorSource::LocalTranscript,
                    Some(transcript_session),
                    observed_usage,
                )
            } else {
                (
                    ClaudeMonitorSource::StatusLine,
                    Some(statusline_session),
                    observed_usage,
                )
            }
        }
        (Some(statusline_session), None) => (
            ClaudeMonitorSource::StatusLine,
            Some(statusline_session),
            observed_usage,
        ),
        (None, Some(transcript_session)) => (
            ClaudeMonitorSource::LocalTranscript,
            Some(transcript_session),
            observed_usage,
        ),
        (None, None) => (ClaudeMonitorSource::None, None, observed_usage),
    }
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

pub fn parse_cli_reset_timestamp(s: &str, now: DateTime<Utc>) -> Option<i64> {
    use chrono::{Datelike, TimeZone};
    let re = regex::Regex::new(r"(?i)([a-z]{3})\s+(\d{1,2}),\s*(\d{1,2})\s*(?::\s*(\d{2}))?\s*(am|pm)").ok()?;
    let caps = re.captures(s)?;
    let month_str = caps.get(1)?.as_str().to_lowercase();
    let month = match month_str.as_str() {
        "jan" => 1, "feb" => 2, "mar" => 3, "apr" => 4,
        "may" => 5, "jun" => 6, "jul" => 7, "aug" => 8,
        "sep" => 9, "oct" => 10, "nov" => 11, "dec" => 12,
        _ => return None,
    };
    let day: u32 = caps.get(2)?.as_str().parse().ok()?;
    let mut hour: u32 = caps.get(3)?.as_str().parse().ok()?;
    let minute: u32 = caps.get(4).map(|m| m.as_str().parse().unwrap_or(0)).unwrap_or(0);
    let is_pm = caps.get(5)?.as_str().eq_ignore_ascii_case("pm");
    if is_pm && hour < 12 {
        hour += 12;
    } else if !is_pm && hour == 12 {
        hour = 0;
    }
    let current_year = now.year();
    let year = if month == 1 && now.month() == 12 {
        current_year + 1
    } else {
        current_year
    };
    let local_dt = match chrono::Local.with_ymd_and_hms(year, month, day, hour, minute, 0) {
        chrono::LocalResult::Single(dt) => dt,
        chrono::LocalResult::Ambiguous(dt, _) => dt,
        chrono::LocalResult::None => return None,
    };
    Some(local_dt.timestamp())
}

pub fn extract_cli_usage_from_output(
    output: &str,
    now: DateTime<Utc>,
) -> (Option<ClaudeRateLimitWindow>, Option<ClaudeRateLimitWindow>) {
    let session_re = regex::Regex::new(
        r"(?i)Current\s+session\s*:\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·\s]\s*resets\s*([^\r\n]+))?",
    )
    .ok();
    let week_re = regex::Regex::new(
        r"(?i)Current\s+week(?:\s*\([^)]*\))?\s*:\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·\s]\s*resets\s*([^\r\n]+))?",
    )
    .ok();

    let session_window = session_re.as_ref().and_then(|re| {
        let caps = re.captures(output)?;
        let pct: f64 = caps.get(1)?.as_str().parse().ok()?;
        let resets_at = caps
            .get(2)
            .and_then(|m| parse_cli_reset_timestamp(m.as_str().trim(), now));
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
            .and_then(|m| parse_cli_reset_timestamp(m.as_str().trim(), now));
        Some(ClaudeRateLimitWindow {
            used_percentage: Some(pct),
            resets_at,
        })
    });

    (session_window, week_window)
}

pub fn run_claude_cli_usage() -> Result<String, String> {
    let run = |cmd_name: &str, args: &[&str]| -> io::Result<std::process::Output> {
        Command::new(cmd_name)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
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
    let output = run("claude", &["-p", "/usage"])
        .or_else(|_| run("sh", &["-lc", "claude -p /usage"]));

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

#[derive(Debug, Clone)]
struct CliUsageCache {
    fetched_at: Instant,
    five_hour: Option<ClaudeRateLimitWindow>,
    seven_day: Option<ClaudeRateLimitWindow>,
}

static CLI_USAGE_CACHE: OnceLock<Mutex<Option<CliUsageCache>>> = OnceLock::new();
static CLI_USAGE_FETCHING: OnceLock<Mutex<bool>> = OnceLock::new();

pub fn get_cached_or_trigger_cli_usage(
    force: bool,
) -> (Option<ClaudeRateLimitWindow>, Option<ClaudeRateLimitWindow>) {
    let cache_lock = CLI_USAGE_CACHE.get_or_init(|| Mutex::new(None));
    {
        let guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(cached) = guard.as_ref() {
            if !force && cached.fetched_at.elapsed() < Duration::from_secs(60) {
                return (cached.five_hour.clone(), cached.seven_day.clone());
            }
        }
    }

    let has_stale = {
        let guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
        guard.is_some()
    };

    if has_stale && !force {
        let fetching_lock = CLI_USAGE_FETCHING.get_or_init(|| Mutex::new(false));
        let mut fetching = fetching_lock.lock().unwrap_or_else(|p| p.into_inner());
        if !*fetching {
            *fetching = true;
            std::thread::spawn(|| {
                if let Ok(stdout) = run_claude_cli_usage() {
                    let (five_hour, seven_day) = extract_cli_usage_from_output(&stdout, Utc::now());
                    let cache_lock = CLI_USAGE_CACHE.get_or_init(|| Mutex::new(None));
                    let mut guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
                    *guard = Some(CliUsageCache {
                        fetched_at: Instant::now(),
                        five_hour,
                        seven_day,
                    });
                }
                let fetching_lock = CLI_USAGE_FETCHING.get_or_init(|| Mutex::new(false));
                if let Ok(mut flag) = fetching_lock.lock() {
                    *flag = false;
                }
            });
        }
        let guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(cached) = guard.as_ref() {
            return (cached.five_hour.clone(), cached.seven_day.clone());
        }
    }

    let fetching_lock = CLI_USAGE_FETCHING.get_or_init(|| Mutex::new(false));
    let mut fetching = fetching_lock.lock().unwrap_or_else(|p| p.into_inner());
    *fetching = true;
    let (five_hour, seven_day) = if let Ok(stdout) = run_claude_cli_usage() {
        extract_cli_usage_from_output(&stdout, Utc::now())
    } else {
        (None, None)
    };
    *fetching = false;

    let mut guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
    *guard = Some(CliUsageCache {
        fetched_at: Instant::now(),
        five_hour: five_hour.clone(),
        seven_day: seven_day.clone(),
    });

    (five_hour, seven_day)
}

fn monitor_status(installed: bool, settings_path: PathBuf) -> Result<ClaudeMonitorStatus, String> {
    let statusline = read_snapshot()?;
    let transcript = read_local_transcript_scan()?;
    let now_ms = Utc::now().timestamp_millis().max(0) as u64;
    let (mut source, mut session, local_usage) = merge_monitor_sources(statusline, transcript, now_ms);

    let needs_cli = match &session {
        Some(s) => s.five_hour.is_none() || s.seven_day.is_none(),
        None => true,
    };

    if needs_cli {
        let (cli_5h, cli_7d) = get_cached_or_trigger_cli_usage(false);
        if cli_5h.is_some() || cli_7d.is_some() {
            if let Some(s) = session.as_mut() {
                if s.five_hour.is_none() {
                    s.five_hour = cli_5h;
                }
                if s.seven_day.is_none() {
                    s.seven_day = cli_7d;
                }
            } else {
                session = Some(ClaudeSessionSnapshot {
                    session_id: "claude-session".to_string(),
                    session_name: None,
                    model_id: Some("claude-sonnet-5".to_string()),
                    model_display_name: Some("Claude Sonnet  5".to_string()),
                    claude_code_version: None,
                    current_dir: None,
                    project_dir: None,
                    captured_at_ms: now_ms,
                    total_cost_usd: None,
                    total_duration_ms: None,
                    total_api_duration_ms: None,
                    total_input_tokens: None,
                    total_output_tokens: None,
                    context_window_size: None,
                    context_used_percentage: None,
                    context_remaining_percentage: None,
                    current_input_tokens: None,
                    current_output_tokens: None,
                    cache_creation_input_tokens: None,
                    cache_read_input_tokens: None,
                    five_hour: cli_5h,
                    seven_day: cli_7d,
                });
                source = ClaudeMonitorSource::LocalTranscript;
            }
        }
    }

    Ok(ClaudeMonitorStatus {
        installed,
        settings_path: Some(settings_path.to_string_lossy().to_string()),
        source,
        session,
        local_usage,
        error: None,
    })
}

#[tauri::command]
pub fn ensure_claude_statusline_bridge() -> Result<ClaudeMonitorStatus, String> {
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
    monitor_status(true, settings_path)
}

#[tauri::command]
pub fn get_claude_monitor_status() -> Result<ClaudeMonitorStatus, String> {
    let settings_path = claude_settings_path()?;
    let settings = read_settings(&settings_path)?;
    let installed = settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str)
        .is_some_and(is_bridge_command);
    monitor_status(installed, settings_path)
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
mod tests {
    use super::*;

    fn documented_payload() -> Value {
        serde_json::json!({
            "session_id": "session-123",
            "session_name": "QuotaShift work",
            "model": { "id": "claude-opus-5", "display_name": "Opus" },
            "workspace": {
                "current_dir": "C:/repo/QuotaShift",
                "project_dir": "C:/repo/QuotaShift"
            },
            "version": "2.1.90",
            "cost": {
                "total_cost_usd": 0.42,
                "total_duration_ms": 45000,
                "total_api_duration_ms": 2300
            },
            "context_window": {
                "total_input_tokens": 15500,
                "total_output_tokens": 1200,
                "context_window_size": 200000,
                "used_percentage": 8.0,
                "remaining_percentage": 92.0,
                "current_usage": {
                    "input_tokens": 8500,
                    "output_tokens": 1200,
                    "cache_creation_input_tokens": 5000,
                    "cache_read_input_tokens": 2000
                }
            },
            "rate_limits": {
                "five_hour": { "used_percentage": 23.5, "resets_at": 1738425600 },
                "seven_day": { "used_percentage": 41.2, "resets_at": 1738857600 }
            }
        })
    }

    #[test]
    fn normalizes_documented_status_line_fields() {
        let snapshot = normalize_payload(&documented_payload(), 1_700_000_000_000).unwrap();
        assert_eq!(snapshot.session_id, "session-123");
        assert_eq!(snapshot.model_display_name.as_deref(), Some("Opus"));
        assert_eq!(snapshot.context_window_size, Some(200000));
        assert_eq!(snapshot.context_used_percentage, Some(8.0));
        assert_eq!(
            snapshot.five_hour.as_ref().and_then(|v| v.used_percentage),
            Some(23.5)
        );
        assert_eq!(
            snapshot.seven_day.as_ref().and_then(|v| v.resets_at),
            Some(1738857600)
        );
        assert_eq!(snapshot.captured_at_ms, 1_700_000_000_000);
    }

    #[test]
    fn accepts_missing_optional_rate_limits() {
        let mut payload = documented_payload();
        payload.as_object_mut().unwrap().remove("rate_limits");
        let snapshot = normalize_payload(&payload, 123).unwrap();
        assert!(snapshot.five_hour.is_none());
        assert!(snapshot.seven_day.is_none());
    }

    #[test]
    fn bridge_install_preserves_existing_status_line_options() {
        let mut settings = serde_json::json!({
            "permissions": { "allow": ["Bash(git status)"] },
            "statusLine": {
                "type": "command",
                "command": "~/.claude/my-status.sh",
                "padding": 2,
                "refreshInterval": 7,
                "hideVimModeIndicator": true
            }
        });
        let previous = install_bridge_in_value(
            &mut settings,
            "\"C:/QuotaShift.exe\" --claude-statusline-bridge",
        )
        .unwrap();
        assert_eq!(
            previous
                .as_ref()
                .and_then(|v| v.get("command"))
                .and_then(Value::as_str),
            Some("~/.claude/my-status.sh")
        );
        assert_eq!(
            settings
                .pointer("/statusLine/padding")
                .and_then(Value::as_i64),
            Some(2)
        );
        assert_eq!(
            settings
                .pointer("/statusLine/refreshInterval")
                .and_then(Value::as_i64),
            Some(7)
        );
        assert_eq!(
            settings
                .pointer("/statusLine/hideVimModeIndicator")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            settings
                .pointer("/permissions/allow/0")
                .and_then(Value::as_str),
            Some("Bash(git status)")
        );
    }

    #[test]
    fn recognizes_existing_bridge_as_idempotent() {
        assert!(is_bridge_command(
            "\"C:/old/QuotaShift.exe\" --claude-statusline-bridge"
        ));
        assert!(!is_bridge_command("~/.claude/my-status.sh"));
    }

    #[test]
    fn compact_fallback_uses_model_and_context_without_conversation_content() {
        assert_eq!(
            fallback_status_line(&documented_payload()),
            "Opus · 8% context"
        );
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_bridge_command_uses_powershell_for_quoted_executable_path() {
        let command =
            quoted_bridge_command(Path::new(r"C:\Program Files\QuotaShift\quotashift.exe"));
        assert_eq!(
            command,
            "powershell -NoProfile -Command \"& 'C:/Program Files/QuotaShift/quotashift.exe' --claude-statusline-bridge\""
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_bridge_command_escapes_single_quote_in_path() {
        let command =
            quoted_bridge_command(Path::new(r"C:\Users\O'Brien\QuotaShift\quotashift.exe"));
        assert!(command.contains("O''Brien"));
    }
    fn transcript_test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "quotashift-claude-monitor-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("project")).unwrap();
        root
    }

    fn transcript_record(
        id: &str,
        timestamp: &str,
        input: u64,
        output: u64,
        cache_create: u64,
        cache_read: u64,
    ) -> Value {
        serde_json::json!({
            "timestamp": timestamp,
            "sessionId": "session-main",
            "cwd": "C:/repo/QuotaShift",
            "version": "2.1.260",
            "message": {
                "id": id,
                "model": "claude-sonnet-5",
                "content": [{ "type": "text", "text": "must never be deserialized" }],
                "usage": {
                    "input_tokens": input,
                    "output_tokens": output,
                    "cache_creation_input_tokens": cache_create,
                    "cache_read_input_tokens": cache_read
                }
            }
        })
    }

    fn write_transcript(path: &Path, records: &[Value]) {
        let body = records
            .iter()
            .map(|record| serde_json::to_string(record).unwrap())
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(path, format!("{body}\n")).unwrap();
    }

    fn utc(timestamp: &str) -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339(timestamp)
            .unwrap()
            .with_timezone(&chrono::Utc)
    }

    #[test]
    fn transcript_duplicate_message_ids_count_once() {
        let root = transcript_test_root("dedupe");
        let file = root.join("project").join("session.jsonl");
        write_transcript(
            &file,
            &[
                transcript_record("msg-1", "2026-09-09T10:00:00Z", 10, 20, 30, 40),
                transcript_record("msg-1", "2026-09-09T10:00:01Z", 10, 20, 30, 40),
            ],
        );

        let scan = scan_local_transcripts_at(&root, utc("2026-09-09T12:00:00Z"));
        let five = scan.observed_usage.unwrap().five_hour;
        assert_eq!(five.request_count, 1);
        assert_eq!(five.processed_tokens, 100);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn transcript_rolling_windows_include_only_recent_unique_usage() {
        let root = transcript_test_root("windows");
        let file = root.join("project").join("session.jsonl");
        write_transcript(
            &file,
            &[
                transcript_record("five", "2026-09-09T08:00:00Z", 1, 2, 3, 4),
                transcript_record("seven", "2026-09-05T12:00:00Z", 10, 20, 30, 40),
                transcript_record("old", "2026-09-01T11:59:59Z", 100, 200, 300, 400),
            ],
        );

        let scan = scan_local_transcripts_at(&root, utc("2026-09-09T12:00:00Z"));
        let usage = scan.observed_usage.unwrap();
        assert_eq!(usage.five_hour.request_count, 1);
        assert_eq!(usage.five_hour.processed_tokens, 10);
        assert_eq!(usage.seven_day.request_count, 2);
        assert_eq!(usage.seven_day.processed_tokens, 110);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn transcript_missing_root_is_valid_no_data() {
        let root = std::env::temp_dir().join(format!(
            "quotashift-claude-monitor-missing-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let scan = scan_local_transcripts_at(&root, utc("2026-09-09T12:00:00Z"));
        assert!(scan.latest_main_session.is_none());
        assert!(scan.observed_usage.is_none());
    }
    fn snapshot_at(captured_at_ms: u64) -> ClaudeSessionSnapshot {
        ClaudeSessionSnapshot {
            session_id: "snapshot-session".to_string(),
            session_name: None,
            model_id: Some("claude-sonnet-5".to_string()),
            model_display_name: Some("Claude Sonnet 5".to_string()),
            claude_code_version: Some("2.1.260".to_string()),
            current_dir: Some("C:/repo".to_string()),
            project_dir: Some("C:/repo".to_string()),
            captured_at_ms,
            total_cost_usd: None,
            total_duration_ms: None,
            total_api_duration_ms: None,
            total_input_tokens: None,
            total_output_tokens: None,
            context_window_size: None,
            context_used_percentage: None,
            context_remaining_percentage: None,
            current_input_tokens: None,
            current_output_tokens: None,
            cache_creation_input_tokens: None,
            cache_read_input_tokens: None,
            five_hour: None,
            seven_day: None,
        }
    }

    fn snapshot_with_limits(captured_at_ms: u64, five: f64, seven: f64) -> ClaudeSessionSnapshot {
        let mut snapshot = snapshot_at(captured_at_ms);
        snapshot.five_hour = Some(ClaudeRateLimitWindow {
            used_percentage: Some(five),
            resets_at: Some(2_000_000_000),
        });
        snapshot.seven_day = Some(ClaudeRateLimitWindow {
            used_percentage: Some(seven),
            resets_at: Some(2_000_100_000),
        });
        snapshot
    }

    #[test]
    fn transcript_latest_main_session_maps_context_metadata() {
        let root = transcript_test_root("session-map");
        let file = root.join("project").join("session.jsonl");
        write_transcript(
            &file,
            &[
                transcript_record("start", "2026-09-09T10:00:00Z", 1, 10, 20, 30),
                transcript_record("latest", "2026-09-09T11:00:00Z", 2, 100, 300, 400),
            ],
        );

        let scan = scan_local_transcripts_at(&root, utc("2026-09-09T12:00:00Z"));
        let session = scan.latest_main_session.unwrap();
        assert_eq!(session.session_id, "session-main");
        assert_eq!(session.model_id.as_deref(), Some("claude-sonnet-5"));
        assert_eq!(session.total_input_tokens, Some(702));
        assert_eq!(session.total_output_tokens, Some(100));
        assert_eq!(session.current_input_tokens, Some(2));
        assert_eq!(session.cache_creation_input_tokens, Some(300));
        assert_eq!(session.cache_read_input_tokens, Some(400));
        assert_eq!(session.total_duration_ms, Some(3_600_000));
        assert!(session.context_window_size.is_none());
        assert!(session.five_hour.is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn transcript_subagent_usage_counts_but_subagent_cannot_be_current_session() {
        let root = transcript_test_root("subagent");
        let main = root.join("project").join("main.jsonl");
        let subagents = root.join("project").join("main").join("subagents");
        fs::create_dir_all(&subagents).unwrap();
        write_transcript(
            &main,
            &[transcript_record(
                "main-msg",
                "2026-09-09T10:00:00Z",
                1,
                2,
                3,
                4,
            )],
        );
        write_transcript(
            &subagents.join("agent-1.jsonl"),
            &[transcript_record(
                "agent-msg",
                "2026-09-09T11:00:00Z",
                10,
                20,
                30,
                40,
            )],
        );

        let scan = scan_local_transcripts_at(&root, utc("2026-09-09T12:00:00Z"));
        assert_eq!(
            scan.observed_usage
                .as_ref()
                .unwrap()
                .five_hour
                .request_count,
            2
        );
        assert_eq!(
            scan.latest_main_session.as_ref().unwrap().captured_at_ms,
            utc("2026-09-09T10:00:00Z").timestamp_millis() as u64
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn newer_transcript_session_beats_older_statusline_session() {
        let statusline = snapshot_at(1_000);
        let transcript = LocalTranscriptScan {
            latest_main_session: Some(snapshot_at(2_000)),
            observed_usage: None,
        };
        let (source, session, _) = merge_monitor_sources(Some(statusline), transcript, 2_000);
        assert_eq!(source, ClaudeMonitorSource::LocalTranscript);
        assert_eq!(session.unwrap().captured_at_ms, 2_000);
    }

    #[test]
    fn fresh_statusline_rate_limits_merge_into_newer_transcript_session() {
        let statusline = snapshot_with_limits(1_000_000, 33.0, 44.0);
        let transcript = LocalTranscriptScan {
            latest_main_session: Some(snapshot_at(1_100_000)),
            observed_usage: None,
        };
        let (_, session, _) = merge_monitor_sources(Some(statusline), transcript, 1_100_000);
        let session = session.unwrap();
        assert_eq!(session.five_hour.unwrap().used_percentage, Some(33.0));
        assert_eq!(session.seven_day.unwrap().used_percentage, Some(44.0));
    }

    #[test]
    fn stale_statusline_rate_limits_do_not_merge_into_transcript_session() {
        let statusline = snapshot_with_limits(1_000_000, 33.0, 44.0);
        let transcript = LocalTranscriptScan {
            latest_main_session: Some(snapshot_at(1_400_001)),
            observed_usage: None,
        };
        let (_, session, _) = merge_monitor_sources(Some(statusline), transcript, 1_400_001);
        let session = session.unwrap();
        assert!(session.five_hour.is_none());
        assert!(session.seven_day.is_none());
    }

    #[test]
    fn extracts_cli_usage_correctly() {
        let sample = "You are currently using your subscription to power your Claude Code usage\n\n\
Current session: 26% used  resets Sep 9, 6:39pm (Asia/Ho_Chi_Minh)\n\
Current week (all models): 4% used  resets Sep 16, 1:59am (Asia/Ho_Chi_Minh)\n\n\
What's contributing to your limits usage?";
        let now = utc("2026-09-09T08:00:00Z");
        let (five_hour, seven_day) = extract_cli_usage_from_output(sample, now);
        assert_eq!(five_hour.as_ref().and_then(|w| w.used_percentage), Some(26.0));
        assert!(five_hour.as_ref().and_then(|w| w.resets_at).is_some());
        assert_eq!(seven_day.as_ref().and_then(|w| w.used_percentage), Some(4.0));
        assert!(seven_day.as_ref().and_then(|w| w.resets_at).is_some());
    }

    #[test]
    fn extracts_cli_usage_with_bullet_and_hour_without_minutes() {
        let sample = "Current session: 27% used · resets Sep 9, 6:40pm (Asia/Ho_Chi_Minh)\n\
Current week (all models): 4% used · resets Sep 16, 2am (Asia/Ho_Chi_Minh)";
        let now = utc("2026-09-09T08:00:00Z");
        let (five_hour, seven_day) = extract_cli_usage_from_output(sample, now);
        assert_eq!(five_hour.as_ref().and_then(|w| w.used_percentage), Some(27.0));
        assert_eq!(seven_day.as_ref().and_then(|w| w.used_percentage), Some(4.0));
    }

    #[test]
    fn extracts_cli_usage_with_spaced_formatting() {
        let sample = "Current session : 26 % used      resets  Sep 9, 6 :39pm  ( Asia/ Ho _ Chi _ Minh )\n\
Current week  (all models ) : 4 % used      resets  Sep 16, 1 :59am  ( Asia/ Ho _ Chi _ Minh )";
        let now = utc("2026-09-09T08:00:00Z");
        let (five_hour, seven_day) = extract_cli_usage_from_output(sample, now);
        assert_eq!(five_hour.as_ref().and_then(|w| w.used_percentage), Some(26.0));
        assert!(five_hour.as_ref().and_then(|w| w.resets_at).is_some());
        assert_eq!(seven_day.as_ref().and_then(|w| w.used_percentage), Some(4.0));
        assert!(seven_day.as_ref().and_then(|w| w.resets_at).is_some());
    }

    #[test]
    fn formats_claude_model_name_with_string_replacement() {
        assert_eq!(format_claude_model_name("claude-sonnet-5"), "Claude Sonnet  5");
        assert_eq!(format_claude_model_name("claude-opus-5"), "Claude Opus  5");
        assert_eq!(format_claude_model_name("Claude Sonnet 3.5"), "Claude Sonnet 3.5");
        assert_eq!(format_claude_model_name("claude-haiku-4-5-20251001"), "Claude Haiku 4.5");
    }
}
