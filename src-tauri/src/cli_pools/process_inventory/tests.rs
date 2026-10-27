use super::*;
use crate::cli_pools::types::CliProvider;
use crate::system::cli_restore::snapshot::ProcRow;

fn make_proc(
    pid: u32,
    parent: Option<u32>,
    name: &str,
    exe: &str,
    args: &[&str],
    cwd: Option<&str>,
    started_at: u64,
) -> ProcRow {
    ProcRow {
        pid,
        parent,
        name: name.to_string(),
        exe: Some(exe.to_string()),
        args: args.iter().map(|s| s.to_string()).collect(),
        cwd: cwd.map(|s| s.to_string()),
        started_at,
        tmux_pane: None,
    }
}

#[test]
fn test_scan_single_agy_instance_dedupes_shim_and_binary() {
    let rows = vec![
        make_proc(
            10,
            None,
            "pwsh.exe",
            "C:\\pwsh.exe",
            &["pwsh"],
            Some("F:\\repo"),
            100,
        ),
        make_proc(
            11,
            Some(10),
            "cmd.exe",
            "C:\\cmd.exe",
            &["cmd", "/c", "agy.cmd"],
            Some("F:\\repo"),
            105,
        ),
        make_proc(
            12,
            Some(11),
            "agy.exe",
            "C:\\Users\\bin\\agy.exe",
            &["agy", "--conversation", "c-1"],
            Some("F:\\repo"),
            106,
        ),
    ];

    let instances = scan_cli_instances_from_rows(CliProvider::Agy, &rows, None);
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].identity.pid, 12);
    assert_eq!(instances[0].identity.started_at, 106);
    assert_eq!(instances[0].identity.executable, "C:\\Users\\bin\\agy.exe");
    assert_eq!(instances[0].identity.cwd.as_deref(), Some("F:\\repo"));
    assert!(instances[0].related_pids.contains(&11));
    assert!(instances[0].related_pids.contains(&12));
}

#[test]
fn test_scan_single_codex_instance() {
    let rows = vec![
        make_proc(
            20,
            None,
            "pwsh.exe",
            "C:\\pwsh.exe",
            &["pwsh"],
            Some("F:\\project"),
            200,
        ),
        make_proc(
            21,
            Some(20),
            "codex.exe",
            "C:\\bin\\codex.exe",
            &["codex", "resume", "conv-codex"],
            Some("F:\\project"),
            205,
        ),
    ];

    let instances = scan_cli_instances_from_rows(CliProvider::Codex, &rows, None);
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].identity.pid, 21);
    assert_eq!(instances[0].provider, CliProvider::Codex);
}

#[test]
fn test_two_instances_in_same_workspace() {
    let rows = vec![
        make_proc(
            30,
            None,
            "agy.exe",
            "C:\\bin\\agy.exe",
            &["agy"],
            Some("F:\\repo"),
            300,
        ),
        make_proc(
            31,
            None,
            "agy.exe",
            "C:\\bin\\agy.exe",
            &["agy"],
            Some("F:\\repo"),
            310,
        ),
    ];

    let instances = scan_cli_instances_from_rows(CliProvider::Agy, &rows, None);
    assert_eq!(instances.len(), 2);
    assert_eq!(count_eligible_instances(&instances, None), 2);
}

#[test]
fn test_unattributed_when_no_account_identifiable() {
    let rows = vec![make_proc(
        40,
        None,
        "agy.exe",
        "C:\\bin\\agy.exe",
        &["agy"],
        Some("F:\\repo"),
        400,
    )];

    let instances = scan_cli_instances_from_rows(CliProvider::Agy, &rows, None);
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].ownership, ProcessOwnership::Unattributed);
}

#[test]
fn test_attributed_when_active_auth_provided() {
    let rows = vec![make_proc(
        40,
        None,
        "agy.exe",
        "C:\\bin\\agy.exe",
        &["agy"],
        Some("F:\\repo"),
        400,
    )];

    let instances = scan_cli_instances_from_rows(CliProvider::Agy, &rows, Some("account-abc"));
    assert_eq!(instances.len(), 1);
    assert_eq!(
        instances[0].ownership,
        ProcessOwnership::Attributed("account-abc".to_string())
    );
}

