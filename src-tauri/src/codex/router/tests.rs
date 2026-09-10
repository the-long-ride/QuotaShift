use super::*;
use axum::{
    body::{Body, Bytes},
    extract::Request,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};

mod selection_tests {
    use super::*;
    use std::time::Duration;

    fn oauth_account(
        id: &str,
        models: Option<Vec<&str>>,
        windows: Vec<f64>,
        fetched_at: Option<i64>,
    ) -> CodexRouterAccount {
        CodexRouterAccount {
            id: id.to_string(),
            auth: CodexRouterAuth::OAuth {
                access_token: format!("token-{id}"),
                refresh_token: None,
                chatgpt_account_id: format!("chatgpt-{id}"),
            },
            available_model_ids: models
                .map(|items| items.into_iter().map(str::to_string).collect()),
            quota_windows: windows
                .into_iter()
                .map(|remaining_percent| RouterQuotaWindow {
                    remaining_percent,
                    duration_minutes: None,
                })
                .collect(),
            usage_fetched_at: fetched_at,
            model_catalog_fetched_at: None,
        }
    }

    fn pool(
        id: &str,
        model: &str,
        account_ids: &[&str],
        mode: &str,
        activated_at: i64,
    ) -> CodexRouterPool {
        CodexRouterPool {
            id: id.to_string(),
            model: model.to_string(),
            account_ids: account_ids.iter().map(|id| (*id).to_string()).collect(),
            model_selection_mode: mode.to_string(),
            activated_at,
        }
    }

    fn config(accounts: Vec<CodexRouterAccount>, pools: Vec<CodexRouterPool>) -> CodexRouterConfig {
        CodexRouterConfig {
            accounts,
            pools,
            applied_account_id: None,
        }
    }

    #[test]
    fn bottleneck_score_uses_minimum_known_remaining_window() {
        let hundred_one = oauth_account("a", None, vec![100.0, 1.0], Some(10));
        let sixty_sixty = oauth_account("b", None, vec![60.0, 60.0], Some(10));
        let weekly_only = oauth_account("c", None, vec![42.0], Some(10));
        let unknown = oauth_account("d", None, vec![], None);

        assert_eq!(bottleneck_score(&hundred_one), Some(1.0));
        assert_eq!(bottleneck_score(&sixty_sixty), Some(60.0));
        assert_eq!(bottleneck_score(&weekly_only), Some(42.0));
        assert_eq!(bottleneck_score(&unknown), None);
    }

    #[test]
    fn discovered_pool_excludes_member_that_does_not_confirm_model() {
        let cfg = config(
            vec![
                oauth_account("missing", Some(vec!["gpt-other"]), vec![90.0], Some(10)),
                oauth_account("supported", Some(vec!["gpt-target"]), vec![40.0], Some(10)),
            ],
            vec![pool(
                "strict",
                "gpt-target",
                &["missing", "supported"],
                "discovered",
                1,
            )],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("supported".to_string())
        );
    }

    #[test]
    fn manual_pool_keeps_unconfirmed_member_eligible() {
        let cfg = config(
            vec![
                oauth_account("manual", Some(vec!["gpt-other"]), vec![90.0], Some(10)),
                oauth_account("other", Some(vec!["gpt-target"]), vec![40.0], Some(10)),
            ],
            vec![pool(
                "manual-pool",
                "gpt-target",
                &["manual", "other"],
                "manual",
                1,
            )],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("manual".to_string())
        );
    }

    #[test]
    fn exact_ties_rotate_deterministically() {
        let cfg = config(
            vec![
                oauth_account("a", Some(vec!["gpt-target"]), vec![50.0], Some(10)),
                oauth_account("b", Some(vec!["gpt-target"]), vec![50.0], Some(10)),
            ],
            vec![pool("p", "gpt-target", &["a", "b"], "discovered", 1)],
        );
        let mut state = RouterRuntimeState::default();

        let first = state.select_account_for_model(&cfg, "gpt-target");
        let second = state.select_account_for_model(&cfg, "gpt-target");

        assert_eq!(first, Some("a".to_string()));
        assert_eq!(second, Some("b".to_string()));
    }

