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
    let command = quoted_bridge_command(Path::new(r"C:\Program Files\QuotaShift\quotashift.exe"));
    assert_eq!(
        command,
        "powershell -NoProfile -Command \"& 'C:/Program Files/QuotaShift/quotashift.exe' --claude-statusline-bridge\""
    );
}

#[cfg(target_os = "windows")]
#[test]
fn windows_bridge_command_escapes_single_quote_in_path() {
    let command = quoted_bridge_command(Path::new(r"C:\Users\O'Brien\QuotaShift\quotashift.exe"));
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
    assert_eq!(
        five_hour.as_ref().and_then(|w| w.used_percentage),
        Some(26.0)
    );
    assert!(five_hour.as_ref().and_then(|w| w.resets_at).is_some());
    assert_eq!(
        seven_day.as_ref().and_then(|w| w.used_percentage),
        Some(4.0)
    );
    assert!(seven_day.as_ref().and_then(|w| w.resets_at).is_some());
}

#[test]
fn extracts_cli_usage_with_bullet_and_hour_without_minutes() {
    let sample = "Current session: 27% used · resets Sep 9, 6:40pm (Asia/Ho_Chi_Minh)\n\
Current week (all models): 4% used · resets Sep 16, 2am (Asia/Ho_Chi_Minh)";
    let now = utc("2026-09-09T08:00:00Z");
    let (five_hour, seven_day) = extract_cli_usage_from_output(sample, now);
    assert_eq!(
        five_hour.as_ref().and_then(|w| w.used_percentage),
        Some(27.0)
    );
    assert_eq!(
        seven_day.as_ref().and_then(|w| w.used_percentage),
        Some(4.0)
    );
}

#[test]
fn extracts_cli_usage_with_spaced_formatting() {
    let sample =
        "Current session : 26 % used      resets  Sep 9, 6 :39pm  ( Asia/ Ho _ Chi _ Minh )\n\
Current week  (all models ) : 4 % used      resets  Sep 16, 1 :59am  ( Asia/ Ho _ Chi _ Minh )";
    let now = utc("2026-09-09T08:00:00Z");
    let (five_hour, seven_day) = extract_cli_usage_from_output(sample, now);
    assert_eq!(
        five_hour.as_ref().and_then(|w| w.used_percentage),
        Some(26.0)
    );
    assert!(five_hour.as_ref().and_then(|w| w.resets_at).is_some());
    assert_eq!(
        seven_day.as_ref().and_then(|w| w.used_percentage),
        Some(4.0)
    );
    assert!(seven_day.as_ref().and_then(|w| w.resets_at).is_some());
}

#[test]
fn formats_claude_model_name_with_string_replacement() {
    assert_eq!(
        format_claude_model_name("claude-sonnet-5"),
        "Claude Sonnet  5"
    );
    assert_eq!(format_claude_model_name("claude-opus-5"), "Claude Opus  5");
    assert_eq!(
        format_claude_model_name("Claude Sonnet 3.5"),
        "Claude Sonnet 3.5"
    );
    assert_eq!(
        format_claude_model_name("claude-haiku-4-5-20251001"),
        "Claude Haiku 4.5"
    );
}
