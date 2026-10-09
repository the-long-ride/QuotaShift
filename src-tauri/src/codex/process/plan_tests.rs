use super::*;

fn row(pid: u32, name: &str, cmd: &str, exe: Option<&str>) -> ProcessRow {
    (pid, name.into(), cmd.into(), exe.map(str::to_string))
}

#[test]
fn never_stops_the_users_shell() {
    let rows = vec![
        row(
            10,
            "pwsh.exe",
            "pwsh -NoExit -Command codex resume --last",
            None,
        ),
        row(11, "codex.exe", "codex.exe resume --last", None),
    ];
    let (_, pids) = plan_kill(&rows, 1);
    assert_eq!(pids, vec![11]);
}

#[test]
fn nothing_running_plans_no_kill_and_no_relaunch() {
    let rows = vec![
        row(10, "chrome.exe", "chrome.exe https://chatgpt.com", None),
        row(11, "explorer.exe", "explorer.exe", None),
    ];
    let (result, pids) = plan_kill(&rows, 1);
    assert!(pids.is_empty());
    assert_eq!(result, CodexProcessKillResult::default());
}

#[test]
fn running_desktop_is_flagged_before_anything_is_killed() {
    let rows = vec![
        row(
            20,
            "ChatGPT.exe",
            "ChatGPT.exe",
            Some("C:\\Apps\\ChatGPT\\ChatGPT.exe"),
        ),
        row(21, "codex.exe", "codex.exe app-server", None),
        row(22, "quotashift.exe", "quotashift.exe", None),
    ];
    let (result, pids) = plan_kill(&rows, 1);
    assert_eq!(pids, vec![20, 21]);
    assert!(result.desktop_killed);
    assert!(result.cli_killed);
    assert!(!result.ide_extension_killed);
    assert_eq!(result.total_killed, 2);
    assert_eq!(
        result.desktop_executable.as_deref(),
        Some("C:\\Apps\\ChatGPT\\ChatGPT.exe")
    );
}

#[test]
fn only_cli_running_leaves_desktop_unflagged() {
    let rows = vec![row(30, "codex.exe", "codex.exe resume", None)];
    let (result, pids) = plan_kill(&rows, 1);
    assert_eq!(pids, vec![30]);
    assert!(result.cli_killed);
    assert!(!result.desktop_killed);
    assert_eq!(result.desktop_executable, None);
}
