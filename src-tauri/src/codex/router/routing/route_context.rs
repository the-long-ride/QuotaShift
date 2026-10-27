use std::collections::HashSet;

use super::client_binding::ClientBinding;
use super::pool_registry::{PoolAuthMode, PoolRegistrySnapshot, PoolRoutingPolicy};

#[derive(Clone, Debug, Default)]
pub struct ClientContext {
    pub binding_id: Option<String>,
    pub allowed_aliases: HashSet<String>,
    pub is_unrestricted: bool,
    pub fallback_alias: Option<String>,
}

impl ClientContext {
    pub fn unrestricted() -> Self {
        Self {
            binding_id: None,
            allowed_aliases: HashSet::new(),
            is_unrestricted: true,
            fallback_alias: None,
        }
    }

    pub fn from_binding(binding: &ClientBinding) -> Self {
        Self {
            binding_id: Some(binding.id.0.clone()),
            allowed_aliases: binding.allowed_aliases.clone(),
            is_unrestricted: false,
            fallback_alias: binding.fallback_alias.clone(),
        }
    }

    pub fn allows_alias(&self, alias: &str) -> bool {
        if self.is_unrestricted {
            return true;
        }
        let normalized = alias.trim().to_ascii_lowercase();
        self.allowed_aliases
            .iter()
            .any(|a| a.trim().to_ascii_lowercase() == normalized)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedRoute {
    pub pool_id: String,
    pub public_model_name: String,
    pub upstream_model_id: String,
    pub member_account_ids: Vec<String>,
    pub model_selection_mode: String,
    pub routing_policy: PoolRoutingPolicy,
    pub auth_mode: PoolAuthMode,
    pub max_context_window_tokens: Option<u64>,
    pub thinking_budget_tokens: Option<u64>,
    pub reasoning_effort: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RouteRejection {
    UnknownAlias(String),
    Disabled(String),
    Forbidden(String),
    NoEligibleAccounts(String),
    QuotaExhausted(String),
}

impl std::fmt::Display for RouteRejection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownAlias(alias) => write!(f, "Unknown model alias: {alias}"),
            Self::Disabled(alias) => write!(f, "Model alias is disabled: {alias}"),
            Self::Forbidden(alias) => write!(f, "Access to model alias is forbidden: {alias}"),
            Self::NoEligibleAccounts(alias) => {
                write!(f, "No eligible accounts available for model alias: {alias}")
            }
            Self::QuotaExhausted(alias) => {
                write!(f, "Quota exhausted for model alias: {alias}")
            }
        }
    }
}

impl std::error::Error for RouteRejection {}

pub fn resolve_route(
    snapshot: &PoolRegistrySnapshot,
    client: &ClientContext,
    alias: &str,
) -> Result<ResolvedRoute, RouteRejection> {
    let trimmed = alias.trim();
    let case_folded = trimmed.to_ascii_lowercase();

    let pool = snapshot
        .routes
        .get(&case_folded)
        .ok_or_else(|| RouteRejection::UnknownAlias(alias.to_string()))?;

    if !pool.enabled {
        return Err(RouteRejection::Disabled(alias.to_string()));
    }

    if !client.allows_alias(&pool.public_model_name) {
        return Err(RouteRejection::Forbidden(alias.to_string()));
    }

    Ok(ResolvedRoute {
        pool_id: pool.id.clone(),
        public_model_name: pool.public_model_name.clone(),
        upstream_model_id: pool.upstream_model_id.clone(),
        member_account_ids: pool.member_account_ids.clone(),
        model_selection_mode: pool.model_selection_mode.clone(),
        routing_policy: pool.routing_policy,
        auth_mode: pool.auth_mode,
        max_context_window_tokens: pool.max_context_window_tokens,
        thinking_budget_tokens: pool.thinking_budget_tokens,
        reasoning_effort: pool.reasoning_effort.clone(),
    })
}

pub fn rewrite_model_in_json(body: &[u8], new_model: &str) -> Result<Vec<u8>, String> {
    let mut value: serde_json::Value =
        serde_json::from_slice(body).map_err(|e| format!("Invalid JSON request body: {e}"))?;

    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Top-level JSON payload must be an object".to_string())?;

    obj.insert(
        "model".to_string(),
        serde_json::Value::String(new_model.to_string()),
    );

    serde_json::to_vec(&value).map_err(|e| format!("Failed to serialize rewritten body: {e}"))
}

/// The non-empty top-level `model` of a JSON request body.
pub fn extract_requested_model(body: &axum::body::Bytes) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    value
        .as_object()?
        .get("model")?
        .as_str()
        .map(str::to_string)
        .filter(|model| !model.trim().is_empty())
}

#[derive(Debug)]
pub enum RouteTargetError {
    MissingModel,
    Rejection(RouteRejection),
    Rewrite(String),
}

pub fn resolve_forward_target(
    snapshot: &PoolRegistrySnapshot,
    client_ctx: &ClientContext,
    path: &str,
    body: &axum::body::Bytes,
) -> Result<(Option<ResolvedRoute>, axum::body::Bytes), RouteTargetError> {
    let needs_model = matches!(
        path,
        "/responses" | "/responses/compact" | "/v1/responses" | "/v1/responses/compact"
    );

    if !needs_model {
        return Ok((None, body.clone()));
    }

    let requested_alias = extract_requested_model(body).ok_or(RouteTargetError::MissingModel)?;

    let route = resolve_route(snapshot, client_ctx, &requested_alias)
        .map_err(RouteTargetError::Rejection)?;

    let rewritten = if requested_alias == route.upstream_model_id {
        body.clone()
    } else {
        let bytes = rewrite_model_in_json(body, &route.upstream_model_id)
            .map_err(RouteTargetError::Rewrite)?;
        axum::body::Bytes::from(bytes)
    };

    let rewritten = if route.auth_mode == PoolAuthMode::Siwc {
        super::siwc_forward::prepare_native_siwc_body(&rewritten, &route.upstream_model_id, path)
            .map_err(RouteTargetError::Rewrite)?
    } else {
        rewritten
    };

    Ok((Some(route), rewritten))
}