#[test]
fn test_count_eligible_instances_filters_by_provider() {
    let instances = vec![
        CliInstance {
            identity: ProcessIdentity {
                pid: 1,
                started_at: 10,
                executable: "agy".into(),
                cwd: None,
            },
            provider: CliProvider::Agy,
            launch_executable: Some("agy".into()),
            related_pids: vec![1],
            args: vec![],
            ownership: ProcessOwnership::Unattributed,
        },
        CliInstance {
            identity: ProcessIdentity {
                pid: 2,
                started_at: 20,
                executable: "codex".into(),
                cwd: None,
            },
            provider: CliProvider::Codex,
            launch_executable: Some("codex".into()),
            related_pids: vec![2],
            args: vec![],
            ownership: ProcessOwnership::Unattributed,
        },
    ];

    assert_eq!(
        count_eligible_instances(&instances, Some(CliProvider::Agy)),
        1
    );
    assert_eq!(
        count_eligible_instances(&instances, Some(CliProvider::Codex)),
        1
    );
}

#[test]
fn test_fallback_gate_allows_strictly_one_instance() {
    assert!(is_single_eligible_instance(1));
    assert!(!is_single_eligible_instance(0));
    assert!(!is_single_eligible_instance(2));
    assert!(!is_single_eligible_instance(5));
}

#[test]
fn test_preflight_identity_matches_live_process() {
    let rows = vec![make_proc(
        50,
        None,
        "agy.exe",
        "C:\\bin\\agy.exe",
        &["agy"],
        Some("F:\\repo"),
        500,
    )];

    let target = ProcessIdentity {
        pid: 50,
        started_at: 500,
        executable: "agy.exe".to_string(),
        cwd: Some("F:\\repo".to_string()),
    };

    assert_eq!(
        preflight_target_identity(&target, &rows),
        PreflightResult::Matches
    );
}

#[test]
fn test_preflight_identity_detects_pid_reuse() {
    // PID 50 exists, but started_at is different (new process took PID 50)
    let rows = vec![make_proc(
        50,
        None,
        "notepad.exe",
        "C:\\notepad.exe",
        &["notepad"],
        None,
        999,
    )];

    let target = ProcessIdentity {
        pid: 50,
        started_at: 500,
        executable: "agy.exe".to_string(),
        cwd: Some("F:\\repo".to_string()),
    };

    assert_eq!(
        preflight_target_identity(&target, &rows),
        PreflightResult::PidReused
    );
}

#[test]
fn test_preflight_identity_detects_process_disappeared() {
    let rows = vec![make_proc(
        51,
        None,
        "pwsh.exe",
        "C:\\pwsh.exe",
        &["pwsh"],
        None,
        100,
    )];

    let target = ProcessIdentity {
        pid: 50,
        started_at: 500,
        executable: "agy.exe".to_string(),
        cwd: Some("F:\\repo".to_string()),
    };

    assert_eq!(
        preflight_target_identity(&target, &rows),
        PreflightResult::NotFound
    );
}

#[test]
fn test_ignores_unrelated_shell_or_ide() {
    let rows = vec![
        make_proc(
            60,
            None,
            "Code.exe",
            "C:\\VSCode\\Code.exe",
            &["code"],
            None,
            100,
        ),
        make_proc(
            61,
            None,
            "antigravity.exe",
            "C:\\IDE\\antigravity.exe",
            &["antigravity"],
            None,
            100,
        ),
        make_proc(
            62,
            None,
            "powershell.exe",
            "C:\\powershell.exe",
            &["powershell"],
            None,
            100,
        ),
    ];

    let instances = scan_cli_instances_from_rows(CliProvider::Agy, &rows, None);
    assert_eq!(instances.len(), 0);
}

#[test]
fn test_codex_shim_identity_is_separate_from_native_launch_executable() {
    let rows = vec![
        make_proc(
            5,
            None,
            "node.exe",
            "C:\\node.exe",
            &[
                "node",
                "C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js",
                "-m",
                "gpt",
            ],
            Some("F:\\repo"),
            100,
        ),
        make_proc(
            6,
            Some(5),
            "codex.exe",
            "C:\\vendor\\codex.exe",
            &["codex", "-m", "gpt"],
            Some("F:\\repo"),
            101,
        ),
    ];
    let instances = scan_cli_instances_from_rows(CliProvider::Codex, &rows, None);
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].identity.pid, 5);
    assert_eq!(instances[0].identity.executable, "C:\\node.exe");
    assert_eq!(
        instances[0].launch_executable.as_deref(),
        Some("C:\\vendor\\codex.exe")
    );
    assert_eq!(instances[0].args, ["-m", "gpt"]);
}