    #[test]
    fn completeness_and_freshness_break_score_ties_before_round_robin() {
        let cfg = config(
            vec![
                oauth_account("older", Some(vec!["gpt-target"]), vec![50.0], Some(10)),
                oauth_account(
                    "complete",
                    Some(vec!["gpt-target"]),
                    vec![50.0, 80.0],
                    Some(20),
                ),
            ],
            vec![pool(
                "p",
                "gpt-target",
                &["older", "complete"],
                "discovered",
                1,
            )],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("complete".to_string())
        );
    }

    #[test]
    fn backoff_is_scoped_to_account_and_model() {
        let cfg = config(
            vec![
                oauth_account("a", None, vec![90.0], Some(10)),
                oauth_account("b", None, vec![50.0], Some(10)),
            ],
            vec![
                pool("x", "model-x", &["a", "b"], "manual", 2),
                pool("y", "model-y", &["a", "b"], "manual", 1),
            ],
        );
        let mut state = RouterRuntimeState::default();
        state.mark_backoff("a", "model-x", Duration::from_secs(FAILURE_BACKOFF_SECS));

        assert_eq!(
            state.select_account_for_model(&cfg, "model-x"),
            Some("b".to_string())
        );
        assert_eq!(
            state.select_account_for_model(&cfg, "model-y"),
            Some("a".to_string())
        );
    }

    #[test]
    fn newest_matching_pool_wins() {
        let cfg = config(
            vec![
                oauth_account("old", None, vec![99.0], Some(10)),
                oauth_account("new", None, vec![1.0], Some(10)),
            ],
            vec![
                pool("old-pool", "gpt-target", &["old"], "manual", 10),
                pool("new-pool", "gpt-target", &["new"], "manual", 20),
            ],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("new".to_string())
        );
    }

    #[test]
    fn unmatched_model_falls_back_to_applied_account_and_unknown_quota_is_not_zero() {
        let mut cfg = config(vec![oauth_account("applied", None, vec![], None)], vec![]);
        cfg.applied_account_id = Some("applied".to_string());
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "unmatched-model"),
            Some("applied".to_string())
        );
    }
}

#[cfg(test)]
mod listener_tests {
    use super::*;

    #[test]
    fn route_surface_allows_only_explicit_codex_paths_and_methods() {
        for path in [
            "/responses",
            "/responses/compact",
            "/v1/responses",
            "/v1/responses/compact",
        ] {
            assert_eq!(route_decision("POST", path), RouterRouteDecision::Forward);
            assert_eq!(
                route_decision("GET", path),
                RouterRouteDecision::MethodNotAllowed
            );
        }

        for path in ["/models", "/v1/models"] {
            assert_eq!(route_decision("GET", path), RouterRouteDecision::Forward);
            assert_eq!(
                route_decision("POST", path),
                RouterRouteDecision::MethodNotAllowed
            );
        }

        assert_eq!(
            route_decision("GET", "/health"),
            RouterRouteDecision::Health
        );
        assert_eq!(
            route_decision("POST", "/health"),
            RouterRouteDecision::MethodNotAllowed
        );
        assert_eq!(
            route_decision("GET", "/anything-else"),
            RouterRouteDecision::NotFound
        );
        assert_eq!(
            route_decision("POST", "/v1/chat/completions"),
            RouterRouteDecision::NotFound
        );
    }

