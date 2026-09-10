use chrono::Utc;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::claude_monitor::cli::get_cached_or_trigger_cli_usage;
use crate::claude_monitor::types::{
    ClaudeMonitorSource, ClaudeMonitorStatus, ClaudeObservedUsage, ClaudeSessionSnapshot,
    LocalTranscriptScan,
};
use crate::claude_monitor::{claude_projects_path, scan_local_transcripts_at, snapshot_path};

#[derive(Debug, Clone)]
struct TranscriptCache {
    scanned_at: Instant,
    value: LocalTranscriptScan,
}

static TRANSCRIPT_CACHE: OnceLock<Mutex<Option<TranscriptCache>>> = OnceLock::new();

pub fn read_snapshot() -> Result<Option<ClaudeSessionSnapshot>, String> {
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

pub fn read_local_transcript_scan() -> Result<LocalTranscriptScan, String> {
    let cache = TRANSCRIPT_CACHE.get_or_init(|| Mutex::new(None));
    {
        let guard = cache.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(cached) = guard.as_ref() {
            if cached.scanned_at.elapsed() < Duration::from_secs(2) {
                return Ok(cached.value.clone());
            }
        }
    }
    let value = scan_local_transcripts_at(&claude_projects_path()?, Utc::now());
    let mut guard = cache.lock().unwrap_or_else(|p| p.into_inner());
    *guard = Some(TranscriptCache {
        scanned_at: Instant::now(),
        value: value.clone(),
    });
    Ok(value)
}

pub fn merge_monitor_sources(
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

pub fn monitor_status(
    installed: bool,
    settings_path: PathBuf,
) -> Result<ClaudeMonitorStatus, String> {
    let statusline = read_snapshot()?;
    let transcript = read_local_transcript_scan()?;
    let now_ms = Utc::now().timestamp_millis().max(0) as u64;
    let (mut source, mut session, local_usage) =
        merge_monitor_sources(statusline, transcript, now_ms);

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
