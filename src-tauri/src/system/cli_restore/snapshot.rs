//! Which processes form one CLI instance, and which shell and terminal host it. Pure, apart
//! from `live_rows`.

use std::collections::HashMap;

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use super::{CliKind, CliSnapshot, HostKind, HostProcess};

#[derive(Debug, Clone, Default)]
pub struct ProcRow {
    pub pid: u32,
    pub parent: Option<u32>,
    pub name: String,
    pub exe: Option<String>,
    /// Full argv, program first.
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub started_at: u64,
    pub tmux_pane: Option<String>,
}

/// Splits by hand: `Path::file_name` ignores `\` when not on Windows.
pub fn basename(path: &str) -> String {
    let name = path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    name.strip_suffix(".exe")
        .map(str::to_string)
        .unwrap_or(name)
}

pub fn is_agy_executable(path: &str) -> bool {
    matches!(basename(path).as_str(), "agy" | "antigravity-cli")
}

fn shell_kind(base: &str) -> Option<HostKind> {
    match base {
        "pwsh" | "powershell" => Some(HostKind::PowerShell),
        "cmd" => Some(HostKind::Cmd),
        "bash" | "zsh" | "fish" | "nu" | "sh" => Some(HostKind::Posix),
        _ => None,
    }
}

/// `cmd /c ...` and `sh -c ...` run one command and exit: npm shims, not shells to type into.
fn has_run_once_flag(base: &str, args: &[String]) -> bool {
    let flag = match base {
        "cmd" => "/c",
        "sh" | "bash" => "-c",
        _ => return false,
    };
    args.iter().skip(1).any(|a| a.eq_ignore_ascii_case(flag))
}

/// A shell the user types into. `cmd /c codex.cmd` is an npm shim, not one.
pub fn is_user_shell(name: &str, cmdline: &str) -> bool {
    let base = basename(name);
    let args: Vec<String> = cmdline.split_whitespace().map(str::to_string).collect();
    shell_kind(&base).is_some() && !has_run_once_flag(&base, &args)
}

fn row_base(row: &ProcRow) -> String {
    basename(row.exe.as_deref().unwrap_or(&row.name))
}

fn is_cli(kind: CliKind, row: &ProcRow) -> bool {
    if shell_kind(&row_base(row)).is_some() {
        return false;
    }
    match kind {
        CliKind::Codex => {
            crate::codex::process::is_codex_cli_process(&row.name, &row.args.join(" "))
        }
        CliKind::Agy => is_agy_executable(row.exe.as_deref().unwrap_or(&row.name)),
    }
}

fn host(row: &ProcRow, kind: HostKind) -> HostProcess {
    HostProcess {
        pid: row.pid,
        exe: row.exe.clone().unwrap_or_else(|| row.name.clone()),
        started_at: row.started_at,
        kind,
    }
}

/// Console plumbing between a shell and its terminal window.
const SKIPPED: [&str; 2] = ["conhost", "openconsole"];
/// Reaching one of these means no terminal app was found above the CLI.
const STOPS: [&str; 6] = [
    "explorer", "services", "svchost", "systemd", "launchd", "init",
];

struct Hosts {
    shell: Option<HostProcess>,
    terminal: Option<HostProcess>,
    shim_pids: Vec<u32>,
}

fn classify_hosts(by_pid: &HashMap<u32, &ProcRow>, root: &ProcRow) -> Hosts {
    let mut hosts = Hosts {
        shell: None,
        terminal: None,
        shim_pids: Vec::new(),
    };
    let mut current = root.parent;
    for _ in 0..32 {
        let Some(row) = current.and_then(|pid| by_pid.get(&pid)) else {
            break;
        };
        let base = row_base(row);
        if STOPS.contains(&base.as_str()) {
            break;
        }
        current = row.parent;
        if let Some(kind) = shell_kind(&base) {
            if hosts.shell.is_none() {
                if has_run_once_flag(&base, &row.args) {
                    hosts.shim_pids.push(row.pid);
                } else {
                    hosts.shell = Some(host(row, kind));
                }
            }
            continue;
        }
        if SKIPPED.contains(&base.as_str()) {
            continue;
        }
        let kind = match base.as_str() {
            "windowsterminal" => HostKind::WindowsTerminal,
            "tmux" => HostKind::Tmux,
            _ => HostKind::Other,
        };
        hosts.terminal = Some(host(row, kind));
        break;
    }
    hosts
}

/// One snapshot per running instance of `kind`, oldest first. `conversation` is filled later.
pub fn build_snapshots(kind: CliKind, rows: &[ProcRow]) -> Vec<CliSnapshot> {
    let by_pid: HashMap<u32, &ProcRow> = rows.iter().map(|r| (r.pid, r)).collect();
    let mut snapshots = Vec::new();
    for root in rows.iter().filter(|r| is_cli(kind, r)) {
        let parent_is_cli = root
            .parent
            .and_then(|pid| by_pid.get(&pid))
            .is_some_and(|parent| is_cli(kind, parent));
        if parent_is_cli {
            continue;
        }
        let mut pids = vec![root.pid];
        let mut index = 0;
        while index < pids.len() {
            let current = pids[index];
            for child in rows
                .iter()
                .filter(|r| r.parent == Some(current) && is_cli(kind, r))
            {
                if !pids.contains(&child.pid) {
                    pids.push(child.pid);
                }
            }
            index += 1;
        }
        // The deepest process is the native binary: its argv and cwd are the real ones.
        let main = pids
            .last()
            .and_then(|pid| by_pid.get(pid))
            .copied()
            .unwrap_or(root);
        let hosts = classify_hosts(&by_pid, root);
        pids.extend(&hosts.shim_pids);
        snapshots.push(CliSnapshot {
            kind,
            pid: root.pid,
            pids,
            cwd: main.cwd.clone().filter(|dir| !dir.trim().is_empty()),
            started_at: root.started_at,
            args: main.args.iter().skip(1).cloned().collect(),
            conversation: None,
            shell: hosts.shell,
            terminal: hosts.terminal,
            tmux_pane: main.tmux_pane.clone().or_else(|| root.tmux_pane.clone()),
        });
    }
    snapshots.sort_by_key(|s| (s.started_at, s.pid));
    snapshots
}

pub fn live_rows() -> Vec<ProcRow> {
    let refresh = ProcessRefreshKind::new()
        .with_cmd(UpdateKind::Always)
        .with_exe(UpdateKind::Always)
        .with_cwd(UpdateKind::Always);
    #[cfg(unix)]
    let refresh = refresh.with_environ(UpdateKind::Always);
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, refresh);
    sys.processes()
        .iter()
        .map(|(pid, p)| ProcRow {
            pid: pid.as_u32(),
            parent: p.parent().map(|parent| parent.as_u32()),
            name: p.name().to_string_lossy().to_string(),
            exe: p.exe().map(|e| e.to_string_lossy().to_string()),
            args: p
                .cmd()
                .iter()
                .map(|a| a.to_string_lossy().to_string())
                .collect(),
            cwd: p.cwd().map(|c| c.to_string_lossy().to_string()),
            started_at: p.start_time(),
            tmux_pane: p.environ().iter().find_map(|v| {
                v.to_string_lossy()
                    .strip_prefix("TMUX_PANE=")
                    .map(str::to_string)
            }),
        })
        .collect()
}
