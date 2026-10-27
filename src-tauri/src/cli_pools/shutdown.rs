use serde::{Deserialize, Serialize};
use std::process::Command;
use std::thread::sleep;
use std::time::{Duration, Instant};

use super::process_inventory::{preflight_target_identity, PreflightResult, ProcessIdentity};
use crate::system::cli_restore::snapshot::{live_rows, ProcRow};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StopOutcome {
    AlreadyExited,
    Terminated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StopError {
    PidReused,
    TimedOutAwaitingExit,
    FailedToTerminate(String),
}

pub fn stop_target_cli_instance_with_rows(
    target: &ProcessIdentity,
    _grace_budget_secs: u64,
    allow_force: bool,
    rows: &[ProcRow],
) -> Result<StopOutcome, StopError> {
    match preflight_target_identity(target, rows) {
        PreflightResult::NotFound => Ok(StopOutcome::AlreadyExited),
        PreflightResult::PidReused => Err(StopError::PidReused),
        PreflightResult::Matches => {
            if !allow_force {
                Err(StopError::TimedOutAwaitingExit)
            } else {
                terminate_pid_strictly(target.pid)?;
                Ok(StopOutcome::Terminated)
            }
        }
    }
}

pub fn stop_target_cli_instance(
    target: &ProcessIdentity,
    grace_budget_secs: u64,
    allow_force: bool,
) -> Result<StopOutcome, StopError> {
    let start = Instant::now();
    let budget = Duration::from_secs(grace_budget_secs);

    loop {
        let rows = live_rows();
        match preflight_target_identity(target, &rows) {
            PreflightResult::NotFound => return Ok(StopOutcome::AlreadyExited),
            PreflightResult::PidReused => return Err(StopError::PidReused),
            PreflightResult::Matches => {
                if start.elapsed() >= budget {
                    if !allow_force {
                        return Err(StopError::TimedOutAwaitingExit);
                    }
                    terminate_pid_strictly(target.pid)?;
                    return wait_for_exit(target, Duration::from_secs(5));
                }
                sleep(Duration::from_millis(250));
            }
        }
    }
}

fn wait_for_exit(target: &ProcessIdentity, timeout: Duration) -> Result<StopOutcome, StopError> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        let rows = live_rows();
        match preflight_target_identity(target, &rows) {
            PreflightResult::NotFound => return Ok(StopOutcome::Terminated),
            PreflightResult::PidReused => return Err(StopError::PidReused),
            PreflightResult::Matches => sleep(Duration::from_millis(150)),
        }
    }
    Err(StopError::FailedToTerminate(format!(
        "Process PID {} still alive after termination command",
        target.pid
    )))
}

fn terminate_pid_strictly(pid: u32) -> Result<(), StopError> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| StopError::FailedToTerminate(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // If already exited between check and taskkill, that's fine
            if !stderr.contains("not found") && !stderr.contains("not running") {
                return Err(StopError::FailedToTerminate(stderr.trim().to_string()));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| StopError::FailedToTerminate(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.contains("No such process") {
                return Err(StopError::FailedToTerminate(stderr.trim().to_string()));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests;
