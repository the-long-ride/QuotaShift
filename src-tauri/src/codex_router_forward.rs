use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use std::collections::HashSet;
use std::sync::atomic::Ordering;

use super::auth_guard::{
    has_valid_router_secret, should_forward_request_header, should_forward_response_header,
    trusted_request_origin_and_host,
};
use super::routes::{route_decision, upstream_url};
use super::selection::{mark_retryable_failure, select_account};
use super::types::{
    CodexRouterAuth, InFlightGuard, RetryableFailure, RouterAppState, RouterRouteDecision,
};

pub const MAX_ROUTER_REQUEST_BODY: usize = 32 * 1024 * 1024;

pub fn extract_requested_model(body: &Bytes) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    value
        .as_object()?
        .get("model")?
        .as_str()
        .map(str::to_string)
        .filter(|model| !model.trim().is_empty())
}

pub fn router_diagnostic(
    account_id: &str,
    model: Option<&str>,
    status: u16,
    event: &str,
) -> String {
    format!(
        "event={event} account_id={account_id} model={} status={status}",
        model.unwrap_or("none")
    )
}

pub fn classify_retryable_failure(status: StatusCode, body: &[u8]) -> Option<RetryableFailure> {
    if matches!(
        status,
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS
    ) {
        return Some(RetryableFailure::Backoff);
    }

    if matches!(status, StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND) {
        let lower = String::from_utf8_lossy(body).to_ascii_lowercase();
        if lower.contains("model_not_found")
            || lower.contains("model not found")
            || lower.contains("model does not exist")
            || lower.contains("does not have access to model")
        {
            return Some(RetryableFailure::ModelIncompatible);
        }
    }

    None
}

