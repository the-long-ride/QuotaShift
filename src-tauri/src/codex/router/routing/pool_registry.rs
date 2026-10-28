use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PoolRoutingPolicy {
    #[serde(rename = "cache-aware")]
    CacheAware,
    #[serde(rename = "balanced")]
    Balanced,
    #[serde(rename = "priority")]
    Priority,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PoolAuthMode {
    #[serde(rename = "siwc")]
    Siwc,
    #[serde(rename = "legacy-codex-oauth")]
    LegacyCodexOAuth,
    #[serde(rename = "openai-api-key")]
    OpenAiApiKey,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelPoolV2 {
    pub id: String,
    pub display_name: String,
    pub public_model_name: String,
    pub upstream_model_id: String,
    pub enabled: bool,
    pub member_account_ids: Vec<String>,
    pub model_selection_mode: String,
    pub routing_policy: PoolRoutingPolicy,
    pub auth_mode: PoolAuthMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_context_window_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_budget_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct PoolRegistrySnapshot {
    pub revision: u64,
    pub routes: HashMap<String, Arc<CodexModelPoolV2>>,
}

impl PoolRegistrySnapshot {
    pub fn visible_models(&self, client: &super::route_context::ClientContext) -> Vec<String> {
        let mut models: Vec<String> = self
            .routes
            .values()
            .filter(|pool| pool.enabled && client.allows_alias(&pool.public_model_name))
            .map(|pool| pool.public_model_name.clone())
            .collect();
        models.sort();
        models.dedup();
        models
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryValidationError {
    DuplicateId(String),
    InvalidAlias(String),
    EmptyEnabledMembers(String),
    DuplicateEnabledAlias(String),
    UnknownAccount { pool_id: String, account_id: String },
}

impl std::fmt::Display for RegistryValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateId(id) => write!(f, "Duplicate pool ID: {id}"),
            Self::InvalidAlias(alias) => write!(f, "Invalid model alias format: {alias}"),
            Self::EmptyEnabledMembers(id) => write!(f, "Enabled pool has no member accounts: {id}"),
            Self::DuplicateEnabledAlias(alias) => {
                write!(f, "Duplicate enabled public model alias: {alias}")
            }
            Self::UnknownAccount {
                pool_id,
                account_id,
            } => {
                write!(f, "Pool {pool_id} references unknown account {account_id}")
            }
        }
    }
}

impl std::error::Error for RegistryValidationError {}

pub fn is_valid_alias(alias: &str) -> bool {
    let trimmed = alias.trim();
    if trimmed.is_empty() || trimmed.len() > 96 {
        return false;
    }
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphanumeric() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '/' || c == '-')
}

pub fn validate_and_build_routes(
    pools: &[CodexModelPoolV2],
    known_account_ids: Option<&HashSet<String>>,
) -> Result<HashMap<String, Arc<CodexModelPoolV2>>, RegistryValidationError> {
    let mut seen_ids = HashSet::new();
    let mut enabled_routes = HashMap::new();

    for pool in pools {
        if !seen_ids.insert(pool.id.clone()) {
            return Err(RegistryValidationError::DuplicateId(pool.id.clone()));
        }

        if !is_valid_alias(&pool.public_model_name) {
            return Err(RegistryValidationError::InvalidAlias(
                pool.public_model_name.clone(),
            ));
        }

        if pool.enabled {
            if pool.member_account_ids.is_empty() {
                return Err(RegistryValidationError::EmptyEnabledMembers(
                    pool.id.clone(),
                ));
            }

            let case_folded = pool.public_model_name.trim().to_ascii_lowercase();
            if enabled_routes.contains_key(&case_folded) {
                return Err(RegistryValidationError::DuplicateEnabledAlias(
                    pool.public_model_name.clone(),
                ));
            }

            if let Some(known) = known_account_ids {
                for account_id in &pool.member_account_ids {
                    if !known.contains(account_id) {
                        return Err(RegistryValidationError::UnknownAccount {
                            pool_id: pool.id.clone(),
                            account_id: account_id.clone(),
                        });
                    }
                }
            }

            enabled_routes.insert(case_folded, Arc::new(pool.clone()));
        }
    }

    Ok(enabled_routes)
}

pub fn build_routes_from_config(
    config: &super::types::CodexRouterConfig,
) -> Result<HashMap<String, Arc<CodexModelPoolV2>>, String> {
    let known: HashSet<String> = config.accounts.iter().map(|a| a.id.clone()).collect();
    if let Some(pools_v2) = config.pools_v2.as_ref() {
        let routes = validate_and_build_routes(pools_v2, Some(&known))
            .map_err(|e| format!("Invalid model pool registry: {e}"))?;
        for pool in pools_v2.iter().filter(|p| p.enabled) {
            for id in &pool.member_account_ids {
                let account = config
                    .accounts
                    .iter()
                    .find(|a| &a.id == id)
                    .ok_or_else(|| format!("Unknown pool account ID {id}"))?;
                match (pool.auth_mode, &account.auth) {
                    // Deliberately separate from official SIWC: legacy V1 routes
                    // retain their original Codex CLI OAuth transport only.
                    (PoolAuthMode::LegacyCodexOAuth, super::types::CodexRouterAuth::OAuth { .. }) => {}
                    (PoolAuthMode::LegacyCodexOAuth, _) => return Err(
                        "Legacy Codex OAuth compatibility mode requires a legacy OAuth account".into()
                    ),
                    (PoolAuthMode::OpenAiApiKey, super::types::CodexRouterAuth::ApiKey { .. }) => {}
                    (PoolAuthMode::Siwc, super::types::CodexRouterAuth::Siwc { registration_id })
                        if registration_id == id => {}
                    (PoolAuthMode::Siwc, _) => return Err(
                        "SIWC pools require native SIWC registration references, not legacy Codex OAuth credentials".into()
                    ),
                    (PoolAuthMode::OpenAiApiKey, _) => return Err(
                        "API-billed model pool cannot use Codex OAuth credentials".into()
                    ),
                }
            }
        }
        Ok(routes)
    } else {
        let v2_converted: Vec<CodexModelPoolV2> = config
            .pools
            .iter()
            .map(|p| CodexModelPoolV2 {
                id: p.id.clone(),
                display_name: p.model.clone(),
                public_model_name: p.model.clone(),
                upstream_model_id: p.model.clone(),
                enabled: config.active_pool_id.as_deref() == Some(&p.id),
                member_account_ids: p.account_ids.clone(),
                model_selection_mode: p.model_selection_mode.clone(),
                routing_policy: PoolRoutingPolicy::CacheAware,
                auth_mode: PoolAuthMode::LegacyCodexOAuth,
                max_context_window_tokens: None,
                thinking_budget_tokens: None,
                reasoning_effort: None,
            })
            .collect();
        validate_and_build_routes(&v2_converted, Some(&known))
            .map_err(|e| format!("Invalid legacy pool registry: {e}"))
    }
}

#[cfg(test)]
#[path = "../router_tests/pool_registry_tests.rs"]
mod tests;
