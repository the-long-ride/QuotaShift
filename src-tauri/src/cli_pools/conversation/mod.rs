use serde::{Deserialize, Serialize};

use super::process_inventory::{count_eligible_instances, CliInstance};
use super::types::CliProvider;
use crate::system::cli_restore::conversation::{normalize_path, valid_id};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolutionConfidence {
    ExplicitArg,
    CorrelatedExact,
    AmbiguousMultiple,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolutionOrigin {
    CommandLineArg,
    RolloutFile,
    HistoryLog,
    LatestFallback,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationHistoryItem {
    pub conversation_id: String,
    pub workspace: String,
    pub timestamp_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationResolution {
    pub id: Option<String>,
    pub confidence: ResolutionConfidence,
    pub is_ambiguous: bool,
    pub origin: ResolutionOrigin,
}

fn extract_flag_value(args: &[String], flag: &str) -> Option<String> {
    let inline = format!("{flag}=");
    args.iter().enumerate().find_map(|(i, arg)| {
        if let Some(value) = arg.strip_prefix(&inline) {
            return Some(value.to_string());
        }
        (arg == flag).then(|| args.get(i + 1).cloned()).flatten()
    })
}

pub fn explicit_id(provider: CliProvider, args: &[String]) -> Option<String> {
    let raw = match provider {
        CliProvider::Codex => extract_flag_value(args, "resume"),
        CliProvider::Agy => extract_flag_value(args, "--conversation"),
    }?;
    valid_id(&raw).then_some(raw)
}

pub fn may_fallback_latest(
    provider: CliProvider,
    target: &CliInstance,
    all_instances: &[CliInstance],
    pool_opt_in: bool,
) -> bool {
    if !pool_opt_in {
        return false;
    }
    if target
        .identity
        .cwd
        .as_deref()
        .map(|c| c.trim().is_empty())
        .unwrap_or(true)
    {
        return false;
    }
    count_eligible_instances(all_instances, Some(provider)) == 1
}

pub fn resolve_conversation(
    provider: CliProvider,
    target: &CliInstance,
    all_instances: &[CliInstance],
    history: &[ConversationHistoryItem],
    pool_fallback_latest_enabled: bool,
) -> ConversationResolution {
    // 1. Check explicit command line arguments
    if let Some(id) = explicit_id(provider, &target.args) {
        return ConversationResolution {
            id: Some(id),
            confidence: ResolutionConfidence::ExplicitArg,
            is_ambiguous: false,
            origin: ResolutionOrigin::CommandLineArg,
        };
    }

    // 2. Check for ambiguity: are there other instances in the same workspace?
    let target_cwd = target.identity.cwd.as_deref().unwrap_or("").trim();
    if !target_cwd.is_empty() {
        let norm_target = normalize_path(target_cwd);
        let peers_same_cwd = all_instances.iter().any(|i| {
            i.identity.pid != target.identity.pid
                && i.provider == provider
                && i.identity
                    .cwd
                    .as_deref()
                    .map(|c| normalize_path(c) == norm_target)
                    .unwrap_or(false)
        });

        if peers_same_cwd {
            return ConversationResolution {
                id: None,
                confidence: ResolutionConfidence::AmbiguousMultiple,
                is_ambiguous: true,
                origin: ResolutionOrigin::None,
            };
        }

        // Search history for matching workspace
        let candidates: Vec<&ConversationHistoryItem> = history
            .iter()
            .filter(|h| {
                normalize_path(&h.workspace) == norm_target
                    && valid_id(&h.conversation_id)
                    && h.timestamp_secs >= target.identity.started_at
            })
            .collect();

        if let Some(candidate) = candidates.first() {
            if candidates
                .iter()
                .any(|other| other.conversation_id != candidate.conversation_id)
            {
                return ConversationResolution {
                    id: None,
                    confidence: ResolutionConfidence::AmbiguousMultiple,
                    is_ambiguous: true,
                    origin: ResolutionOrigin::None,
                };
            }
            let origin = match provider {
                CliProvider::Agy => ResolutionOrigin::HistoryLog,
                CliProvider::Codex => ResolutionOrigin::RolloutFile,
            };
            return ConversationResolution {
                id: Some(candidate.conversation_id.clone()),
                confidence: ResolutionConfidence::CorrelatedExact,
                is_ambiguous: false,
                origin,
            };
        }
    }

    // 3. Fallback to latest session if permitted
    if may_fallback_latest(
        provider,
        target,
        all_instances,
        pool_fallback_latest_enabled,
    ) {
        return ConversationResolution {
            id: None,
            confidence: ResolutionConfidence::None,
            is_ambiguous: false,
            origin: ResolutionOrigin::LatestFallback,
        };
    }

    ConversationResolution {
        id: None,
        confidence: ResolutionConfidence::None,
        is_ambiguous: false,
        origin: ResolutionOrigin::None,
    }
}

#[cfg(test)]
mod tests;
