use serde::{Deserialize, Serialize};

use super::types::CliProvider;
use crate::system::cli_restore::snapshot::{basename, build_snapshots, live_rows, ProcRow};
use crate::system::cli_restore::CliKind;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessOwnership {
    Attributed(String),
    Unattributed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessIdentity {
    pub pid: u32,
    pub started_at: u64,
    pub executable: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInstance {
    pub identity: ProcessIdentity,
    /// Native CLI path; the identity executable can instead be an npm shim's interpreter.
    pub launch_executable: Option<String>,
    pub provider: CliProvider,
    pub related_pids: Vec<u32>,
    pub args: Vec<String>,
    pub ownership: ProcessOwnership,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PreflightResult {
    Matches,
    PidReused,
    NotFound,
}

pub fn provider_to_cli_kind(provider: CliProvider) -> CliKind {
    match provider {
        CliProvider::Agy => CliKind::Agy,
        CliProvider::Codex => CliKind::Codex,
    }
}

pub fn scan_cli_instances_from_rows(
    provider: CliProvider,
    rows: &[ProcRow],
    current_auth_domain: Option<&str>,
) -> Vec<CliInstance> {
    let kind = provider_to_cli_kind(provider);
    let snapshots = build_snapshots(kind, rows);

    snapshots
        .into_iter()
        .filter_map(|snap| {
            let row = rows.iter().find(|row| row.pid == snap.pid)?;
            let exe = row.exe.clone()?;
            let launch_executable = snap
                .pids
                .iter()
                .filter_map(|pid| rows.iter().find(|row| row.pid == *pid))
                .filter_map(|row| row.exe.as_ref())
                .filter(|exe| match provider {
                    CliProvider::Agy => matches!(basename(exe).as_str(), "agy" | "antigravity-cli"),
                    CliProvider::Codex => basename(exe) == "codex",
                })
                .last()
                .cloned();

            let ownership = match current_auth_domain {
                Some(domain) if !domain.trim().is_empty() => {
                    ProcessOwnership::Attributed(domain.trim().to_string())
                }
                _ => ProcessOwnership::Unattributed,
            };

            Some(CliInstance {
                identity: ProcessIdentity {
                    pid: snap.pid,
                    started_at: snap.started_at,
                    executable: exe,
                    cwd: snap.cwd,
                },
                provider,
                launch_executable,
                related_pids: snap.pids,
                args: snap.args,
                ownership,
            })
        })
        .collect()
}

pub fn scan_cli_instances(
    provider: CliProvider,
    current_auth_domain: Option<&str>,
) -> Vec<CliInstance> {
    let rows = live_rows();
    scan_cli_instances_from_rows(provider, &rows, current_auth_domain)
}

pub fn count_eligible_instances(instances: &[CliInstance], provider: Option<CliProvider>) -> usize {
    instances
        .iter()
        .filter(|inst| provider.map(|p| inst.provider == p).unwrap_or(true))
        .count()
}

pub fn is_single_eligible_instance(eligible_count: usize) -> bool {
    eligible_count == 1
}

pub fn preflight_target_identity(
    target: &ProcessIdentity,
    live_rows: &[ProcRow],
) -> PreflightResult {
    match live_rows.iter().find(|r| r.pid == target.pid) {
        None => PreflightResult::NotFound,
        Some(live) => {
            if live.started_at != target.started_at {
                return PreflightResult::PidReused;
            }
            let live_exe = live.exe.as_deref().unwrap_or(&live.name);
            let live_base = basename(live_exe);
            let target_base = basename(&target.executable);
            if !target_base.is_empty()
                && !live_base.is_empty()
                && live_base != target_base
                && live.started_at == target.started_at
            {
                return PreflightResult::PidReused;
            }
            PreflightResult::Matches
        }
    }
}

#[cfg(test)]
mod tests;
