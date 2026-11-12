use std::collections::HashSet;
use serde::{Deserialize, Serialize};
use super::controller::select_next_candidate_account;
use super::types::{CliProvider, CliRotationPoolV1};

/// Account selection only: never opens a listener or writes credentials.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum AgentRotationRequest {
    Auto {
        provider: CliProvider,
        #[serde(rename = "poolId", default)]
        pool_id: Option<String>,
    },
    Account {
        provider: CliProvider,
        #[serde(rename = "poolId", default)]
        pool_id: Option<String>,
        #[serde(rename = "accountId")]
        account_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentSelectionError {
    DisabledPool, ProviderMismatch, PoolMismatch,
    NotInPool, NotSavedAccount, MissingPool, Exhausted, NoEligibleCandidate,
}

/// Call only after authentication and native active-pool resolution.
/// The coordinator must additionally validate freshness, credentials and PID.
pub fn resolve_agent_candidate(
    pool: &CliRotationPoolV1,
    request: &AgentRotationRequest,
    current_id: &str,
    exhausted_ids: &HashSet<String>,
) -> Result<String, AgentSelectionError> {
    if !pool.enabled { return Err(AgentSelectionError::DisabledPool); }
    let (provider, pool_id) = match request {
        AgentRotationRequest::Auto { provider, pool_id }
        | AgentRotationRequest::Account { provider, pool_id, .. } => (provider, pool_id),
    };
    if *provider != pool.provider { return Err(AgentSelectionError::ProviderMismatch); }
    if pool_id.as_ref().is_some_and(|id| id != &pool.id) {
        return Err(AgentSelectionError::PoolMismatch);
    }
    match request {
        AgentRotationRequest::Auto { .. } =>
            select_next_candidate_account(pool, current_id, exhausted_ids)
                .ok_or(AgentSelectionError::NoEligibleCandidate),
        AgentRotationRequest::Account { account_id, .. } => {
            if !pool.account_ids.contains(account_id) {
                return Err(AgentSelectionError::NotInPool);
            }
            if exhausted_ids.contains(account_id) {
                return Err(AgentSelectionError::Exhausted);
            }
            // Same account is idempotent; the coordinator must not restart it.
            Ok(account_id.clone())
        }
    }
}

/// Route both kinds of agent requests through one policy boundary.
/// `saved_provider_ids` must be scoped to the requested provider by the native
/// account registry. HTTP authorization, freshness and credentials are separate.
pub fn resolve_agent_request(
    pool: Option<&CliRotationPoolV1>,
    request: &AgentRotationRequest,
    current_id: &str,
    exhausted_ids: &HashSet<String>,
    saved_provider_ids: &HashSet<String>,
) -> Result<String, AgentSelectionError> {
    if let AgentRotationRequest::Account { pool_id: None, account_id, .. } = request {
        if !saved_provider_ids.contains(account_id) {
            return Err(AgentSelectionError::NotSavedAccount);
        }
        if exhausted_ids.contains(account_id) {
            return Err(AgentSelectionError::Exhausted);
        }
        return Ok(account_id.clone());
    }
    let pool = pool.ok_or(AgentSelectionError::MissingPool)?;
    let selected = resolve_agent_candidate(pool, request, current_id, exhausted_ids)?;
    if !saved_provider_ids.contains(&selected) {
        return Err(AgentSelectionError::NotSavedAccount);
    }
    Ok(selected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::QuotaWindowKind;
    fn pool() -> CliRotationPoolV1 {
        CliRotationPoolV1 {
            id: "default".into(), provider: CliProvider::Codex,
            name: "Default".into(),
            account_ids: vec!["a".into(), "b".into(), "c".into()],
            enabled: true, auto_switch: true,
            trigger_windows: vec![QuotaWindowKind::FiveHour],
            fallback_latest_enabled: false, switch_when_idle_only: false,
        }
    }
    #[test]
    fn automatic_advances_and_skips_exhausted_accounts() {
        let req = AgentRotationRequest::Auto { provider: CliProvider::Codex, pool_id: None };
        assert_eq!(resolve_agent_candidate(&pool(), &req, "a", &HashSet::new()), Ok("b".into()));
        assert_eq!(resolve_agent_candidate(&pool(), &req, "a", &HashSet::from(["b".into()])), Ok("c".into()));
    }
    #[test]
    fn manual_selection_rejects_outside_pool_or_exhausted_but_accepts_same_id() {
        let pick = |id: &str| AgentRotationRequest::Account {
            provider: CliProvider::Codex, pool_id: Some("default".into()), account_id: id.into(),
        };
        assert_eq!(resolve_agent_candidate(&pool(), &pick("c"), "a", &HashSet::new()), Ok("c".into()));
        assert_eq!(resolve_agent_candidate(&pool(), &pick("a"), "a", &HashSet::new()), Ok("a".into()));
        assert_eq!(resolve_agent_candidate(&pool(), &pick("x"), "a", &HashSet::new()), Err(AgentSelectionError::NotInPool));
        assert_eq!(resolve_agent_candidate(&pool(), &pick("c"), "a", &HashSet::from(["c".into()])), Err(AgentSelectionError::Exhausted));
        let wrong = AgentRotationRequest::Auto { provider: CliProvider::Agy, pool_id: None };
        assert_eq!(resolve_agent_candidate(&pool(), &wrong, "a", &HashSet::new()), Err(AgentSelectionError::ProviderMismatch));
    }
    #[test]
    fn accepts_antigravity_provider_alias_in_requests() {
        let request: AgentRotationRequest = serde_json::from_str(
            r#"{"mode":"account","provider":"antigravity","accountId":"a"}"#
        ).unwrap();
        assert!(matches!(request, AgentRotationRequest::Account { provider: CliProvider::Agy, .. }));
    }

    #[test]
    fn directly_selects_a_saved_account_outside_cli_pools() {
        let req = AgentRotationRequest::Account {
            provider: CliProvider::Codex, pool_id: None, account_id: "external".into(),
        };
        let saved = HashSet::from(["a".into(), "b".into(), "external".into()]);
        assert_eq!(resolve_agent_request(None, &req, "a", &HashSet::new(), &saved), Ok("external".into()));
        assert_eq!(resolve_agent_request(None, &req, "a", &HashSet::from(["external".into()]), &saved), Err(AgentSelectionError::Exhausted));
        assert_eq!(resolve_agent_request(None, &req, "a", &HashSet::new(), &HashSet::new()), Err(AgentSelectionError::NotSavedAccount));
    }
    #[test]
    fn explicit_pool_id_cannot_override_membership() {
        let req = AgentRotationRequest::Account {
            provider: CliProvider::Codex, pool_id: Some("default".into()), account_id: "external".into(),
        };
        let saved = HashSet::from(["a".into(), "b".into(), "external".into()]);
        assert_eq!(resolve_agent_request(Some(&pool()), &req, "a", &HashSet::new(), &saved), Err(AgentSelectionError::NotInPool));
        assert_eq!(resolve_agent_request(None, &req, "a", &HashSet::new(), &saved), Err(AgentSelectionError::MissingPool));
    }
}
