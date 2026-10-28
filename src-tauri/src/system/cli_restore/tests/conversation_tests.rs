use super::conversation::*;
use super::{CliKind, CliSnapshot};

const A: &str = "0d4fca35-017e-4725-8940-b4deb9c27a11";
const B: &str = "7c1e2b90-5a3d-4e8f-9b21-3f6d8a0c4e55";
const C: &str = "11111111-2222-3333-4444-555555555555";
const D: &str = "99999999-2222-3333-4444-555555555555";
const E: &str = "aaaaaaaa-2222-3333-4444-555555555555";

fn snap(kind: CliKind, cwd: &str, started_at: u64, args: &[&str]) -> CliSnapshot {
    CliSnapshot {
        kind,
        pid: started_at as u32,
        pids: vec![],
        cwd: Some(cwd.into()),
        started_at,
        args: args.iter().map(|a| a.to_string()).collect(),
        conversation: None,
        shell: None,
        terminal: None,
        tmux_pane: None,
    }
}

fn meta(id: &str, cwd: &str, originator: &str, modified: u64) -> RolloutMeta {
    RolloutMeta {
        id: id.into(),
        cwd: cwd.into(),
        originator: originator.into(),
        modified,
    }
}

#[test]
fn drive_paths_compare_without_case_separators_or_long_prefix() {
    assert_eq!(
        normalize_path("\\\\?\\F:\\Repo\\"),
        normalize_path("f:/repo")
    );
}

#[cfg(not(target_os = "windows"))]
#[test]
fn posix_paths_stay_case_sensitive() {
    assert_ne!(
        normalize_path("/home/a/Repo"),
        normalize_path("/home/a/repo")
    );
}

#[test]
fn ids_are_validated() {
    assert!(valid_id(A));
    assert!(!valid_id("short"));
    assert!(!valid_id("0d4fca35; rm -rf"));
}

#[test]
fn parses_rollout_head_and_history_lines() {
    let head = format!(
        r#"{{"type":"session_meta","payload":{{"id":"{A}","cwd":"F:\\repo","originator":"codex_cli_rs"}}}}"#
    );
    let m = parse_rollout_head(&head, 50).unwrap();
    assert_eq!(
        (m.id.as_str(), m.cwd.as_str(), m.modified),
        (A, "F:\\repo", 50)
    );
    assert!(parse_rollout_head(r#"{"type":"response_item"}"#, 1).is_none());
    let line = format!(
        r#"{{"display":"x","timestamp":1791400635878,"workspace":"F:\\repo","conversationId":"{A}"}}"#
    );
    let h = parse_history_line(&line).unwrap();
    assert_eq!(
        (h.conversation_id.as_str(), h.timestamp_ms),
        (A, 1791400635878)
    );
}

#[test]
fn explicit_ids_win() {
    let codex = vec!["resume".to_string(), A.to_string()];
    assert_eq!(explicit_id(CliKind::Codex, &codex).as_deref(), Some(A));
    let agy = vec!["--conversation".to_string(), B.to_string()];
    assert_eq!(explicit_id(CliKind::Agy, &agy).as_deref(), Some(B));
    let inline = vec![format!("--conversation={B}")];
    assert_eq!(explicit_id(CliKind::Agy, &inline).as_deref(), Some(B));
    assert_eq!(
        explicit_id(CliKind::Codex, &["resume".into(), "--last".into()]),
        None
    );
}

#[test]
fn codex_picks_newest_cli_rollout_in_same_folder_after_start() {
    let metas = vec![
        meta(A, "F:\\repo", "codex_cli_rs", 120),
        meta(B, "F:\\repo", "Codex Desktop", 200),
        meta(C, "F:\\other", "codex_cli_rs", 300),
        meta(D, "F:\\repo", "codex_cli_rs", 90),
        meta(E, "F:\\repo", "codex_vscode", 250),
    ];
    let mut snaps = vec![snap(CliKind::Codex, "f:/repo", 100, &[])];
    assign_with(CliKind::Codex, &mut snaps, &metas, &[]);
    assert_eq!(snaps[0].conversation.as_deref(), Some(A));
}

#[test]
fn two_instances_do_not_share_an_id() {
    let metas = vec![
        meta(A, "F:\\repo", "codex_cli_rs", 300),
        meta(B, "F:\\repo", "codex_cli_rs", 250),
    ];
    let mut snaps = vec![
        snap(CliKind::Codex, "F:\\repo", 100, &[]),
        snap(CliKind::Codex, "F:\\repo", 200, &[]),
    ];
    assign_with(CliKind::Codex, &mut snaps, &metas, &[]);
    assert_eq!(snaps[1].conversation.as_deref(), Some(A));
    assert_eq!(snaps[0].conversation.as_deref(), Some(B));
}

#[test]
fn the_newer_instance_keeps_the_newer_conversation_in_a_shared_folder() {
    let metas = vec![
        meta(A, "F:\\repo", "codex_cli_rs", 110),
        meta(B, "F:\\repo", "codex_cli_rs", 210),
    ];
    let mut snaps = vec![
        snap(CliKind::Codex, "F:\\repo", 100, &[]),
        snap(CliKind::Codex, "F:\\repo", 200, &[]),
    ];
    assign_with(CliKind::Codex, &mut snaps, &metas, &[]);
    assert_eq!(snaps[0].conversation.as_deref(), Some(A));
    assert_eq!(snaps[1].conversation.as_deref(), Some(B));

    let history = vec![
        HistoryEntry {
            conversation_id: A.into(),
            workspace: "F:\\repo".into(),
            timestamp_ms: 110_000,
        },
        HistoryEntry {
            conversation_id: B.into(),
            workspace: "F:\\repo".into(),
            timestamp_ms: 210_000,
        },
    ];
    let mut agy = vec![
        snap(CliKind::Agy, "F:\\repo", 100, &[]),
        snap(CliKind::Agy, "F:\\repo", 200, &[]),
    ];
    assign_with(CliKind::Agy, &mut agy, &[], &history);
    assert_eq!(agy[0].conversation.as_deref(), Some(A));
    assert_eq!(agy[1].conversation.as_deref(), Some(B));
}

#[test]
fn an_explicit_id_is_kept_and_not_given_to_another_instance() {
    let metas = vec![meta(A, "F:\\repo", "codex_cli_rs", 300)];
    let mut snaps = vec![
        snap(CliKind::Codex, "F:\\repo", 100, &["resume", A]),
        snap(CliKind::Codex, "F:\\repo", 200, &[]),
    ];
    assign_with(CliKind::Codex, &mut snaps, &metas, &[]);
    assert_eq!(snaps[0].conversation.as_deref(), Some(A));
    assert_eq!(snaps[1].conversation, None);
}

#[test]
fn agy_uses_latest_history_entry_after_start_or_none() {
    let history = vec![
        HistoryEntry {
            conversation_id: B.into(),
            workspace: "F:\\repo".into(),
            timestamp_ms: 50_000,
        },
        HistoryEntry {
            conversation_id: A.into(),
            workspace: "F:\\repo".into(),
            timestamp_ms: 150_000,
        },
    ];
    let mut snaps = vec![snap(CliKind::Agy, "F:\\repo", 100, &[])];
    assign_with(CliKind::Agy, &mut snaps, &[], &history);
    assert_eq!(snaps[0].conversation.as_deref(), Some(A));
    let mut late = vec![snap(CliKind::Agy, "F:\\repo", 500, &[])];
    assign_with(CliKind::Agy, &mut late, &[], &history);
    assert_eq!(late[0].conversation, None);
}