pub fn build_buffered_response(status: StatusCode, headers: &HeaderMap, body: Bytes) -> Response {
    let mut response = Response::builder().status(status);
    if let Some(target) = response.headers_mut() {
        for (name, value) in headers {
            if should_forward_response_header(name) {
                target.insert(name.clone(), value.clone());
            }
        }
    }
    response
        .body(Body::from(body))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

pub fn build_streaming_response(response: reqwest::Response, in_flight: InFlightGuard) -> Response {
    let status = response.status();
    let headers = response.headers().clone();
    let stream = Box::pin(response.bytes_stream());
    let guarded_stream = futures_util::stream::unfold(
        (stream, Some(in_flight)),
        |(mut stream, guard)| async move {
            match stream.next().await {
                Some(item) => Some((item, (stream, guard))),
                None => {
                    drop(guard);
                    None
                }
            }
        },
    );
    let mut downstream = Response::builder().status(status);
    if let Some(target) = downstream.headers_mut() {
        for (name, value) in &headers {
            if should_forward_response_header(name) {
                target.insert(name.clone(), value.clone());
            }
        }
    }
    downstream
        .body(Body::from_stream(guarded_stream))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

pub async fn forward_request(state: RouterAppState, request: Request) -> Response {
    let in_flight = InFlightGuard::new(state.in_flight.clone(), state.in_flight_notify.clone());
    let config = match state.config.lock().await.clone() {
        Some(config) => config,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "Codex router has no runtime account configuration",
            )
                .into_response();
        }
    };

    let (parts, body) = request.into_parts();
    let path = parts.uri.path().to_string();
    let query = parts.uri.query().map(str::to_string);
    let body = match to_bytes(body, MAX_ROUTER_REQUEST_BODY).await {
        Ok(body) => body,
        Err(_) => return (StatusCode::PAYLOAD_TOO_LARGE, "Request body too large").into_response(),
    };
    let needs_model = matches!(
        path.as_str(),
        "/responses" | "/responses/compact" | "/v1/responses" | "/v1/responses/compact"
    );
    let requested_model = if needs_model {
        match extract_requested_model(&body) {
            Some(model) => Some(model),
            None => return (StatusCode::BAD_REQUEST, "Missing top-level model").into_response(),
        }
    } else {
        None
    };

    let max_attempts = config.accounts.len().max(1);
    let mut attempted = HashSet::new();

    for _ in 0..max_attempts {
        let Some(account) = select_account(&state, &config, requested_model.as_deref()).await
        else {
            break;
        };
        if !attempted.insert(account.id.clone()) {
            break;
        }
        let Some(url) = upstream_url(&state.upstreams, &account.auth, &path, query.as_deref())
        else {
            return StatusCode::NOT_FOUND.into_response();
        };

        let mut builder = state.client.request(parts.method.clone(), &url);
        for (name, value) in &parts.headers {
            if should_forward_request_header(name) {
                builder = builder.header(name, value);
            }
        }
        builder = match &account.auth {
            CodexRouterAuth::OAuth {
                access_token,
                chatgpt_account_id,
                ..
            } => builder
                .bearer_auth(access_token)
                .header("chatgpt-account-id", chatgpt_account_id),
            CodexRouterAuth::ApiKey { api_key } => builder.bearer_auth(api_key),
        };
        if !body.is_empty() {
            builder = builder.body(body.clone());
        }

        let response = match builder.send().await {
            Ok(response) => response,
            Err(_) => {
                mark_retryable_failure(
                    &state,
                    &account.id,
                    requested_model.as_deref(),
                    RetryableFailure::Backoff,
                )
                .await;
                crate::logger::log_warn(
                    "codex_router",
                    &router_diagnostic(
                        &account.id,
                        requested_model.as_deref(),
                        0,
                        "upstream_transport_failure",
                    ),
                );
                continue;
            }
        };

        let status = response.status();
        if matches!(
            status,
            StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::TOO_MANY_REQUESTS
                | StatusCode::BAD_REQUEST
                | StatusCode::NOT_FOUND
        ) {
            let headers = response.headers().clone();
            let failure_body = match response.bytes().await {
                Ok(body) => body,
                Err(_) => Bytes::new(),
            };
            if let Some(failure) = classify_retryable_failure(status, &failure_body) {
                mark_retryable_failure(&state, &account.id, requested_model.as_deref(), failure)
                    .await;
                crate::logger::log_warn(
                    "codex_router",
                    &router_diagnostic(
                        &account.id,
                        requested_model.as_deref(),
                        status.as_u16(),
                        "precommit_failover",
                    ),
                );
                if attempted.len() < max_attempts {
                    continue;
                }
            }
            return build_buffered_response(status, &headers, failure_body);
        }

        *state.last_routed_account_id.lock().await = Some(account.id.clone());
        *state.last_routed_model.lock().await = requested_model.clone();
        state.routed_request_count.fetch_add(1, Ordering::SeqCst);
        crate::logger::log_info(
            "codex_router",
            &router_diagnostic(
                &account.id,
                requested_model.as_deref(),
                status.as_u16(),
                "forwarded",
            ),
        );
        return build_streaming_response(response, in_flight);
    }

    (
        StatusCode::SERVICE_UNAVAILABLE,
        "No eligible Codex account is available for this request",
    )
        .into_response()
}

pub async fn router_surface(State(state): State<RouterAppState>, request: Request) -> Response {
    let decision = route_decision(request.method().as_str(), request.uri().path());
    if matches!(
        decision,
        RouterRouteDecision::Health | RouterRouteDecision::Forward
    ) && !trusted_request_origin_and_host(&request.headers(), &state.expected_host)
    {
        return StatusCode::FORBIDDEN.into_response();
    }

    match decision {
        RouterRouteDecision::Health => (StatusCode::OK, "ok").into_response(),
        RouterRouteDecision::Forward => {
            if !has_valid_router_secret(&request.headers(), state.router_secret.as_bytes()) {
                return StatusCode::UNAUTHORIZED.into_response();
            }
            forward_request(state, request).await
        }
        RouterRouteDecision::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED.into_response(),
        RouterRouteDecision::NotFound => StatusCode::NOT_FOUND.into_response(),
    }
}
