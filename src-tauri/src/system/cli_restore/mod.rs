//! Resumes the Codex and agy CLIs that were stopped for an account switch: same terminal tab,
//! folder, conversation and flags. The process tree is read before the kill; the resume
//! command is typed back into the surviving shell, or run in a new tab or window.

use std::sync::Mutex;

use serde::Serialize;

mod command;
#[cfg(test)]
mod command_tests;
mod conversation;
#[cfg(test)]
mod conversation_tests;
#[cfg(target_os = "windows")]
mod inject_windows;
mod outcome;
#[cfg(test)]
mod outcome_tests;
mod respawn;
mod restore;
pub(crate) mod snapshot;
#[cfg(test)]
mod snapshot_tests;

pub use outcome::summarize;
pub use restore::restore;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CliKind {
    Codex,
    Agy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostKind {
    PowerShell,
    Cmd,
    Posix,
    WindowsTerminal,
    Tmux,
    Other,
}

/// A process that hosts the CLI: the user's shell or the terminal app around it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostProcess {
    pub pid: u32,
    pub exe: String,
    /// Start time, with the exe name, tells a live host from a reused pid.
    pub started_at: u64,
    pub kind: HostKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliSnapshot {
    pub kind: CliKind,
    pub pid: u32,
    /// Every pid that must be gone before restoring: the instance plus npm shim shells.
    pub pids: Vec<u32>,
    pub cwd: Option<String>,
    pub started_at: u64,
    /// Original argv after the program name.
    pub args: Vec<String>,
    pub conversation: Option<String>,
    pub shell: Option<HostProcess>,
    pub terminal: Option<HostProcess>,
    pub tmux_pane: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RestoreMethod {
    InPlace,
    NewTab,
    NewWindow,
    NotRestored,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConversationMatch {
    Exact,
    Latest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub kind: CliKind,
    pub folder: Option<String>,
    pub method: RestoreMethod,
    pub conversation: ConversationMatch,
    /// The resume line that was typed or launched, or that the user should run.
    pub command: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub outcomes: Vec<RestoreOutcome>,
    pub summary: String,
}

static PENDING: Mutex<Vec<CliSnapshot>> = Mutex::new(Vec::new());

/// Keeps snapshots taken before a kill until the caller asks to restore them.
pub fn stash(snapshots: Vec<CliSnapshot>) {
    if let Ok(mut slot) = PENDING.lock() {
        *slot = snapshots;
    }
}

pub fn take_pending() -> Vec<CliSnapshot> {
    PENDING
        .lock()
        .map(|mut slot| std::mem::take(&mut *slot))
        .unwrap_or_default()
}

/// Every running instance of `kind`, read before anything is stopped.
pub fn capture(kind: CliKind) -> Vec<CliSnapshot> {
    let rows = snapshot::live_rows();
    let mut snapshots = snapshot::build_snapshots(kind, &rows);
    conversation::assign(kind, &mut snapshots);
    snapshots
}
