//! Fallback when the original shell is gone: a new tab where the terminal supports it, else a
//! new console window running the same shell.

use super::{CliSnapshot, HostKind, RestoreMethod};

fn folder(snap: &CliSnapshot) -> Option<String> {
    snap.cwd
        .clone()
        .filter(|dir| std::path::Path::new(dir).is_dir())
        .or_else(|| {
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .ok()
        })
}

#[cfg(target_os = "windows")]
fn keep_open_args(kind: HostKind, line: &str) -> Vec<String> {
    match kind {
        HostKind::Cmd => vec!["/K".into(), line.into()],
        HostKind::Posix => vec!["-c".into(), format!("{line}; exec bash")],
        _ => vec!["-NoExit".into(), "-Command".into(), line.into()],
    }
}

#[cfg(target_os = "windows")]
pub fn respawn(snap: &CliSnapshot, line: &str) -> Result<RestoreMethod, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    let (shell_exe, shell_kind) = snap
        .shell
        .as_ref()
        .map(|s| (s.exe.clone(), s.kind))
        .unwrap_or_else(|| ("powershell.exe".to_string(), HostKind::PowerShell));
    let dir = folder(snap);
    if snap
        .terminal
        .as_ref()
        .is_some_and(|t| t.kind == HostKind::WindowsTerminal)
    {
        let mut wt = std::process::Command::new("wt");
        wt.args(["-w", "0", "nt"]);
        if let Some(dir) = &dir {
            wt.args(["-d", dir]);
        }
        // wt splits on `;` unless escaped.
        wt.arg(&shell_exe)
            .args(keep_open_args(shell_kind, &line.replace(';', "\\;")));
        let mut wt = crate::run_cmd(wt);
        if wt.spawn().is_ok() {
            return Ok(RestoreMethod::NewTab);
        }
    }
    let mut command = std::process::Command::new(&shell_exe);
    command
        .args(keep_open_args(shell_kind, line))
        .creation_flags(CREATE_NEW_CONSOLE);
    if let Some(dir) = &dir {
        command.current_dir(dir);
    }
    command
        .spawn()
        .map(|_| RestoreMethod::NewWindow)
        .map_err(|e| format!("could not open a new terminal: {e}"))
}

#[cfg(unix)]
pub fn respawn(snap: &CliSnapshot, line: &str) -> Result<RestoreMethod, String> {
    let in_tmux = snap.tmux_pane.is_some()
        || snap
            .terminal
            .as_ref()
            .is_some_and(|t| t.kind == HostKind::Tmux);
    if !in_tmux {
        return Err("no terminal to reopen in".to_string());
    }
    let mut tmux = std::process::Command::new("tmux");
    tmux.arg("new-window");
    if let Some(dir) = folder(snap) {
        tmux.args(["-c", &dir]);
    }
    let status = tmux
        .arg(format!("{line}; exec \"${{SHELL:-sh}}\""))
        .status()
        .map_err(|e| format!("could not open a tmux window: {e}"))?;
    if status.success() {
        Ok(RestoreMethod::NewTab)
    } else {
        Err("could not open a tmux window".to_string())
    }
}

#[cfg(not(any(target_os = "windows", unix)))]
pub fn respawn(_snap: &CliSnapshot, _line: &str) -> Result<RestoreMethod, String> {
    Err("not supported on this platform".to_string())
}
