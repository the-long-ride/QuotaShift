use super::encode::ResponseEncoding;
use super::*;
use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use std::{
    collections::HashMap,
    convert::Infallible,
    sync::{Arc, Mutex},
};

pub(super) const CREATED: &str = "event: response.created\ndata: {\"type\":\"response.created\",\"response\":{\"id\":\"r1\"}}\n\n";
pub(super) const QUOTA: &str = "event: error\ndata: {\"type\":\"error\",\"error\":{\"code\":\"usage_limit_exceeded\",\"message\":\"limit reached\"}}\n\n";
pub(super) const DELTA_A: &str = "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"delta\":\"hello from A\"}\n\n";
pub(super) const DELTA_B: &str = "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"delta\":\"hello from B\"}\n\n";
pub(super) const DONE: &str = "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}}\n\n";

#[derive(Clone)]
pub(super) enum Script {
    Status(u16),
    Json(u16, &'static str),
    Sse(Vec<&'static str>),
    SseThenHang(Vec<&'static str>),
}

#[derive(Clone)]
pub(super) struct Mock {
    scripts: Arc<HashMap<String, Script>>,
    calls: Arc<Mutex<Vec<String>>>,
}

pub(super) fn sse(chunks: Vec<&'static str>, hang: bool) -> Response {
    let items = futures_util::stream::iter(
        chunks
            .into_iter()
            .map(|c| Ok::<_, Infallible>(Bytes::from(c))),
    );
    let body = if hang {
        Body::from_stream(items.chain(futures_util::stream::pending()))
    } else {
        Body::from_stream(items)
    };
    Response::builder()
        .header("content-type", "text/event-stream")
        .body(body)
        .unwrap()
}

pub(super) async fn handle(State(mock): State<Mock>, request: Request) -> Response {
    let token = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim_start_matches("Bearer ")
        .to_string();
    mock.calls.lock().unwrap().push(token.clone());
    match mock.scripts.get(&token).cloned() {
        Some(Script::Status(code)) => (
            StatusCode::from_u16(code).unwrap(),
            [("content-type", "application/json")],
            r#"{"error":{"code":"rate_limit_exceeded"}}"#,
        )
            .into_response(),
        Some(Script::Json(code, body)) => (
            StatusCode::from_u16(code).unwrap(),
            [("content-type", "application/json")],
            body,
        )
            .into_response(),
        Some(Script::Sse(chunks)) => sse(chunks, false),
        Some(Script::SseThenHang(chunks)) => sse(chunks, true),
        None => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub(super) struct Fixture {
    pub(super) manager: CodexRouterManager,
    pub(super) state: RouterAppState,
    calls: Arc<Mutex<Vec<String>>>,
}

pub(super) async fn fixture(scripts: Vec<(&str, Script)>) -> Fixture {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let mock = Mock {
        scripts: Arc::new(
            scripts
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
        ),
        calls: calls.clone(),
    };
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
        .await
        .unwrap();
    let upstream = format!("http://{}", listener.local_addr().unwrap());
    let app = axum::Router::new().fallback(handle).with_state(mock);
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
        oauth_base: upstream.clone(),
        api_base: upstream,
    });
    let config: CodexRouterConfig = serde_json::from_value(serde_json::json!({
        "accounts": [
            {"id":"a","auth":{"kind":"apiKey","apiKey":"key-a"},"availableModelIds":null,"quotaWindows":[],"usageFetchedAt":null,"modelCatalogFetchedAt":null},
            {"id":"b","auth":{"kind":"apiKey","apiKey":"key-b"},"availableModelIds":null,"quotaWindows":[],"usageFetchedAt":null,"modelCatalogFetchedAt":null}
        ],
        "pools":[],"poolsV2":[
            {"id":"p1","displayName":"P1","publicModelName":"profile-one","upstreamModelId":"gpt-test","enabled":true,"memberAccountIds":["a","b"],"modelSelectionMode":"manual","routingPolicy":"priority","authMode":"openai-api-key"}
        ],
        "appliedAccountId":null,"activePoolId":null
    }))
    .unwrap();
    manager.try_configure(config).await.unwrap();
    let state = manager.app_state(Arc::from("router-test"), Arc::from("127.0.0.1:1"));
    Fixture {
        manager,
        state,
        calls,
    }
}

pub(super) fn messages(stream: bool) -> ResponseEncoding {
    ResponseEncoding::AnthropicMessages {
        message_id: "msg_test".into(),
        alias: "profile-one".into(),
        stream,
    }
}

pub(super) fn encodings() -> Vec<ResponseEncoding> {
    vec![ResponseEncoding::Passthrough, messages(true)]
}

pub(super) async fn call(f: &Fixture, encode: ResponseEncoding) -> Response {
    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"model":"profile-one","input":"hi","stream":true}"#,
        ))
        .unwrap();
    forward_request(
        f.state.clone(),
        request,
        ClientContext::unrestricted(),
        encode,
    )
    .await
}

