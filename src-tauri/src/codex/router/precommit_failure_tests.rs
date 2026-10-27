use super::encode::ResponseEncoding;
use super::forward::{forward_request, MAX_ROUTER_REQUEST_BODY};
use super::precommit_tests::{
    call, calls, encodings, fixture, messages, ok_b, text, Fixture, Script, CREATED, DELTA_A, QUOTA,
};
use super::route_context::ClientContext;
use super::surface::router_surface;
use axum::{
    body::Body,
    extract::{Request, State},
    http::StatusCode,
};
use futures_util::StreamExt;
use std::time::Duration;

const FAILED_QUOTA: &str = "event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"usage_limit_exceeded\",\"message\":\"limit reached\"}}}\n\n";
const UNAUTHORIZED: &str = r#"{"error":{"message":"bad credentials"}}"#;

fn json(body: &str) -> serde_json::Value {
    serde_json::from_str(body).expect("json body")
}

#[tokio::test]
async fn response_failed_quota_before_content_fails_over() {
    for encode in [ResponseEncoding::Passthrough, messages(true)] {
        let f = fixture(vec![
            ("key-a", Script::Sse(vec![CREATED, FAILED_QUOTA])),
            ("key-b", ok_b()),
        ])
        .await;
        let (status, body) = text(call(&f, encode).await).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("hello from B") && !body.contains("limit reached"));
        assert_eq!(calls(&f), ["key-a", "key-b"]);
    }
}

#[tokio::test]
async fn http_401_fails_over_on_messages_encoding() {
    let f = fixture(vec![
        ("key-a", Script::Json(401, UNAUTHORIZED)),
        ("key-b", ok_b()),
    ])
    .await;
    let (status, body) = text(call(&f, messages(true)).await).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("hello from B"));
    assert_eq!(calls(&f), ["key-a", "key-b"]);
}

#[tokio::test]
async fn all_accounts_401_is_api_error_not_quota_text() {
    let f = fixture(vec![
        ("key-a", Script::Json(401, UNAUTHORIZED)),
        ("key-b", Script::Json(401, UNAUTHORIZED)),
    ])
    .await;
    let (status, body) = text(call(&f, messages(true)).await).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    let v = json(&body);
    assert_eq!(v["error"]["type"], "api_error");
    let message = v["error"]["message"].as_str().unwrap();
    assert!(message.contains("profile-one") && message.contains("authentication rejected"));
    assert!(!message.contains("remaining quota") && !message.contains("bad credentials"));
}

#[tokio::test]
async fn quota_then_auth_reports_last_failure_kind() {
    let f = fixture(vec![
        ("key-a", Script::Sse(vec![CREATED, QUOTA])),
        ("key-b", Script::Json(403, UNAUTHORIZED)),
    ])
    .await;
    let (status, body) = text(call(&f, messages(true)).await).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert!(body.contains("authentication rejected"));
}

#[tokio::test]
async fn non_retryable_400_surfaces_upstream_message() {
    let body = r#"{"error":{"message":"context length exceeded: 300000 tokens"}}"#;
    let f = fixture(vec![("key-a", Script::Json(400, body)), ("key-b", ok_b())]).await;
    let (status, out) = text(call(&f, messages(true)).await).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let v = json(&out);
    assert_eq!(v["error"]["type"], "invalid_request_error");
    assert_eq!(
        v["error"]["message"],
        "context length exceeded: 300000 tokens"
    );
    assert_eq!(calls(&f), ["key-a"], "a plain 400 must not fail over");
}

