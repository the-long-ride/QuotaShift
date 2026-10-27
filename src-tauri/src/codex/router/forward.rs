use axum::{
    body::{to_bytes, Bytes},
    extract::Request,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::collections::HashSet;
use std::sync::atomic::Ordering;

use super::anthropic::errors::route_rejection_response;
use super::auth_guard::{should_forward_request_header, should_forward_siwc_header};
use super::encode::{commit_response, ResponseEncoding, UpstreamFailure};
use super::precommit::{read_until_commit, FailureKind, Precommit, PrecommitLimits};
use super::response_utils::{
    build_models_list_response, classify_retryable_failure, response_byte_stream,
    router_diagnostic, StreamOwners,
};
use super::route_context::{resolve_forward_target, ClientContext, RouteTargetError};
use super::routes::upstream_url;
use super::selection::{mark_retryable_failure, select_account_for_route};
use super::siwc_forward::native_siwc_bearer;
use super::types::{CodexRouterAuth, InFlightGuard, RetryableFailure, RouterAppState};

pub const MAX_ROUTER_REQUEST_BODY: usize = 32 * 1024 * 1024;

pub async fn forward_request(
    state: RouterAppState,
    request: Request,
    client_ctx: ClientContext,
    encode: ResponseEncoding,
) -> Response {
    let in_flight = InFlightGuard::new(state.in_flight.clone(), state.in_flight_notify.clone());
    let config_guard = state.config.lock().await;
    let config = match config_guard.as_ref() {
        Some(config) => config.clone(),
        None => {
            return encode.error(
                StatusCode::SERVICE_UNAVAILABLE,
                "api_error",
                "Codex router has no runtime account configuration",
            );
        }
    };
    let snapshot = state.registry.read().await.clone();
    drop(config_guard);
    let (parts, body) = request.into_parts();
    let path = parts.uri.path().to_string();
    let query = parts.uri.query().map(str::to_string);
    let body = match to_bytes(body, MAX_ROUTER_REQUEST_BODY).await {
        Ok(body) => body,
        Err(_) => {
            return encode.error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "request_too_large",
                "Request body too large",
            )
        }
    };

    if matches!(path.as_str(), "/models" | "/v1/models") && !snapshot.routes.is_empty() {
        return build_models_list_response(snapshot.visible_models(&client_ctx));
    }

    let (route, rewritten_body) = match resolve_forward_target(&snapshot, &client_ctx, &path, &body)
    {
        Ok(pair) => pair,
        Err(RouteTargetError::MissingModel) => {
            return encode.error(
                StatusCode::BAD_REQUEST,
                "invalid_request_error",
                "Missing top-level model",
            );
        }
        Err(RouteTargetError::Rejection(err)) if encode.is_messages() => {
            return route_rejection_response(err);
        }
        Err(RouteTargetError::Rejection(err)) => {
            return super::route_errors::route_error_response(err);
        }
        Err(RouteTargetError::Rewrite(e)) => {
            return encode.error(StatusCode::BAD_REQUEST, "invalid_request_error", &e);
        }
    };

    let max_attempts = config.accounts.len().max(1);
    let mut attempted = HashSet::new();
    let mut last_failure: Option<FailureKind> = None;
    let mut last_upstream: Option<UpstreamFailure> = None;

    for _ in 0..max_attempts {
        let account = if let Some(ref r) = route {
            select_account_for_route(&state, &config, r).await
        } else {
            super::selection::select_account(&state, &config, None).await
        };

        let Some(account) = account else {
            break;
        };

        if !attempted.insert(account.id.clone()) {
            break;
        }

        // The shared account budget must cover the entire streamed response, not only admission.
        let reservation = match state.budgets.try_reserve(&account.id) {
            Ok(reservation) => reservation,
            Err(_) => continue,
        };

        let Some(url) = upstream_url(&state.upstreams, &account.auth, &path, query.as_deref())
        else {
            return StatusCode::NOT_FOUND.into_response();
        };

        let mut response = None;
        let mut account_backoff = false;

        for retry in 0..3 {
            let mut builder = state.client.request(parts.method.clone(), &url);
            for (name, value) in &parts.headers {
                let allowed = if matches!(&account.auth, CodexRouterAuth::Siwc { .. }) {
                    should_forward_siwc_header(name)
                } else {
                    should_forward_request_header(name)
                };
                if allowed {
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
                CodexRouterAuth::Siwc { registration_id } => {
                    match native_siwc_bearer(&state, registration_id).await {
                        Ok(token) => builder.bearer_auth(token),
                        Err(_) => {
                            last_failure = Some(FailureKind::Auth);
                            last_upstream = None;
                            mark_retryable_failure(
                                &state,
                                &account.id,
                                route.as_ref().map(|r| r.upstream_model_id.as_str()),
                                RetryableFailure::Backoff,
                            )
                            .await;
                            account_backoff = true;
                            break;
                        }
                    }
                }
            };
            if !rewritten_body.is_empty() {
                builder = builder.body(rewritten_body.clone());
            }

            match builder.send().await {
                Ok(res) => {
                    response = Some(res);
                    break;
                }
                Err(_) => {
                    last_failure = Some(FailureKind::Transport);
                    last_upstream = None;
                    if retry + 1 < 3 {
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        continue;
                    }
                    let model = route.as_ref().map(|r| r.upstream_model_id.as_str());
                    mark_retryable_failure(&state, &account.id, model, RetryableFailure::Backoff)
                        .await;
                    crate::logger::log_warn(
                        "codex_router",
                        &router_diagnostic(&account.id, model, 0, "upstream_transport_failure"),
                    );
                    account_backoff = true;
                    break;
                }
            }
        }

        if account_backoff || response.is_none() {
            continue;
        }

        let response = response.unwrap();

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
            let model = route.as_ref().map(|r| r.upstream_model_id.as_str());
            if let Some(failure) = classify_retryable_failure(status, &failure_body) {
                last_failure = Some(FailureKind::from_status(status, failure));
                last_upstream = UpstreamFailure::keep(status, &headers, &failure_body);
                mark_retryable_failure(&state, &account.id, model, failure).await;
                crate::logger::log_warn(
                    "codex_router",
                    &router_diagnostic(&account.id, model, status.as_u16(), "precommit_failover"),
                );
                if attempted.len() < max_attempts {
                    continue;
                }
                return encode.exhausted(last_failure, last_upstream);
            }
            return encode.upstream_failure(status, &headers, failure_body);
        }

        let model = route.as_ref().map(|r| r.upstream_model_id.as_str());
        let headers = response.headers().clone();
        let is_sse = headers
            .get(axum::http::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("text/event-stream"));
        let (prefix, rest) = if encode.is_messages() || is_sse {
            let limits = PrecommitLimits {
                wide_commit: !encode.is_messages(),
                ..PrecommitLimits::default()
            };
            match read_until_commit(response, limits).await {
                Precommit::RetryNextAccount(failure, kind) => {
                    last_failure = Some(kind);
                    last_upstream = None;
                    mark_retryable_failure(&state, &account.id, model, failure).await;
                    let event = match kind {
                        FailureKind::Transport => "precommit_transport_error",
                        _ => "precommit_failover",
                    };
                    crate::logger::log_warn(
                        "codex_router",
                        &router_diagnostic(&account.id, model, 200, event),
                    );
                    continue;
                }
                Precommit::Fail { status, body } => {
                    return encode.upstream_failure(status, &headers, body);
                }
                Precommit::Commit { prefix, rest } => (prefix, rest),
            }
        } else {
            (Vec::new(), response_byte_stream(response))
        };

        *state.last_routed_account_id.lock().await = Some(account.id.clone());
        *state.last_routed_model.lock().await = route.as_ref().map(|r| r.public_model_name.clone());
        state.routed_request_count.fetch_add(1, Ordering::SeqCst);
        crate::logger::log_info(
            "codex_router",
            &router_diagnostic(&account.id, model, status.as_u16(), "forwarded"),
        );
        let siwc = matches!(&account.auth, CodexRouterAuth::Siwc { .. }).then(|| {
            (
                account.id.clone(),
                route
                    .as_ref()
                    .map(|r| r.upstream_model_id.clone())
                    .unwrap_or_default(),
                state.selection_state.clone(),
            )
        });
        let owners = StreamOwners {
            in_flight,
            reservation,
            siwc,
            telemetry: Some(state.usage_telemetry.clone()),
        };
        return commit_response(&encode, status, &headers, prefix, rest, owners).await;
    }

    encode.exhausted(last_failure, last_upstream)
}
