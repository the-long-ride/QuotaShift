use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::bridge::{
    ensure_claude_statusline_bridge_for_dir_with, previous_command_for_dir_at,
    previous_status_line_path_for_dir_at, quoted_bridge_command, PREVIOUS_STATUS_LINE_FILE,
};
use super::payload::normalize_payload_value;
use super::profile_snapshots::{
    process_statusline_payload_at, read_profile_snapshot_at, resolve_active_config_dir_with,
    save_profile_snapshot_at,
};
use super::types::{ClaudeRateLimitWindow, ClaudeSessionSnapshot};
use super::usage_scheduler::ClaudeUsageScheduler;
use super::SNAPSHOT_FILE;

fn temp_root(label: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "quotashift-claude-bridge-{label}-{}-{suffix}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

fn sample_snapshot(
    session_id: &str,
    five: f64,
    seven: f64,
    resets_at: i64,
) -> ClaudeSessionSnapshot {
    let payload = serde_json::json!({
        "session_id": session_id,
        "rate_limits": {
            "five_hour": { "used_percentage": five, "resets_at": resets_at },
            "seven_day": { "used_percentage": seven, "resets_at": resets_at + 86_400 }
        }
    });
    normalize_payload_value(&payload, 1_750_000_000_000).unwrap()
}

fn window(used: f64, resets_at: i64) -> ClaudeRateLimitWindow {
    ClaudeRateLimitWindow {
        used_percentage: Some(used),
        resets_at: Some(resets_at),
    }
}

#[test]
fn per_profile_bridge_install_preserves_existing_commands_and_is_idempotent() {
    let root = temp_root("per-profile-install");
    let home = root.join("home");
    let qs_dir = home.join(".quotashift");
    let profile_a = qs_dir.join("claude-profiles").join("work");
    let profile_b = qs_dir.join("claude-profiles").join("personal");
    let exe = Path::new("/opt/QuotaShift/quotashift");
    fs::create_dir_all(&profile_a).unwrap();
    fs::create_dir_all(&profile_b).unwrap();

    fs::write(
        profile_a.join("settings.json"),
        r#"{"statusLine":{"type":"command","command":"work-status.sh","padding":1},"theme":"dark"}"#,
    )
    .unwrap();
    fs::write(
        profile_b.join("settings.json"),
        r#"{"statusLine":{"type":"command","command":"personal-status.sh"}}"#,
    )
    .unwrap();

    assert_eq!(
        ensure_claude_statusline_bridge_for_dir_with(&profile_a, &home, &qs_dir, exe).unwrap(),
        true
    );
    assert_eq!(
        ensure_claude_statusline_bridge_for_dir_with(&profile_b, &home, &qs_dir, exe).unwrap(),
        true
    );
    // Second run with the same executable is a no-op and keeps saved previous commands intact.
    assert_eq!(
        ensure_claude_statusline_bridge_for_dir_with(&profile_a, &home, &qs_dir, exe).unwrap(),
        false
    );

    let saved_a: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(profile_a.join("settings.json")).unwrap())
            .unwrap();
    assert_eq!(
        saved_a
            .pointer("/statusLine/command")
            .and_then(|v| v.as_str()),
        Some(quoted_bridge_command(exe).as_str())
    );
    assert_eq!(
        saved_a
            .pointer("/statusLine/padding")
            .and_then(|v| v.as_i64()),
        Some(1)
    );
    assert_eq!(saved_a.get("theme").and_then(|v| v.as_str()), Some("dark"));
    assert_eq!(
        previous_command_for_dir_at(&qs_dir, &profile_a, &home).as_deref(),
        Some("work-status.sh")
    );
    assert_eq!(
        previous_command_for_dir_at(&qs_dir, &profile_b, &home).as_deref(),
        Some("personal-status.sh")
    );
    assert!(previous_status_line_path_for_dir_at(&qs_dir, &profile_a).exists());
    assert!(!qs_dir.join(PREVIOUS_STATUS_LINE_FILE).exists());

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn default_profile_bridge_keeps_legacy_previous_file_compatibility() {
    let root = temp_root("default-compat");
    let home = root.join("home");
    let qs_dir = home.join(".quotashift");
    let default_dir = home.join(".claude");
    let exe = Path::new("/opt/QuotaShift/quotashift");
    fs::create_dir_all(&default_dir).unwrap();
    fs::write(
        default_dir.join("settings.json"),
        r#"{"statusLine":{"type":"command","command":"legacy-status.sh"}}"#,
    )
    .unwrap();

    assert_eq!(
        ensure_claude_statusline_bridge_for_dir_with(&default_dir, &home, &qs_dir, exe).unwrap(),
        true
    );
    assert!(qs_dir.join(PREVIOUS_STATUS_LINE_FILE).exists());
    assert_eq!(
        previous_command_for_dir_at(&qs_dir, &default_dir, &home).as_deref(),
        Some("legacy-status.sh")
    );

    // Removing the per-profile previous file still falls back to legacy for ~/.claude.
    fs::remove_file(previous_status_line_path_for_dir_at(&qs_dir, &default_dir)).unwrap();
    assert_eq!(
        previous_command_for_dir_at(&qs_dir, &default_dir, &home).as_deref(),
        Some("legacy-status.sh")
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn profile_snapshots_roundtrip_and_isolate_profiles_from_legacy_snapshot() {
    let root = temp_root("snapshots");
    let home = root.join("home");
    let qs_dir = home.join(".quotashift");
    let default_dir = home.join(".claude");
    let custom_dir = qs_dir.join("claude-profiles").join("team-a");
    fs::create_dir_all(&default_dir).unwrap();
    fs::create_dir_all(&custom_dir).unwrap();

    let snap_a = sample_snapshot("sess-a", 18.5, 42.0, 1_800_000_000);
    let snap_b = sample_snapshot("sess-b", 77.0, 61.5, 1_800_005_000);
    save_profile_snapshot_at(&qs_dir, &default_dir, &snap_a).unwrap();
    save_profile_snapshot_at(&qs_dir, &custom_dir, &snap_b).unwrap();

    assert_eq!(
        read_profile_snapshot_at(&qs_dir, &default_dir)
            .unwrap()
            .five_hour
            .unwrap()
            .used_percentage,
        Some(18.5)
    );
    assert_eq!(
        read_profile_snapshot_at(&qs_dir, &custom_dir)
            .unwrap()
            .five_hour
            .unwrap()
            .used_percentage,
        Some(77.0)
    );

    let raw = r#"{"session_id":"live-1","rate_limits":{"five_hour":{"used_percentage":33.0,"resets_at":1800009000},"seven_day":{"used_percentage":50.0,"resets_at":1800500000}}}"#;
    process_statusline_payload_at(raw, &custom_dir, &home, &qs_dir, 1_750_000_123_000).unwrap();
    assert!(
        !qs_dir.join(SNAPSHOT_FILE).exists(),
        "custom CLAUDE_CONFIG_DIR must not overwrite legacy default snapshot"
    );
    assert_eq!(
        read_profile_snapshot_at(&qs_dir, &custom_dir)
            .unwrap()
            .five_hour
            .unwrap()
            .used_percentage,
        Some(33.0)
    );

    process_statusline_payload_at(raw, &default_dir, &home, &qs_dir, 1_750_000_456_000).unwrap();
    assert!(
        qs_dir.join(SNAPSHOT_FILE).exists(),
        "default ~/.claude profile should keep legacy claude-session.json updated"
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn resolve_active_config_dir_handles_env_override_tilde_and_fallback() {
    let home = PathBuf::from("/tmp/claude-home");
    assert_eq!(
        resolve_active_config_dir_with(None, &home),
        home.join(".claude")
    );
    assert_eq!(
        resolve_active_config_dir_with(Some(OsString::from("   ")), &home),
        home.join(".claude")
    );
    assert_eq!(
        resolve_active_config_dir_with(
            Some(OsString::from("~/.quotashift/claude-profiles/w")),
            &home
        ),
        home.join(".quotashift/claude-profiles/w")
    );
    assert_eq!(
        resolve_active_config_dir_with(Some(OsString::from("/opt/claude-work")), &home),
        PathBuf::from("/opt/claude-work")
    );
}

#[test]
fn scheduler_ingests_external_snapshots_and_honors_idle_interval_and_reset_time() {
    let scheduler = ClaudeUsageScheduler::default();
    let profile = PathBuf::from("C:/profiles/team");
    let now_secs = 2_000_000_000;

    assert!(scheduler.is_cli_probe_needed(&profile, 600, now_secs));
    assert!(!scheduler.ingest_external_snapshot(&profile, None, None, now_secs));

    assert!(scheduler.ingest_external_snapshot(
        &profile,
        Some(window(24.0, now_secs + 3600)),
        Some(window(61.0, now_secs + 86_400)),
        now_secs - 100,
    ));

    // Older timestamps do not overwrite a fresher snapshot.
    assert!(!scheduler.ingest_external_snapshot(
        &profile,
        Some(window(10.0, now_secs + 3600)),
        None,
        now_secs - 200,
    ));

    // Partial update merges cleanly without wiping the other window.
    assert!(scheduler.ingest_external_snapshot(
        &profile,
        Some(window(29.0, now_secs + 3600)),
        None,
        now_secs - 50,
    ));

    let (snapshot, fresh) = scheduler.snapshot_for(&profile, 600);
    assert!(fresh || snapshot.fetched_at == Some(now_secs - 50));
    assert_eq!(
        snapshot.five_hour.as_ref().unwrap().used_percentage,
        Some(29.0)
    );
    assert_eq!(
        snapshot.seven_day.as_ref().unwrap().used_percentage,
        Some(61.0)
    );

    // Within idle_interval_secs and before 5h resets_at -> no CLI probe needed.
    assert!(!scheduler.is_cli_probe_needed(&profile, 600, now_secs));
    // Age >= idle_interval_secs -> CLI probe needed.
    assert!(scheduler.is_cli_probe_needed(&profile, 50, now_secs));
    // Cached 5h resets_at passed -> CLI probe needed even inside idle_interval_secs.
    assert!(scheduler.is_cli_probe_needed(&profile, 7200, now_secs + 3600));
}
