use super::snapshot::{basename, build_snapshots, is_agy_executable, is_user_shell, ProcRow};
use super::{CliKind, HostKind};

fn row(pid: u32, parent: u32, name: &str, args: &[&str]) -> ProcRow {
    ProcRow {
        pid,
        parent: Some(parent),
        name: name.into(),
        exe: Some(format!("C:\\bin\\{name}")),
        args: args.iter().map(|a| a.to_string()).collect(),
        cwd: Some("F:\\repo".into()),
        started_at: pid as u64 * 10,
        tmux_pane: None,
    }
}

#[test]
fn basename_handles_both_separators() {
    assert_eq!(
        basename("C:\\Program Files\\PowerShell\\7\\pwsh.exe"),
        "pwsh"
    );
    assert_eq!(basename("/usr/bin/tmux"), "tmux");
    assert_eq!(basename("WindowsTerminal.exe"), "windowsterminal");
}

#[test]
fn recognises_agy_executables() {
    assert!(is_agy_executable(
        "C:\\Users\\me\\AppData\\Local\\agy\\bin\\agy.exe"
    ));
    assert!(is_agy_executable("/usr/local/bin/agy"));
    assert!(is_agy_executable("C:\\tools\\Antigravity-CLI.exe"));
    assert!(!is_agy_executable("C:\\Windows\\System32\\ping.exe"));
}

#[test]
fn user_shells_are_not_cli_processes() {
    assert!(is_user_shell(
        "pwsh.exe",
        "pwsh -NoExit -Command codex resume"
    ));
    assert!(is_user_shell("cmd.exe", "cmd /K codex resume"));
    assert!(!is_user_shell("cmd.exe", "cmd /c codex.cmd"));
    assert!(!is_user_shell("node.exe", "node codex.js"));
}

#[test]
fn codex_shim_chain_is_one_instance_hosted_by_pwsh_in_windows_terminal() {
    let rows = vec![
        row(1, 0, "WindowsTerminal.exe", &["wt"]),
        row(2, 1, "OpenConsole.exe", &["OpenConsole"]),
        row(3, 2, "pwsh.exe", &["pwsh"]),
        row(
            4,
            3,
            "cmd.exe",
            &["cmd", "/c", "C:\\npm\\codex.cmd", "-m", "gpt"],
        ),
        row(
            5,
            4,
            "node.exe",
            &[
                "node",
                "C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js",
                "-m",
                "gpt",
            ],
        ),
        row(
            6,
            5,
            "codex.exe",
            &[
                "C:\\npm\\node_modules\\@openai\\codex\\vendor\\codex.exe",
                "-m",
                "gpt",
            ],
        ),
    ];
    let snaps = build_snapshots(CliKind::Codex, &rows);
    assert_eq!(snaps.len(), 1);
    let s = &snaps[0];
    assert_eq!(s.pid, 5);
    assert_eq!(s.args, vec!["-m".to_string(), "gpt".to_string()]);
    assert!(s.pids.contains(&5) && s.pids.contains(&6) && s.pids.contains(&4));
    assert_eq!(
        s.shell.as_ref().map(|h| (h.pid, h.kind)),
        Some((3, HostKind::PowerShell))
    );
    assert_eq!(
        s.terminal.as_ref().map(|h| (h.pid, h.kind)),
        Some((1, HostKind::WindowsTerminal))
    );
}

#[test]
fn cli_launched_directly_by_a_terminal_has_no_shell() {
    let rows = vec![
        row(1, 0, "Orca.exe", &["Orca"]),
        row(2, 1, "agy.exe", &["agy", "--model", "x"]),
    ];
    let snaps = build_snapshots(CliKind::Agy, &rows);
    assert_eq!(snaps.len(), 1);
    assert!(snaps[0].shell.is_none());
    assert_eq!(
        snaps[0].terminal.as_ref().map(|h| h.kind),
        Some(HostKind::Other)
    );
}

#[test]
fn explorer_stops_the_walk_and_instances_sort_oldest_first() {
    let rows = vec![
        row(1, 0, "explorer.exe", &["explorer"]),
        row(2, 1, "cmd.exe", &["cmd"]),
        row(9, 2, "agy.exe", &["agy"]),
        row(3, 2, "agy.exe", &["agy"]),
    ];
    let snaps = build_snapshots(CliKind::Agy, &rows);
    assert_eq!(snaps.iter().map(|s| s.pid).collect::<Vec<_>>(), vec![3, 9]);
    assert_eq!(snaps[0].shell.as_ref().map(|h| h.kind), Some(HostKind::Cmd));
    assert!(snaps[0].terminal.is_none());
}

#[test]
fn a_nested_shell_does_not_replace_the_nearest_one() {
    let rows = vec![
        row(1, 0, "WindowsTerminal.exe", &["wt"]),
        row(2, 1, "pwsh.exe", &["pwsh"]),
        row(3, 2, "cmd.exe", &["cmd"]),
        row(4, 3, "agy.exe", &["agy"]),
    ];
    let snaps = build_snapshots(CliKind::Agy, &rows);
    assert_eq!(snaps[0].shell.as_ref().map(|h| h.pid), Some(3));
    assert_eq!(snaps[0].terminal.as_ref().map(|h| h.pid), Some(1));
}