    #[test]
    fn duplicate_origin_headers_are_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "host",
            axum::http::HeaderValue::from_static("127.0.0.1:29105"),
        );
        headers.append(
            "origin",
            axum::http::HeaderValue::from_static("http://127.0.0.1:29105"),
        );
        headers.append(
            "origin",
            axum::http::HeaderValue::from_static("https://evil.example"),
        );

        assert!(!trusted_request_origin_and_host(
            &headers,
            "127.0.0.1:29105"
        ));
    }

    #[tokio::test]
    async fn manager_binds_only_loopback_on_an_os_assigned_port_and_health_is_live() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        let status = manager.start_listener().await.expect("router should start");

        assert!(status.running);
        let base_url = status
            .base_url
            .expect("running router should expose base URL");
        assert!(base_url.starts_with("http://127.0.0.1:"), "{base_url}");
        assert!(!base_url.ends_with(":0"), "OS must assign a non-zero port");

        let health = reqwest::Client::new()
            .get(format!("{base_url}/health"))
            .send()
            .await
            .expect("health request should connect");
        assert_eq!(health.status(), reqwest::StatusCode::OK);

        manager.stop_listener().await.expect("router should stop");
    }

    #[tokio::test]
    async fn unsupported_routes_are_rejected_by_listener_surface() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        let status = manager.start_listener().await.expect("router should start");
        let base_url = status.base_url.expect("base URL");
        let client = reqwest::Client::new();

        let unknown = client
            .get(format!("{base_url}/v1/chat/completions"))
            .send()
            .await
            .expect("request should reach local router");
        assert_eq!(unknown.status(), reqwest::StatusCode::NOT_FOUND);

        let wrong_method = client
            .get(format!("{base_url}/responses"))
            .send()
            .await
            .expect("request should reach local router");
        assert_eq!(
            wrong_method.status(),
            reqwest::StatusCode::METHOD_NOT_ALLOWED
        );

        manager.stop_listener().await.expect("router should stop");
    }
}

// QUOTASHIFT_CODEX_ROUTER_TASK3_FORWARDING_TESTS
#[cfg(test)]
mod forwarding_tests {
    use super::*;
    use axum::{body::to_bytes, extract::State};
    use std::sync::Arc;

    #[derive(Clone, Debug)]
    struct CapturedRequest {
        method: String,
        path: String,
        query: Option<String>,
        authorization: Option<String>,
        account_id: Option<String>,
        content_type: Option<String>,
        accept: Option<String>,
        body: Vec<u8>,
    }

    #[derive(Clone, Default)]
    struct CaptureState {
        requests: Arc<AsyncMutex<Vec<CapturedRequest>>>,
    }

    async fn capture_upstream(State(state): State<CaptureState>, request: Request) -> Response {
        let (parts, body) = request.into_parts();
        let body = to_bytes(body, 1024 * 1024).await.expect("capture body");
        let authorization = parts
            .headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let account_id = parts
            .headers
            .get("chatgpt-account-id")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let content_type = parts
            .headers
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let accept = parts
            .headers
            .get("accept")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);

        state.requests.lock().await.push(CapturedRequest {
            method: parts.method.to_string(),
            path: parts.uri.path().to_string(),
            query: parts.uri.query().map(str::to_string),
            authorization: authorization.clone(),
            account_id,
            content_type,
            accept,
            body: body.to_vec(),
        });

