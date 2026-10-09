//! After the kill: wait for the old processes, then resume each CLI in place or respawn it.

use std::time::Duration;

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use super::command::{kept_flags, quote_style, render_line, resume_argv};
use super::snapshot::basename;
use super::{respawn, CliSnapshot, ConversationMatch, HostProcess, RestoreMethod, RestoreOutcome};

async fn wait_gone(pids: &[u32]) {
    let targets: Vec<Pid> = pids.iter().map(|pid| Pid::from_u32(*pid)).collect();
    for _ in 0..20 {
        let mut sys = System::new();
        sys.refresh_processes_specifics(
            ProcessesToUpdate::Some(&targets),
            ProcessRefreshKind::new(),
        );
        if targets.iter().all(|pid| sys.process(*pid).is_none()) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// Same pid, same exe, same start time: guards against pid reuse.
fn host_alive(host: &HostProcess) -> bool {
    let pid = Pid::from_u32(host.pid);
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        ProcessRefreshKind::new().with_exe(UpdateKind::Always),
    );
    sys.process(pid).is_some_and(|p| {
        let exe = p
            .exe()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_else(|| p.name().to_string_lossy().to_string());
        p.start_time() == host.started_at && basename(&exe) == basename(&host.exe)
    })
}

#[cfg(target_os = "windows")]
fn type_into(_snap: &CliSnapshot, shell: &HostProcess, line: &str) -> Result<(), String> {
    super::inject_windows::type_line(shell.pid, line)
}

#[cfg(unix)]
fn type_into(snap: &CliSnapshot, _shell: &HostProcess, line: &str) -> Result<(), String> {
    let pane = snap
        .tmux_pane
        .as_deref()
        .filter(|pane| super::command::valid_tmux_pane(pane))
        .ok_or_else(|| "no tmux pane to type into".to_string())?;
    for args in [
        vec!["send-keys", "-t", pane, "-l", line],
        vec!["send-keys", "-t", pane, "Enter"],
    ] {
        let ok = std::process::Command::new("tmux")
            .args(&args)
            .status()
            .is_ok_and(|s| s.success());
        if !ok {
            return Err("tmux send-keys failed".to_string());
        }
    }
    Ok(())
}

#[cfg(not(any(target_os = "windows", unix)))]
fn type_into(_: &CliSnapshot, _: &HostProcess, _: &str) -> Result<(), String> {
    Err("not supported on this platform".to_string())
}

fn restore_one(snap: &CliSnapshot) -> RestoreOutcome {
    let flags = kept_flags(snap.kind, &snap.args);
    let argv = resume_argv(snap.kind, snap.conversation.as_deref(), &flags);
    let line = render_line(quote_style(snap.shell.as_ref()), &argv);
    let mut outcome = RestoreOutcome {
        kind: snap.kind,
        folder: snap.cwd.clone(),
        method: RestoreMethod::NotRestored,
        conversation: if snap.conversation.is_some() {
            ConversationMatch::Exact
        } else {
            ConversationMatch::Latest
        },
        command: line.clone(),
        error: None,
    };
    if let Some(shell) = snap.shell.as_ref().filter(|shell| host_alive(shell)) {
        match type_into(snap, shell, &line) {
            Ok(()) => {
                outcome.method = RestoreMethod::InPlace;
                return outcome;
            }
            Err(error) => outcome.error = Some(error),
        }
    }
    match respawn::respawn(snap, &line) {
        Ok(method) => {
            outcome.method = method;
            outcome.error = None;
        }
        Err(error) => {
            outcome.error.get_or_insert(error);
        }
    }
    outcome
}

pub async fn restore(snapshots: Vec<CliSnapshot>) -> Vec<RestoreOutcome> {
    let mut outcomes = Vec::with_capacity(snapshots.len());
    for snap in &snapshots {
        wait_gone(&snap.pids).await;
        outcomes.push(restore_one(snap));
    }
    outcomes
}
