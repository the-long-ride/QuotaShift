use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::Emitter;
use super::key::matches_bearer;
use super::state::{epoch_ms, AgentApiManager, AgentOperation, PublicAgentAccount, PublicAgentPool};
use crate::cli_pools::{resolve_agent_request, AgentRotationRequest, CliProvider, CliRotationPoolV1};

#[derive(Clone)]
pub struct RouterContext {
    pub manager: AgentApiManager,
    pub key: String,
    pub write_enabled: bool,
    pub app: tauri::AppHandle,
}

pub fn build_router(context: RouterContext) -> Router {
    Router::new()
        .route("/v1/accounts", get(list_accounts))
        .route("/v1/pools", get(list_pools))
        .route("/v1/rotation", post(rotate))
        .route("/v1/operations/{id}", get(operation))
        .layer(DefaultBodyLimit::max(4096))
        .with_state(context)
}

/// No CORS, including requests from web pages on localhost.
/// A local agent must present the independently configured API key.
fn authenticate(headers: &HeaderMap, expected: &str) -> Result<(), StatusCode> {
    if headers.contains_key(header::ORIGIN) {
        return Err(StatusCode::FORBIDDEN);
    }
    let host = headers.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("");
    let host_without_port = host.split(':').next().unwrap_or("");
    if !matches!(host_without_port, "localhost" | "127.0.0.1") {
        return Err(StatusCode::FORBIDDEN);
    }
    let provided = headers.get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok()).unwrap_or("");
    if !matches_bearer(provided, &format!("Bearer {expected}")) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}

async fn list_accounts(
    State(ctx): State<RouterContext>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    authenticate(&headers, &ctx.key)?;
    let snapshot = ctx.manager.inner.snapshot.read().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(Json(serde_json::json!({ "accounts": snapshot.accounts })))
}
async fn list_pools(
    State(ctx): State<RouterContext>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    authenticate(&headers, &ctx.key)?;
    let snapshot = ctx.manager.inner.snapshot.read().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(Json(serde_json::json!({ "pools": snapshot.pools })))
}
async fn operation(
    State(ctx): State<RouterContext>, headers: HeaderMap, Path(id): Path<String>,
) -> Result<Json<AgentOperation>, StatusCode> {
    authenticate(&headers, &ctx.key)?;
    let ops = ctx.manager.inner.operations.lock().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    ops.get(&id).cloned().map(Json).ok_or(StatusCode::NOT_FOUND)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDispatch {
    pub operation_id: String,
    pub provider: String,
    pub account_id: String,
}

fn selected_provider(provider: CliProvider) -> &'static str {
    match provider { CliProvider::Agy => "antigravity", CliProvider::Codex => "codex" }
}
fn eligible(account: &PublicAgentAccount, now: u64) -> bool {
    account.remaining_percent.is_some_and(|v| v > 0)
        && account.updated_at.is_some_and(|t| t <= now && now - t <= 300_000)
}
fn to_rotation_pool(pool: &PublicAgentPool, provider: CliProvider) -> CliRotationPoolV1 {
    CliRotationPoolV1 {
        id: pool.id.clone(), provider, name: String::new(),
        account_ids: pool.account_ids.clone(), enabled: pool.enabled,
        auto_switch: false, trigger_windows: vec![],
        fallback_latest_enabled: false, switch_when_idle_only: true,
    }
}
fn candidate(
    snapshot: &super::state::AgentApiSnapshot,
    req: &AgentRotationRequest, now: u64,
) -> Result<(String, String), StatusCode> {
    let (provider, requested_pool) = match req {
        AgentRotationRequest::Auto { provider, pool_id }
        | AgentRotationRequest::Account { provider, pool_id, .. } => (*provider, pool_id.as_ref()),
    };
    let provider_name = selected_provider(provider);
    let saved = snapshot.accounts.iter().filter(|a| a.provider == provider_name)
        .map(|a| a.id.clone()).collect::<HashSet<_>>();
    let blocked = snapshot.accounts.iter().filter(|a| a.provider == provider_name && !eligible(a, now))
        .map(|a| a.id.clone()).collect::<HashSet<_>>();
    let current = if provider == CliProvider::Agy {
        snapshot.active_antigravity_id.as_deref().unwrap_or("")
    } else {
        snapshot.active_codex_id.as_deref().unwrap_or("")
    };
    let active_pool = snapshot.pools.iter().find(|p| {
        p.provider == provider_name && p.enabled
            && if let Some(id) = requested_pool { &p.id == id } else { p.active }
    });
    let pool = active_pool.map(|p| to_rotation_pool(p, provider));
    let selected = resolve_agent_request(pool.as_ref(), req, current, &blocked, &saved)
        .map_err(|_| StatusCode::CONFLICT)?;
    // If no quota is available or freshness has expired, fail closed.
    let acc = snapshot.accounts.iter().find(|a| a.provider == provider_name && a.id == selected)
        .ok_or(StatusCode::NOT_FOUND)?;
    if !eligible(acc, now) { return Err(StatusCode::CONFLICT); }
    Ok((provider_name.to_owned(), selected))
}

async fn rotate(
    State(ctx): State<RouterContext>, headers: HeaderMap, Json(req): Json<AgentRotationRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    authenticate(&headers, &ctx.key)?;
    if !ctx.write_enabled { return Err(StatusCode::FORBIDDEN); }
    let (provider, account_id) = {
        let snapshot = ctx.manager.inner.snapshot.read().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        candidate(&snapshot, &req, epoch_ms())?
    };
    let mut busy = ctx.manager.inner.active_operation.lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    if busy.is_some() { return Err(StatusCode::CONFLICT); }
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let id = bytes.iter().map(|v| format!("{v:02x}")).collect::<String>();
    *busy = Some(id.clone());
    drop(busy);
    let entry = AgentOperation {
        operation_id: id.clone(), provider: provider.clone(), account_id: account_id.clone(),
        status: "pending".to_owned(), updated_at: epoch_ms(),
    };
    ctx.manager.inner.operations.lock().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .insert(id.clone(), entry.clone());
    let payload = AgentDispatch { operation_id: id.clone(), provider, account_id };
    if ctx.app.emit_to("main", "quotashift:agent-rotation", payload).is_err() {
        ctx.manager.complete(&id, false);
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    let manager = ctx.manager.clone();
    let timeout_id = id.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(90)).await;
        manager.timeout(&timeout_id);
    });
    Ok((StatusCode::ACCEPTED, Json(entry)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bearer_auth_rejects_cross_origin_requests() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:45678".parse().unwrap());
        headers.insert(header::AUTHORIZATION, "Bearer secret".parse().unwrap());
        assert!(authenticate(&headers, "secret").is_ok());
        headers.insert(header::ORIGIN, "https://evil.example".parse().unwrap());
        assert_eq!(authenticate(&headers, "secret"), Err(StatusCode::FORBIDDEN));
    }
    #[test]
    fn missing_and_old_quota_are_not_eligible_for_switching() {
        let now = 2_000_000;
        let account = PublicAgentAccount {
            id: "a".into(), provider: "codex".into(),
            remaining_percent: Some(0), used_percent: Some(100),
            reset_at: None, updated_at: Some(now),
        };
        assert!(!eligible(&account, now));
        assert!(!eligible(&PublicAgentAccount { remaining_percent: Some(60),
            updated_at: Some(now - 301_000), ..account.clone() }, now));
        assert!(eligible(&PublicAgentAccount { remaining_percent: Some(60), ..account }, now));
    }
}
