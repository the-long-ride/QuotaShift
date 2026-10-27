//! `/v1/messages` and `/v1/messages/count_tokens`: Claude Code entry points.
use axum::{
    body::{to_bytes, Body},
    extract::Request,
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::Value;

use super::anthropic::count_tokens::estimate_tokens;
use super::anthropic::errors::{
    messages_error_response, route_rejection_response, translate_error_response,
};
use super::anthropic::request::{
    convert_anthropic_to_responses_with_options, derive_prompt_cache_key, requested_model,
};
use super::encode::ResponseEncoding;
use super::forward::{forward_request, MAX_ROUTER_REQUEST_BODY};
use super::pool_registry::{PoolAuthMode, PoolRegistrySnapshot};
use super::route_context::{resolve_route, ClientContext, ResolvedRoute, RouteRejection};
use super::types::RouterAppState;

/// Exact alias first; an unknown or disabled alias falls back to the client's Default slot.
pub fn resolve_messages_alias(
    snapshot: &PoolRegistrySnapshot,
    ctx: &ClientContext,
    requested: &str,
) -> Result<ResolvedRoute, RouteRejection> {
    match resolve_route(snapshot, ctx, requested) {
        Err(RouteRejection::UnknownAlias(_) | RouteRejection::Disabled(_)) => {
            match ctx.fallback_alias.as_deref() {
                Some(fallback) => resolve_route(snapshot, ctx, fallback),
                None => resolve_route(snapshot, ctx, requested),
            }
        }
        other => other,
    }
}

fn invalid_request(message: &str) -> Response {
    messages_error_response(StatusCode::BAD_REQUEST, "invalid_request_error", message)
}

async fn read_json(request: Request) -> Result<Value, Response> {
    let bytes = to_bytes(request.into_body(), MAX_ROUTER_REQUEST_BODY)
        .await
        .map_err(|_| {
            messages_error_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                "request_too_large",
                "Request body too large",
            )
        })?;
    serde_json::from_slice(&bytes).map_err(|_| invalid_request("Request body must be valid JSON"))
}

fn new_message_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("msg_{hex}")
}

pub async fn handle_count_tokens(request: Request) -> Response {
    match read_json(request).await {
        Ok(req) => {
            axum::Json(serde_json::json!({ "input_tokens": estimate_tokens(&req) })).into_response()
        }
        Err(response) => response,
    }
}

pub async fn handle_messages(
    state: RouterAppState,
    request: Request,
    ctx: ClientContext,
) -> Response {
    let session_header = request
        .headers()
        .get("x-claude-code-session-id")
        .or_else(|| request.headers().get("x-session-id"))
        .or_else(|| request.headers().get("conversation_id"))
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let req = match read_json(request).await {
        Ok(req) => req,
        Err(response) => return response,
    };
    let Some(requested) = requested_model(&req).filter(|m| !m.trim().is_empty()) else {
        return invalid_request("Missing top-level model");
    };
    let snapshot = state.registry.read().await.clone();
    let route = match resolve_messages_alias(&snapshot, &ctx, requested) {
        Ok(route) => route,
        Err(rejection) => return route_rejection_response(rejection),
    };
    if route.auth_mode == PoolAuthMode::LegacyCodexOAuth {
        return invalid_request(&format!(
            "Pool '{}' uses legacy Codex OAuth and cannot serve Claude Code. Use a SIWC or API-key pool.",
            route.public_model_name
        ));
    }
    if let Some(max_ctx) = route.max_context_window_tokens.filter(|&v| v > 0) {
        let estimated = estimate_tokens(&req) as u64;
        if estimated > max_ctx {
            return invalid_request(&format!(
                "Request input (~{estimated} tokens) exceeds max context window ({max_ctx} tokens) configured for pool '{}'",
                route.public_model_name
            ));
        }
    }
    // The forward loop resolves the alias again, so hand it the pool's public name.
    let mut payload = match convert_anthropic_to_responses_with_options(
        &req,
        &route.public_model_name,
        route.reasoning_effort.as_deref(),
        route.thinking_budget_tokens,
    ) {
        Ok(payload) => payload,
        Err(error) => return translate_error_response(&error),
    };
    let cache_key = derive_prompt_cache_key(
        &req,
        session_header.as_deref(),
        ctx.binding_id.as_deref(),
        &route.pool_id,
    );
    if let Some(ref key) = cache_key {
        payload["prompt_cache_key"] = serde_json::json!(key);
    }
    let stream = req.get("stream").and_then(Value::as_bool).unwrap_or(false);
    let mut builder = Request::builder()
        .method(Method::POST)
        .uri("/v1/responses")
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(ref key) = cache_key {
        builder = builder.header("x-claude-code-session-id", key);
    }
    let forwarded = builder.body(Body::from(serde_json::to_vec(&payload).unwrap_or_default()));
    let Ok(forwarded) = forwarded else {
        return invalid_request("Could not build upstream request");
    };
    let encode = ResponseEncoding::AnthropicMessages {
        message_id: new_message_id(),
        alias: route.public_model_name.clone(),
        stream,
    };
    forward_request(state, forwarded, ctx, encode).await
}
