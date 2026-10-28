use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use super::command::{build_resume_command, CommandSpec};
use super::conversation::{
    resolve_conversation, ConversationHistoryItem, ConversationResolution, ResolutionOrigin,
};
use super::process_inventory::CliInstance;
use super::types::{CliProvider, CliRotationPoolV1};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ControllerError {
    DisabledByGlobalSetting,
    DisabledByPoolSetting,
    NoEligibleCandidateAccount,
    AmbiguousMultipleProcesses,
    NoTargetProcessFound,
    ConversationUnresolved,
    MissingWorkingDirectory,
    MissingLaunchExecutable,
    AuthDomainConflict(String),
    CommandBuildFailed(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationPlan {
    pub operation_id: String,
    pub pool_id: String,
    pub provider: CliProvider,
    pub original_account_id: String,
    pub candidate_account_id: String,
    pub target_pid: u32,
    pub target_started_at: u64,
    pub cwd: String,
    pub conversation_resolution: ConversationResolution,
    pub command_spec: CommandSpec,
}

pub fn select_next_candidate_account(
    pool: &CliRotationPoolV1,
    current_account_id: &str,
    exhausted_account_ids: &HashSet<String>,
) -> Option<String> {
    if pool.account_ids.is_empty() {
        return None;
    }

    let current_index = pool
        .account_ids
        .iter()
        .position(|id| id == current_account_id)?;

    let count = pool.account_ids.len();
    for offset in 1..=count {
        let index = (current_index + offset) % count;
        let candidate = &pool.account_ids[index];
        if candidate != current_account_id && !exhausted_account_ids.contains(candidate) {
            return Some(candidate.clone());
        }
    }

    None
}

pub fn is_pool_eligible_for_auto_switch(pool: &CliRotationPoolV1, global_enabled: bool) -> bool {
    global_enabled && pool.enabled && pool.auto_switch && pool.account_ids.len() >= 2
}

pub fn plan_rotation(
    pool: &CliRotationPoolV1,
    global_enabled: bool,
    current_account_id: &str,
    exhausted_account_ids: &HashSet<String>,
    live_instances: &[CliInstance],
    history: &[ConversationHistoryItem],
    continuation_prompt: &str,
    now: u64,
) -> Result<RotationPlan, ControllerError> {
    if !global_enabled {
        return Err(ControllerError::DisabledByGlobalSetting);
    }
    if !pool.enabled || !pool.auto_switch {
        return Err(ControllerError::DisabledByPoolSetting);
    }

    let candidate_id =
        select_next_candidate_account(pool, current_account_id, exhausted_account_ids)
            .ok_or(ControllerError::NoEligibleCandidateAccount)?;

    let mut provider_instances = live_instances
        .iter()
        .filter(|inst| inst.provider == pool.provider);
    let target = provider_instances
        .next()
        .ok_or(ControllerError::NoTargetProcessFound)?;
    if provider_instances.next().is_some() {
        return Err(ControllerError::AmbiguousMultipleProcesses);
    }

    let conversation_resolution = resolve_conversation(
        pool.provider,
        target,
        live_instances,
        history,
        pool.fallback_latest_enabled,
    );

    if conversation_resolution.is_ambiguous {
        return Err(ControllerError::AmbiguousMultipleProcesses);
    }

    if conversation_resolution.id.is_none()
        && conversation_resolution.origin != ResolutionOrigin::LatestFallback
    {
        return Err(ControllerError::ConversationUnresolved);
    }
    let cwd = target
        .identity
        .cwd
        .as_ref()
        .filter(|cwd| !cwd.trim().is_empty())
        .ok_or(ControllerError::MissingWorkingDirectory)?
        .clone();
    let command_spec = build_resume_command(
        pool.provider,
        target
            .launch_executable
            .as_deref()
            .ok_or(ControllerError::MissingLaunchExecutable)?,
        &cwd,
        conversation_resolution.id.as_deref(),
        continuation_prompt,
        &target.args,
        false,
    )
    .map_err(|e| ControllerError::CommandBuildFailed(format!("{:?}", e)))?;

    let operation_id = format!("rot-{}-{}-{}", pool.id, now, target.identity.pid);

    Ok(RotationPlan {
        operation_id,
        pool_id: pool.id.clone(),
        provider: pool.provider,
        original_account_id: current_account_id.to_string(),
        candidate_account_id: candidate_id,
        target_pid: target.identity.pid,
        target_started_at: target.identity.started_at,
        cwd,
        conversation_resolution,
        command_spec,
    })
}

#[cfg(test)]
mod tests;
