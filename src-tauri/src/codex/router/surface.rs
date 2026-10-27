use axum::{
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};

use super::anthropic::errors::messages_error_response;
use super::auth_guard::trusted_request_origin_and_host;
use super::client_auth::authenticated_client_context;
use super::encode::ResponseEncoding;
use super::forward::forward_request;
use super::messages_entry::{handle_count_tokens, handle_messages};
use super::response_utils::pool_request_log;
use super::routes::route_decision;
use super::types::{RouterAppState, RouterRouteDecision};

/// Claude Code expects the Anthropic error envelope on the Messages endpoints.
fn reject(messages_api: bool, status: StatusCode, error_type: &str, message: &str) -> Response {
    if messages_api {
        messages_error_response(status, error_type, message)
    } else {
        status.into_response()
    }
}

pub async fn router_surface(State(state): State<RouterAppState>, request: Request) -> Response {
    let path = request.uri().path().to_string();
    let messages_api = path.starts_with("/v1/messages");
    let decision = route_decision(request.method().as_str(), &path);
    if matches!(
        decision,
        RouterRouteDecision::Health | RouterRouteDecision::Forward
    ) && !trusted_request_origin_and_host(request.headers(), &state.expected_host)
    {
        let message = "Request origin or host is not allowed";
        return reject(
            messages_api,
            StatusCode::FORBIDDEN,
            "permission_error",
            message,
        );
    }

    match decision {
        RouterRouteDecision::Health => (StatusCode::OK, "ok").into_response(),
        RouterRouteDecision::Forward => {
            let Some(client_ctx) = authenticated_client_context(&state, request.headers()).await
            else {
                let message = "Missing or invalid QuotaShift gateway credential";
                let kind = "authentication_error";
                return reject(messages_api, StatusCode::UNAUTHORIZED, kind, message);
            };
            let method = request.method().as_str().to_string();
            crate::logger::log_info("codex_pool", &pool_request_log("in", &method, &path, None));
            let response = match path.as_str() {
                "/v1/messages" => handle_messages(state, request, client_ctx).await,
                "/v1/messages/count_tokens" => handle_count_tokens(request).await,
                _ => {
                    forward_request(state, request, client_ctx, ResponseEncoding::Passthrough).await
                }
            };
            crate::logger::log_info(
                "codex_pool",
                &pool_request_log("out", &method, &path, Some(response.status().as_u16())),
            );
            response
        }
        RouterRouteDecision::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED.into_response(),
        RouterRouteDecision::NotFound => StatusCode::NOT_FOUND.into_response(),
    }
}