        match authorization.as_deref() {
            Some("Bearer token-a") => (
                StatusCode::TOO_MANY_REQUESTS,
                [("content-type", "application/json")],
                r#"{"error":{"code":"rate_limit_exceeded"}}"#,
            )
                .into_response(),
            Some("Bearer token-modelbad") => (
                StatusCode::NOT_FOUND,
                [("content-type", "application/json")],
                r#"{"error":{"code":"model_not_found"}}"#,
            )
                .into_response(),
            _ => (
                StatusCode::CREATED,
                [
                    ("content-type", "application/json"),
                    ("x-router-test", "ok"),
                ],
                r#"{"ok":true}"#,
            )
                .into_response(),
        }
    }

    async fn start_mock_upstream() -> (String, CaptureState, oneshot::Sender<()>, JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("bind mock upstream");
        let address = listener.local_addr().expect("mock address");
        let state = CaptureState::default();
        let app = Router::new()
            .fallback(capture_upstream)
            .with_state(state.clone());
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let task = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });
        (format!("http://{address}"), state, shutdown_tx, task)
    }

    fn oauth(id: &str, token: &str, score: f64) -> CodexRouterAccount {
        CodexRouterAccount {
            id: id.to_string(),
            auth: CodexRouterAuth::OAuth {
                access_token: token.to_string(),
                refresh_token: None,
                chatgpt_account_id: format!("chatgpt-{id}"),
            },
            available_model_ids: Some(vec!["gpt-test".to_string()]),
            quota_windows: vec![RouterQuotaWindow {
                remaining_percent: score,
                duration_minutes: Some(300.0),
            }],
            usage_fetched_at: Some(10),
            model_catalog_fetched_at: None,
        }
    }

    fn api_key(id: &str, key: &str) -> CodexRouterAccount {
        CodexRouterAccount {
            id: id.to_string(),
            auth: CodexRouterAuth::ApiKey {
                api_key: key.to_string(),
            },
            available_model_ids: None,
            quota_windows: vec![],
            usage_fetched_at: None,
            model_catalog_fetched_at: None,
        }
    }

    fn router_config(
        accounts: Vec<CodexRouterAccount>,
        pools: Vec<CodexRouterPool>,
        applied: Option<&str>,
    ) -> CodexRouterConfig {
        CodexRouterConfig {
            accounts,
            pools,
            applied_account_id: applied.map(str::to_string),
        }
    }

    #[test]
    fn response_model_extraction_is_top_level_only_and_keeps_original_bytes_separate() {
        let body = Bytes::from_static(br#"{"model":"gpt-test","input":"PRIVATE-PROMPT"}"#);
        assert_eq!(extract_requested_model(&body).as_deref(), Some("gpt-test"));

        let nested = Bytes::from_static(br#"{"input":{"model":"nested"}}"#);
        assert_eq!(extract_requested_model(&nested), None);
        assert!(std::str::from_utf8(&body)
            .unwrap()
            .contains("PRIVATE-PROMPT"));
    }

    #[tokio::test]
    async fn listener_authenticates_before_forwarding_or_body_processing() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![oauth("oauth", "oauth-secret", 80.0)],
                vec![],
                Some("oauth"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let client = reqwest::Client::new();
        let body = r#"{"model":"gpt-test","input":"PRIVATE-PROMPT"}"#;

        let missing = client
            .post(format!("{base}/responses"))
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
            .expect("missing-secret response");
        assert_eq!(missing.status(), reqwest::StatusCode::UNAUTHORIZED);

        let wrong = client
            .post(format!("{base}/responses"))
            .header("authorization", "Bearer wrong-secret")
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
            .expect("wrong-secret response");
        assert_eq!(wrong.status(), reqwest::StatusCode::UNAUTHORIZED);
        assert!(capture.requests.lock().await.is_empty());

        let secret = manager.listener_secret_for_test().await;
        let valid = client
            .post(format!("{base}/responses"))
            .header(ROUTER_AUTH_HEADER, &secret)
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
            .expect("valid-secret response");
        assert_eq!(valid.status(), reqwest::StatusCode::CREATED);
        assert_eq!(capture.requests.lock().await.len(), 1);

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn listener_secret_is_rotated_after_restart() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![oauth("oauth", "oauth-secret", 80.0)],
                vec![],
                Some("oauth"),
            ))
            .await;
        manager.start_listener().await.expect("first start");
        let old_secret = manager.listener_secret_for_test().await;
        manager.stop_listener().await.expect("first stop");

        let second = manager.start_listener().await.expect("second start");
        let second_base = second.base_url.expect("second URL");
        let new_secret = manager.listener_secret_for_test().await;
        assert_ne!(old_secret, new_secret);
        let status_json = serde_json::to_string(&manager.status().await).unwrap();
        assert!(!status_json.contains(&new_secret));

        let stale = reqwest::Client::new()
            .post(format!("{second_base}/responses"))
            .header(ROUTER_AUTH_HEADER, &old_secret)
            .header("content-type", "application/json")
            .body(r#"{"model":"gpt-test","input":"stale"}"#)
            .send()
            .await
            .expect("stale-secret response");
        assert_eq!(stale.status(), reqwest::StatusCode::UNAUTHORIZED);
        assert!(capture.requests.lock().await.is_empty());

        manager.stop_listener().await.expect("second stop");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn hostile_origin_and_host_are_rejected_before_upstream() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![oauth("oauth", "oauth-secret", 80.0)],
                vec![],
                Some("oauth"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let secret = manager.listener_secret_for_test().await;
        let client = reqwest::Client::new();

        let hostile_origin = client
            .post(format!("{base}/responses"))
            .header(ROUTER_AUTH_HEADER, &secret)
            .header("origin", "https://evil.example")
            .header("content-type", "application/json")
            .body(r#"{"model":"gpt-test","input":"origin"}"#)
            .send()
            .await
            .expect("hostile-origin response");
        assert_eq!(hostile_origin.status(), reqwest::StatusCode::FORBIDDEN);

        let hostile_host = client
            .post(format!("{base}/responses"))
            .header(ROUTER_AUTH_HEADER, &secret)
            .header("host", "evil.example")
            .header("content-type", "application/json")
            .body(r#"{"model":"gpt-test","input":"host"}"#)
            .send()
            .await
            .expect("hostile-host response");
        assert_eq!(hostile_host.status(), reqwest::StatusCode::FORBIDDEN);
        assert!(capture.requests.lock().await.is_empty());

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn oauth_forwarding_preserves_request_shape_and_replaces_incoming_credentials() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![oauth("oauth", "oauth-secret", 80.0)],
                vec![],
                Some("oauth"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let router_secret = manager.listener_secret_for_test().await;
        let private_body = r#"{"model":"gpt-test","input":"PRIVATE-PROMPT"}"#;

        let response = reqwest::Client::new()
            .post(format!("{base}/responses?trace=1"))
            .header(ROUTER_AUTH_HEADER, &router_secret)
            .header("authorization", "Bearer incoming-secret")
            .header("chatgpt-account-id", "incoming-account")
            .header("content-type", "application/json")
            .header("accept", "text/event-stream")
            .body(private_body)
            .send()
            .await
            .expect("forwarded response");
        assert_eq!(response.status(), reqwest::StatusCode::CREATED);
        assert_eq!(response.headers().get("x-router-test").unwrap(), "ok");

        let requests = capture.requests.lock().await;
        assert_eq!(requests.len(), 1);
        let request = &requests[0];
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/responses");
        assert_eq!(request.query.as_deref(), Some("trace=1"));
        assert_eq!(
            request.authorization.as_deref(),
            Some("Bearer oauth-secret")
        );
        assert_eq!(request.account_id.as_deref(), Some("chatgpt-oauth"));
        assert_eq!(request.content_type.as_deref(), Some("application/json"));
        assert_eq!(request.accept.as_deref(), Some("text/event-stream"));
        assert_eq!(request.body, private_body.as_bytes());
        drop(requests);

        let diagnostic = router_diagnostic("oauth", Some("gpt-test"), 201, "forwarded");
        assert!(diagnostic.contains("oauth"));
        assert!(diagnostic.contains("gpt-test"));
        assert!(!diagnostic.contains("oauth-secret"));
        assert!(!diagnostic.contains("PRIVATE-PROMPT"));

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn api_key_models_request_injects_only_api_key_auth() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![api_key("api", "sk-test-secret")],
                vec![],
                Some("api"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let router_secret = manager.listener_secret_for_test().await;

        let response = reqwest::Client::new()
            .get(format!("{base}/v1/models?limit=2"))
            .header(ROUTER_AUTH_HEADER, &router_secret)
            .header("authorization", "Bearer incoming-secret")
            .header("chatgpt-account-id", "incoming-account")
            .send()
            .await
            .expect("forwarded response");
        assert_eq!(response.status(), reqwest::StatusCode::CREATED);

        let requests = capture.requests.lock().await;
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].path, "/models");
        assert_eq!(requests[0].query.as_deref(), Some("limit=2"));
        assert_eq!(
            requests[0].authorization.as_deref(),
            Some("Bearer sk-test-secret")
        );
        assert_eq!(requests[0].account_id, None);
        drop(requests);

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn quota_failure_retries_next_eligible_member_before_downstream_commit() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![oauth("a", "token-a", 90.0), oauth("b", "token-b", 80.0)],
                vec![CodexRouterPool {
                    id: "pool".to_string(),
                    model: "gpt-test".to_string(),
                    account_ids: vec!["a".to_string(), "b".to_string()],
                    model_selection_mode: "discovered".to_string(),
                    activated_at: 10,
                }],
                Some("a"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let router_secret = manager.listener_secret_for_test().await;

        let response = reqwest::Client::new()
            .post(format!("{base}/responses"))
            .header(ROUTER_AUTH_HEADER, &router_secret)
            .header("content-type", "application/json")
            .body(r#"{"model":"gpt-test","input":"hello"}"#)
            .send()
            .await
            .expect("router response");
        assert_eq!(response.status(), reqwest::StatusCode::CREATED);

        let requests = capture.requests.lock().await;
        let auth: Vec<_> = requests
            .iter()
            .map(|request| request.authorization.clone().unwrap_or_default())
            .collect();
        assert_eq!(auth, vec!["Bearer token-a", "Bearer token-b"]);
        drop(requests);

        let status = manager.status().await;
        assert_eq!(status.last_routed_account_id.as_deref(), Some("b"));
        assert_eq!(status.last_routed_model.as_deref(), Some("gpt-test"));
        assert_eq!(status.routed_request_count, 1);

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn definitive_model_failure_marks_manual_candidate_incompatible() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![
                    oauth("bad", "token-modelbad", 95.0),
                    oauth("good", "token-good", 70.0),
                ],
                vec![CodexRouterPool {
                    id: "manual".to_string(),
                    model: "gpt-test".to_string(),
                    account_ids: vec!["bad".to_string(), "good".to_string()],
                    model_selection_mode: "manual".to_string(),
                    activated_at: 10,
                }],
                Some("bad"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let client = reqwest::Client::new();
        let router_secret = manager.listener_secret_for_test().await;

        for _ in 0..2 {
            let response = client
                .post(format!("{base}/responses"))
                .header(ROUTER_AUTH_HEADER, &router_secret)
                .header("content-type", "application/json")
                .body(r#"{"model":"gpt-test","input":"hello"}"#)
                .send()
                .await
                .expect("router response");
            assert_eq!(response.status(), reqwest::StatusCode::CREATED);
        }

        let requests = capture.requests.lock().await;
        let auth: Vec<_> = requests
            .iter()
            .map(|request| request.authorization.clone().unwrap_or_default())
            .collect();
        assert_eq!(
            auth,
            vec![
                "Bearer token-modelbad",
                "Bearer token-good",
                "Bearer token-good",
            ]
        );
        drop(requests);

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }
}

// QUOTASHIFT_CODEX_ROUTER_TASK7_COVERAGE_TESTS
#[cfg(test)]
mod client_coverage_tests {
    use super::*;

    #[tokio::test]
    async fn status_reports_only_configured_shared_provider_coverage() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        let status = manager.status().await;

        assert_eq!(status.client_coverage.len(), 1);
        assert_eq!(
            status
                .client_coverage
                .get("sharedProvider")
                .map(String::as_str),
            Some("configured")
        );
    }
}

// QUOTASHIFT_CODEX_ROUTER_REVIEW_RUNTIME_TESTS
#[cfg(test)]
mod router_review_runtime_tests {
    use super::*;
    use std::convert::Infallible;

    fn review_config(mode: &str, catalog_fetched_at: i64) -> CodexRouterConfig {
        serde_json::from_value(serde_json::json!({
            "accounts": [{
                "id": "a",
                "auth": {
                    "kind": "oAuth",
                    "accessToken": "token-a",
                    "refreshToken": null,
                    "chatgptAccountId": "chatgpt-a"
                },
                "availableModelIds": ["gpt-review"],
                "quotaWindows": [{"remainingPercent": 80.0, "durationMinutes": 300.0}],
                "usageFetchedAt": 10,
                "modelCatalogFetchedAt": catalog_fetched_at
            }],
            "pools": [{
                "id": "pool",
                "model": "gpt-review",
                "accountIds": ["a"],
                "modelSelectionMode": mode,
                "activatedAt": 10
            }],
            "appliedAccountId": "a"
        }))
        .unwrap()
    }

    #[test]
    fn frontend_camel_case_auth_payload_deserializes() {
        let parsed = serde_json::from_value::<CodexRouterConfig>(serde_json::json!({
            "accounts": [{
                "id": "a",
                "auth": {
                    "kind": "oAuth",
                    "accessToken": "token-a",
                    "refreshToken": null,
                    "chatgptAccountId": "chatgpt-a"
                },
                "availableModelIds": null,
                "quotaWindows": [],
                "usageFetchedAt": null
            }],
            "pools": [],
            "appliedAccountId": "a"
        }));
        assert!(
            parsed.is_ok(),
            "frontend camelCase auth fields must deserialize: {parsed:?}"
        );
    }

    async fn selected(manager: &CodexRouterManager) -> Option<String> {
        let config = manager.config.lock().await.clone().unwrap();
        manager
            .selection_state
            .lock()
            .await
            .select_account_for_model(&config, "gpt-review")
    }

    #[tokio::test]
    async fn successful_catalog_rescan_clears_model_incompatibility() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        manager.configure(review_config("manual", 100)).await;
        manager
            .selection_state
            .lock()
            .await
            .mark_model_incompatible("a", "gpt-review");
        assert_eq!(selected(&manager).await, None);

        manager.configure(review_config("manual", 200)).await;
        assert_eq!(selected(&manager).await.as_deref(), Some("a"));
    }

    #[tokio::test]
    async fn explicit_pool_routing_edit_clears_model_incompatibility() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        manager.configure(review_config("manual", 100)).await;
        manager
            .selection_state
            .lock()
            .await
            .mark_model_incompatible("a", "gpt-review");
        assert_eq!(selected(&manager).await, None);

        manager.configure(review_config("discovered", 100)).await;
        assert_eq!(selected(&manager).await.as_deref(), Some("a"));
    }

    async fn slow_stream_upstream() -> Response {
        let stream = futures_util::stream::unfold(0u8, |state| async move {
            match state {
                0 => Some((Ok::<Bytes, Infallible>(Bytes::from_static(b"first")), 1)),
                1 => {
                    tokio::time::sleep(Duration::from_millis(350)).await;
                    Some((Ok::<Bytes, Infallible>(Bytes::from_static(b"second")), 2))
                }
                _ => None,
            }
        });
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "application/octet-stream")
            .body(Body::from_stream(stream))
            .unwrap()
    }

    #[tokio::test]
    async fn in_flight_count_lives_until_stream_body_finishes() {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let app = Router::new().fallback(slow_stream_upstream);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let upstream_task = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        let upstream = format!("http://{address}");
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager.configure(review_config("manual", 100)).await;
        let status = manager.start_listener().await.unwrap();
        let base = status.base_url.unwrap();
        let router_secret = manager.listener_secret_for_test().await;

        let response = reqwest::Client::new()
            .post(format!("{base}/responses"))
            .header(ROUTER_AUTH_HEADER, &router_secret)
            .header("content-type", "application/json")
            .body(r#"{"model":"gpt-review","input":"hello"}"#)
            .send()
            .await
            .unwrap();

        assert_eq!(
            manager.in_flight.load(Ordering::SeqCst),
            1,
            "streaming response must remain in flight after headers"
        );
        let body = response.bytes().await.unwrap();
        assert_eq!(body.as_ref(), b"firstsecond");
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert_eq!(manager.in_flight.load(Ordering::SeqCst), 0);

        manager.stop_listener().await.unwrap();
        let _ = shutdown_tx.send(());
        let _ = upstream_task.await;
    }
}
