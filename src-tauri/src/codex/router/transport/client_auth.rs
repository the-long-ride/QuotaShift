use super::auth_guard::{has_valid_router_secret, single_header};
use super::route_context::ClientContext;
use super::types::RouterAppState;
use axum::http::HeaderMap;

pub async fn authenticated_client_context(
    state: &RouterAppState,
    headers: &HeaderMap,
) -> Option<ClientContext> {
    if has_valid_router_secret(headers, state.router_secret.as_bytes()) {
        return Some(ClientContext::unrestricted());
    }
    // The global Codex connector uses its own router header. A scoped client
    // must present exactly one bearer token without another router header.
    if headers.contains_key(crate::codex_sync::ROUTER_AUTH_HEADER) {
        return None;
    }
    let value = single_header(headers, "authorization")?.to_str().ok()?;
    let (scheme, secret) = value.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("Bearer") || secret.trim() != secret || secret.is_empty() {
        return None;
    }
    for binding in state.client_bindings.read().await.values() {
        if binding.verify_secret(secret) {
            return Some(ClientContext::from_binding(binding));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codex::router::{ClientBinding, CodexRouterManager};
    use axum::http::HeaderValue;
    use std::collections::HashSet;
    use std::sync::Arc;

    fn test_binding() -> ClientBinding {
        ClientBinding::with_secret(
            "profile-a".into(),
            Some("claude-native".into()),
            "test-gateway-value".into(),
            HashSet::from(["alias-one".to_string()]),
        )
    }

    #[tokio::test]
    async fn bearer_plus_x_api_key_authenticates() {
        let manager = CodexRouterManager::default();
        manager.register_client_binding(test_binding()).await;
        let state = manager.app_state(Arc::from("router-value"), Arc::from("127.0.0.1:1"));
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer test-gateway-value"),
        );
        headers.insert("x-api-key", HeaderValue::from_static("test-gateway-value"));
        assert!(authenticated_client_context(&state, &headers)
            .await
            .is_some());

        headers.insert("x-api-key", HeaderValue::from_static("other-words"));
        assert!(authenticated_client_context(&state, &headers)
            .await
            .is_some());

        headers.remove("authorization");
        assert!(authenticated_client_context(&state, &headers)
            .await
            .is_none());
    }

    #[tokio::test]
    async fn revoked_persisted_bindings_are_skipped() {
        let manager = CodexRouterManager::default().with_binding_loader(|| {
            let mut binding = test_binding();
            binding.revoke();
            Ok(vec![binding])
        });
        manager.restore_persisted_bindings().await;
        assert!(manager.client_bindings.read().await.is_empty());
    }

    #[tokio::test]
    async fn stalled_binding_loader_does_not_block_listener_start() {
        let manager = CodexRouterManager::default().with_binding_loader(|| {
            std::thread::sleep(std::time::Duration::from_millis(800));
            Ok(vec![test_binding()])
        });
        let started = std::time::Instant::now();
        let status = manager.start_listener().await.unwrap();
        assert!(status.running);
        assert!(started.elapsed() < std::time::Duration::from_millis(700));
        assert!(manager.client_bindings.read().await.is_empty());
        manager.stop_listener().await.unwrap();
    }

    #[tokio::test]
    async fn persisted_bindings_load_on_listener_start() {
        let manager =
            CodexRouterManager::default().with_binding_loader(|| Ok(vec![test_binding()]));
        assert!(manager.client_bindings.read().await.is_empty());
        manager.start_listener().await.unwrap();
        let map = manager.client_bindings.read().await;
        assert_eq!(map.len(), 1);
        assert!(map.values().any(|b| b.verify_secret("test-gateway-value")));
        drop(map);
        manager.stop_listener().await.unwrap();
    }
}
