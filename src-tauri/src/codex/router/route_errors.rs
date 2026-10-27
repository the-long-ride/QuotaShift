use super::response_utils::build_buffered_response;
use super::route_context::RouteRejection;
use axum::{
    body::Bytes,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};

pub fn route_error_response(rejection: RouteRejection) -> Response {
    let (status, alias, message, error_type) = match rejection {
        RouteRejection::UnknownAlias(alias) => (
            StatusCode::NOT_FOUND,
            alias.clone(),
            format!("Model alias '{alias}' is not routed"),
            "model_not_routed",
        ),
        RouteRejection::Forbidden(alias) => (
            StatusCode::FORBIDDEN,
            alias.clone(),
            format!("Access to model alias '{alias}' is forbidden"),
            "model_not_authorized",
        ),
        RouteRejection::Disabled(alias) => (
            StatusCode::NOT_FOUND,
            alias.clone(),
            format!("Model alias '{alias}' is disabled"),
            "model_not_routed",
        ),
        other => return (StatusCode::BAD_REQUEST, other.to_string()).into_response(),
    };
    let body = serde_json::json!({
        "error": { "message": message, "type": error_type,
                   "code": status.as_u16(), "model": alias }
    });
    build_buffered_response(
        status,
        &HeaderMap::new(),
        Bytes::from(serde_json::to_vec(&body).unwrap_or_default()),
    )
}
