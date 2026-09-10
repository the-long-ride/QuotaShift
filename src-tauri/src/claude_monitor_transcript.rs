use chrono::{DateTime, Duration as ChronoDuration, Utc};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use super::{
    format_claude_model_name, ClaudeObservedUsage, ClaudeObservedUsageWindow,
    ClaudeSessionSnapshot, LocalTranscriptRecord, LocalTranscriptScan, LocalUsageFields,
    ObservedUsageRecord,
};

pub fn collect_recent_transcript_files(
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

pub fn add_usage(window: &mut ClaudeObservedUsageWindow, usage: &LocalUsageFields) {
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

pub fn is_subagent_transcript(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "subagents")
}

pub fn scan_local_transcripts_internal(
    projects_root: &Path,
    now: DateTime<Utc>,
) -> LocalTranscriptScan {
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