pub(super) async fn text(response: Response) -> (StatusCode, String) {
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, String::from_utf8_lossy(&bytes).to_string())
}

pub(super) fn calls(f: &Fixture) -> Vec<String> {
    f.calls.lock().unwrap().clone()
}

pub(super) fn ok_b() -> Script {
    Script::Sse(vec![CREATED, DELTA_B, DONE])
}

#[tokio::test]
pub(super) async fn quota_event_before_content_fails_over() {
    for encode in encodings() {
        let f = fixture(vec![
            ("key-a", Script::Sse(vec![CREATED, QUOTA])),
            ("key-b", ok_b()),
        ])
        .await;
        let (status, body) = text(call(&f, encode.clone()).await).await;
        assert_eq!(status, StatusCode::OK, "{encode:?}");
        assert!(body.contains("hello from B"), "{body}");
        assert!(!body.contains("usage_limit") && !body.contains("limit reached"));
        assert_eq!(calls(&f), ["key-a", "key-b"]);
        let _ = text(call(&f, encode).await).await;
        assert_eq!(calls(&f), ["key-a", "key-b", "key-b"], "A is backed off");
    }
}

#[tokio::test]
pub(super) async fn http_429_fails_over() {
    for encode in encodings() {
        let f = fixture(vec![("key-a", Script::Status(429)), ("key-b", ok_b())]).await;
        let (status, body) = text(call(&f, encode).await).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("hello from B"));
        assert_eq!(calls(&f), ["key-a", "key-b"]);
    }
}

#[tokio::test]
pub(super) async fn failure_after_content_does_not_fail_over() {
    for encode in encodings() {
        let f = fixture(vec![
            ("key-a", Script::Sse(vec![CREATED, DELTA_A, QUOTA])),
            ("key-b", ok_b()),
        ])
        .await;
        let (status, body) = text(call(&f, encode.clone()).await).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("hello from A"), "{body}");
        assert!(body.contains("event: error"), "{body}");
        assert!(!body.contains("hello from B"));
        assert_eq!(calls(&f), ["key-a"], "{encode:?}");
    }
}

#[tokio::test]
pub(super) async fn all_accounts_exhausted_returns_pool_exhausted() {
    let both = || {
        vec![
            ("key-a", Script::Sse(vec![CREATED, QUOTA])),
            ("key-b", Script::Sse(vec![CREATED, QUOTA])),
        ]
    };
    let f = fixture(both()).await;
    let (status, body) = text(call(&f, ResponseEncoding::Passthrough).await).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        body,
        "No eligible Codex account is available for this request"
    );

    let expected = "QuotaShift pool 'profile-one' has no account with remaining quota. Switch this Claude slot to another pool in QuotaShift.";
    let variants = [
        both(),
        vec![
            ("key-a", Script::Status(429)),
            ("key-b", Script::Status(429)),
        ],
    ];
    for scripts in variants {
        let f = fixture(scripts).await;
        let (status, body) = text(call(&f, messages(true)).await).await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(json["error"]["type"], "rate_limit_error");
        assert_eq!(json["error"]["message"], expected);
    }
}

#[tokio::test]
pub(super) async fn non_streaming_messages_aggregates_after_failover() {
    let f = fixture(vec![
        ("key-a", Script::Sse(vec![CREATED, QUOTA])),
        ("key-b", ok_b()),
    ])
    .await;
    let (status, body) = text(call(&f, messages(false)).await).await;
    assert_eq!(status, StatusCode::OK);
    let json: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(json["type"], "message");
    assert_eq!(json["content"][0]["text"], "hello from B");
    assert_eq!(json["stop_reason"], "end_turn");
}
