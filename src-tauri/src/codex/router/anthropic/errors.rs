use axum::{
    body::Body,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::{json, Value};

use super::request::TranslateError;
use crate::codex::router::route_context::RouteRejection;

pub fn anthropic_error(error_type: &str, message: &str) -> Value {
    json!({
        "type": "error",
        "error": {
            "type": error_type,
            "message": message
        }
    })
}

pub fn not_found_error(message: &str) -> (StatusCode, Value) {
    (
        StatusCode::NOT_FOUND,
        anthropic_error("not_found_error", message),
    )
}

pub fn auth_error(message: &str) -> (StatusCode, Value) {
    (
        StatusCode::UNAUTHORIZED,
        anthropic_error("authentication_error", message),
    )
}

pub fn invalid_request_error(message: &str) -> (StatusCode, Value) {
    (
        StatusCode::BAD_REQUEST,
        anthropic_error("invalid_request_error", message),
    )
}

/// Build a JSON response carrying an Anthropic error envelope.
pub fn messages_error_response(status: StatusCode, error_type: &str, message: &str) -> Response {
    let body = serde_json::to_vec(&anthropic_error(error_type, message)).unwrap_or_default();
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

/// Claude Code retries 429 and 5xx for API-key users unless told otherwise, which would delay
/// a final "no quota" answer by minutes. `x-should-retry: false` makes it show at once.
pub fn no_retry(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert("x-should-retry", HeaderValue::from_static("false"));
    response
}

pub fn pool_exhausted(alias: &str) -> Response {
    no_retry(messages_error_response(
        StatusCode::TOO_MANY_REQUESTS,
        "rate_limit_error",
        &format!(
            "QuotaShift pool '{alias}' has no account with remaining quota. \
             Switch this Claude slot to another pool in QuotaShift."
        ),
    ))
}

pub fn route_rejection_response(r: RouteRejection) -> Response {
    match r {
        RouteRejection::UnknownAlias(alias) => messages_error_response(
            StatusCode::NOT_FOUND,
            "not_found_error",
            &format!("Model alias '{alias}' is not routed"),
        ),
        RouteRejection::Disabled(alias) => messages_error_response(
            StatusCode::NOT_FOUND,
            "not_found_error",
            &format!("Model alias '{alias}' is disabled"),
        ),
        RouteRejection::Forbidden(alias) => messages_error_response(
            StatusCode::FORBIDDEN,
            "permission_error",
            &format!("Access to model alias '{alias}' is forbidden"),
        ),
        RouteRejection::NoEligibleAccounts(alias) | RouteRejection::QuotaExhausted(alias) => {
            pool_exhausted(&alias)
        }
    }
}

pub fn translate_error_response(e: &TranslateError) -> Response {
    messages_error_response(StatusCode::BAD_REQUEST, "invalid_request_error", &e.message)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn body_json(resp: Response) -> (StatusCode, Value) {
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .expect("body");
        (status, serde_json::from_slice(&bytes).expect("json"))
    }

    #[tokio::test]
    async fn pool_exhausted_body_is_exact() {
        let (status, body) = body_json(pool_exhausted("opus-pool")).await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            body,
            json!({
                "type": "error",
                "error": {
                    "type": "rate_limit_error",
                    "message": "QuotaShift pool 'opus-pool' has no account with remaining quota. Switch this Claude slot to another pool in QuotaShift."
                }
            })
        );
    }

    #[tokio::test]
    async fn pool_exhausted_tells_claude_code_not_to_retry() {
        let response = pool_exhausted("opus-pool");
        assert_eq!(response.headers()["x-should-retry"], "false");
        assert_eq!(response.headers()["content-type"], "application/json");
        // Other rejections stay retryable by the client's own rules.
        let other = route_rejection_response(RouteRejection::UnknownAlias("a".into()));
        assert!(other.headers().get("x-should-retry").is_none());
    }

    #[tokio::test]
    async fn route_rejections_use_anthropic_envelope() {
        let cases = [
            (
                RouteRejection::UnknownAlias("a".into()),
                404,
                "not_found_error",
            ),
            (RouteRejection::Disabled("a".into()), 404, "not_found_error"),
            (
                RouteRejection::Forbidden("a".into()),
                403,
                "permission_error",
            ),
            (
                RouteRejection::NoEligibleAccounts("a".into()),
                429,
                "rate_limit_error",
            ),
            (
                RouteRejection::QuotaExhausted("a".into()),
                429,
                "rate_limit_error",
            ),
        ];
        for (rejection, code, kind) in cases {
            let (status, body) = body_json(route_rejection_response(rejection)).await;
            assert_eq!(status.as_u16(), code);
            assert_eq!(body["type"], "error");
            assert_eq!(body["error"]["type"], kind);
        }
    }

    #[tokio::test]
    async fn translate_error_is_invalid_request() {
        let resp = translate_error_response(&TranslateError::new("bad field"));
        let (status, body) = body_json(resp).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["type"], "error");
        assert_eq!(body["error"]["type"], "invalid_request_error");
        assert_eq!(body["error"]["message"], "bad field");
    }
}
