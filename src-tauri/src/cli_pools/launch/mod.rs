use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

use super::command::CommandSpec;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchedPid {
    pub pid: u32,
    pub started_at: u64,
    pub terminal: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchVerificationStage {
    ProcessStarted,
    AuthVerified,
    ConversationVerified,
    Complete,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchError {
    InvalidCwd(String),
    SpawnFailed(String),
    VerificationFailed(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedLaunch {
    pub executable: String,
    pub argv: Vec<String>,
    pub cwd: String,
    pub terminal: String,
}

pub fn prepare_launch_command(
    spec: &CommandSpec,
    terminal_pref: &str,
) -> Result<PreparedLaunch, LaunchError> {
    if !Path::new(&spec.cwd).is_dir() {
        return Err(LaunchError::InvalidCwd(spec.cwd.clone()));
    }

    Ok(PreparedLaunch {
        executable: spec.executable.clone(),
        argv: spec.argv.clone(),
        cwd: spec.cwd.clone(),
        terminal: terminal_pref.to_string(),
    })
}

pub fn launch_resumed_cli(
    spec: &CommandSpec,
    terminal_pref: &str,
) -> Result<LaunchedPid, LaunchError> {
    let prepared = prepare_launch_command(spec, terminal_pref)?;
    let mut cmd = Command::new(&prepared.executable);
    cmd.args(&prepared.argv).current_dir(&prepared.cwd);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

        cmd.creation_flags(CREATE_NEW_CONSOLE);
    }

    let child = cmd
        .spawn()
        .map_err(|e| LaunchError::SpawnFailed(e.to_string()))?;
    Ok(LaunchedPid {
        pid: child.id(),
        started_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        terminal: prepared.terminal,
    })
}

#[cfg(test)]
mod tests;
