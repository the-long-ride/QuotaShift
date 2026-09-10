use super::types::{CodexRouterAuth, RouterRouteDecision, RouterUpstreams};

pub fn route_decision(method: &str, path: &str) -> RouterRouteDecision {
    match path {
        "/health" => {
            if method == "GET" {
                RouterRouteDecision::Health
            } else {
                RouterRouteDecision::MethodNotAllowed
            }
        }
        "/responses" | "/responses/compact" | "/v1/responses" | "/v1/responses/compact" => {
            if method == "POST" {
                RouterRouteDecision::Forward
            } else {
                RouterRouteDecision::MethodNotAllowed
            }
        }
        "/models" | "/v1/models" => {
            if method == "GET" {
                RouterRouteDecision::Forward
            } else {
                RouterRouteDecision::MethodNotAllowed
            }
        }
        _ => RouterRouteDecision::NotFound,
    }
}

pub fn normalized_forward_path(path: &str) -> Option<&str> {
    match path {
        "/responses" | "/responses/compact" | "/models" => Some(path),
        "/v1/responses" | "/v1/responses/compact" | "/v1/models" => path.strip_prefix("/v1"),
        _ => None,
    }
}

pub fn upstream_url(
    upstreams: &RouterUpstreams,
    auth: &CodexRouterAuth,
    path: &str,
    query: Option<&str>,
) -> Option<String> {
    let normalized = normalized_forward_path(path)?;
    let base = match auth {
        CodexRouterAuth::OAuth { .. } => upstreams.oauth_base.as_str(),
        CodexRouterAuth::ApiKey { .. } => upstreams.api_base.as_str(),
    };
    let mut url = format!("{}{}", base.trim_end_matches('/'), normalized);
    if let Some(query) = query.filter(|query| !query.is_empty()) {
        url.push('?');
        url.push_str(query);
    }
    Some(url)
}
