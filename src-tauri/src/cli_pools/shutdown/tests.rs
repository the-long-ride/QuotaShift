use super::*;
use crate::system::cli_restore::snapshot::ProcRow;

#[test]
fn test_stop_returns_already_exited_when_process_is_not_running() {
    let target = ProcessIdentity {
        pid: 999999, // Highly unlikely to exist
        started_at: 100,
        executable: "agy.exe".to_string(),
        cwd: Some("F:\\repo".to_string()),
    };

    let rows: Vec<ProcRow> = Vec::new();
    let outcome = stop_target_cli_instance_with_rows(&target, 0, false, &rows);
    assert_eq!(outcome, Ok(StopOutcome::AlreadyExited));
}

#[test]
fn test_stop_fails_if_pid_was_reused() {
    let target = ProcessIdentity {
        pid: 1234,
        started_at: 100,
        executable: "agy.exe".to_string(),
        cwd: Some("F:\\repo".to_string()),
    };

    let rows = vec![ProcRow {
        pid: 1234,
        parent: None,
        name: "notepad.exe".to_string(),
        exe: Some("C:\\notepad.exe".to_string()),
        args: vec!["notepad".to_string()],
        cwd: None,
        started_at: 200, // Reused PID with different started_at
        tmux_pane: None,
    }];

    let outcome = stop_target_cli_instance_with_rows(&target, 0, false, &rows);
    assert_eq!(outcome, Err(StopError::PidReused));
}

#[test]
fn test_stop_times_out_when_force_not_allowed_and_process_alive() {
    let target = ProcessIdentity {
        pid: 1234,
        started_at: 100,
        executable: "agy.exe".to_string(),
        cwd: Some("F:\\repo".to_string()),
    };

    let rows = vec![ProcRow {
        pid: 1234,
        parent: None,
        name: "agy.exe".to_string(),
        exe: Some("C:\\bin\\agy.exe".to_string()),
        args: vec!["agy".to_string()],
        cwd: Some("F:\\repo".to_string()),
        started_at: 100,
        tmux_pane: None,
    }];

    let outcome = stop_target_cli_instance_with_rows(&target, 0, false, &rows);
    assert_eq!(outcome, Err(StopError::TimedOutAwaitingExit));
}