#[tokio::test]
async fn upstream_500_is_api_error_with_capped_message() {
    let long = "x".repeat(3000);
    let body: &'static str =
        Box::leak(format!(r#"{{"error":{{"message":"{long}"}}}}"#).into_boxed_str());
    let f = fixture(vec![("key-a", Script::Json(500, body))]).await;
    let (status, out) = text(call(&f, messages(true)).await).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    let v = json(&out);
    assert_eq!(v["error"]["type"], "api_error");
    assert_eq!(v["error"]["message"].as_str().unwrap().len(), 1000);

    let f = fixture(vec![("key-a", Script::Json(500, "not json"))]).await;
    let (_, out) = text(call(&f, messages(true)).await).await;
    assert_eq!(
        json(&out)["error"]["message"],
        "Upstream rejected the request"
    );
}

const LIMIT_BODY: &str = r#"{"error":{"code":"rate_limit_exceeded"}}"#;

#[tokio::test]
async fn exhausted_messages_answers_tell_claude_code_not_to_retry() {
    let f = fixture(vec![
        ("key-a", Script::Status(429)),
        ("key-b", Script::Status(429)),
    ])
    .await;
    let response = call(&f, messages(true)).await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(response.headers()["x-should-retry"], "false");

    let f = fixture(vec![
        ("key-a", Script::Json(401, UNAUTHORIZED)),
        ("key-b", Script::Json(401, UNAUTHORIZED)),
    ])
    .await;
    let response = call(&f, messages(true)).await;
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(response.headers()["x-should-retry"], "false");
}

#[tokio::test]
async fn passthrough_exhaustion_returns_the_last_upstream_429() {
    let f = fixture(vec![
        ("key-a", Script::Status(429)),
        ("key-b", Script::Status(429)),
    ])
    .await;
    let response = call(&f, ResponseEncoding::Passthrough).await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(response.headers()["content-type"], "application/json");
    let (_, body) = text(response).await;
    assert_eq!(body, LIMIT_BODY);
}

#[tokio::test]
async fn passthrough_exhaustion_hides_upstream_auth_bodies() {
    let f = fixture(vec![
        ("key-a", Script::Json(401, UNAUTHORIZED)),
        ("key-b", Script::Json(403, UNAUTHORIZED)),
    ])
    .await;
    let (status, body) = text(call(&f, ResponseEncoding::Passthrough).await).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(!body.contains("bad credentials"), "{body}");
}

#[tokio::test]
async fn messages_surface_errors_use_the_anthropic_envelope() {
    let f = fixture(vec![]).await;
    let post = |path: &str, host: &str| {
        Request::builder()
            .method("POST")
            .uri(path)
            .header("host", host)
            .body(Body::empty())
            .unwrap()
    };
    let cases = [
        ("/v1/messages", "127.0.0.1:1", 401, "authentication_error"),
        ("/v1/messages", "evil.example", 403, "permission_error"),
    ];
    for (path, host, code, kind) in cases {
        let response = router_surface(State(f.state.clone()), post(path, host)).await;
        assert_eq!(response.status().as_u16(), code);
        let (_, body) = text(response).await;
        let v = json(&body);
        assert_eq!(v["type"], "error", "{body}");
        assert_eq!(v["error"]["type"], kind);
        assert!(!v["error"]["message"].as_str().unwrap().is_empty());
    }
    // Other endpoints keep their bare statuses.
    let response =
        router_surface(State(f.state.clone()), post("/v1/responses", "127.0.0.1:1")).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(text(response).await.1.is_empty());
}

#[tokio::test]
async fn oversized_body_is_an_anthropic_413_only_for_messages() {
    let f = fixture(vec![]).await;
    for (encode, enveloped) in [
        (messages(true), true),
        (ResponseEncoding::Passthrough, false),
    ] {
        let request = Request::builder()
            .method("POST")
            .uri("/v1/responses")
            .body(Body::from(vec![b' '; MAX_ROUTER_REQUEST_BODY + 1]))
            .unwrap();
        let response = forward_request(
            f.state.clone(),
            request,
            ClientContext::unrestricted(),
            encode,
        )
        .await;
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
        let (_, body) = text(response).await;
        if enveloped {
            let v = json(&body);
            assert_eq!(v["type"], "error");
            assert_eq!(v["error"]["type"], "request_too_large");
        } else {
            assert_eq!(body, "Request body too large");
        }
    }
}

async fn released(f: &Fixture) -> bool {
    for _ in 0..100 {
        let in_flight = f.manager.status().await.in_flight_requests;
        if in_flight == 0 && f.state.budgets.in_flight_count("a") == 0 {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    false
}

#[tokio::test]
async fn client_drop_after_commit_releases_reservation() {
    for encode in encodings() {
        let f = fixture(vec![("key-a", Script::SseThenHang(vec![CREATED, DELTA_A]))]).await;
        let response = call(&f, encode.clone()).await;
        let mut body = response.into_body().into_data_stream();
        assert!(body.next().await.is_some());
        assert_eq!(f.state.budgets.in_flight_count("a"), 1);
        drop(body);
        assert!(released(&f).await, "{encode:?}");
        // A client hang-up is not an account failure: nothing is backed off.
        assert!(f
            .state
            .selection_state
            .lock()
            .await
            .backoff_until
            .is_empty());
        assert_eq!(calls(&f), ["key-a"]);
    }
}
