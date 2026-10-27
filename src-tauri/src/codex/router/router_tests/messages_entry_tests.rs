use super::messages_entry::{handle_count_tokens, handle_messages, resolve_messages_alias};
use super::*;
use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

const CREATED: &str = "event: response.created\ndata: {\"type\":\"response.created\",\"response\":{\"id\":\"r1\"}}\n\n";
const TEXT: &str = "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"delta\":\"all done\"}\n\n";
const CALL_ADDED: &str = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"type\":\"function_call\",\"call_id\":\"call_abc\",\"name\":\"get_weather\"}}\n\n";
const CALL_ARGS: &str = "event: response.function_call_arguments.delta\ndata: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":0,\"delta\":\"{\\\"city\\\":\\\"Hue\\\"}\"}\n\n";
const CALL_DONE: &str = "event: response.output_item.done\ndata: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"type\":\"function_call\",\"call_id\":\"call_abc\",\"name\":\"get_weather\",\"arguments\":\"{\\\"city\\\":\\\"Hue\\\"}\"}}\n\n";
const DONE: &str = "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}}\n\n";
const DONE_CACHED: &str = "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":1000,\"output_tokens\":25,\"input_tokens_details\":{\"cached_tokens\":800},\"output_tokens_details\":{\"reasoning_tokens\":10}}}}\n\n";

#[tokio::test]
async fn router_accumulates_token_and_cache_telemetry_without_storing_payloads() {
    let f = fixture(vec![
        vec![CREATED, TEXT, DONE_CACHED],
        vec![CREATED, TEXT, DONE],
        vec![CREATED, TEXT, DONE_CACHED],
    ])
    .await;
    let ctx = ClientContext::unrestricted();
    let (status, body) = send(&f, ctx.clone(), user("gpt-default", "first")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["usage"]["input_tokens"], 200);
    assert_eq!(body["usage"]["output_tokens"], 25);
    assert_eq!(body["usage"]["cache_read_input_tokens"], 800);

    let (status2, _) = send(&f, ctx, user("gpt-default", "second")).await;
    assert_eq!(status2, StatusCode::OK);

    let stream_body = json!({"model": "gpt-default", "max_tokens": 64, "stream": true,
        "metadata": {"user_id": "user_1_session_abc"}, "messages": [{"role": "user", "content": "s"}]});
    let stream_req = Request::builder()
        .method("POST")
        .uri("/v1/messages")
        .header("content-type", "application/json")
        .header("x-claude-code-session-id", "sess-uuid-999")
        .body(Body::from(stream_body.to_string()))
        .unwrap();
    let stream_res =
        handle_messages(f.state.clone(), stream_req, ClientContext::unrestricted()).await;
    assert_eq!(stream_res.status(), StatusCode::OK);
    let _ = to_bytes(stream_res.into_body(), usize::MAX).await.unwrap();

    let snap = f.state.usage_telemetry.snapshot();
    assert_eq!(snap.total_input_tokens, 2001);
    assert_eq!(snap.total_output_tokens, 51);
    assert_eq!(snap.total_cached_tokens, 1600);
    assert_eq!(snap.total_reasoning_tokens, 20);
    assert_eq!(snap.cache_hit_requests, 2);
    let cache_key = f.bodies.lock().unwrap()[2]["prompt_cache_key"]
        .as_str()
        .unwrap_or("")
        .to_string();
    assert!(!cache_key.is_empty() && cache_key.len() <= 64);
}

#[derive(Clone)]
struct Mock {
    replies: Arc<Vec<Vec<&'static str>>>,
    bodies: Arc<Mutex<Vec<Value>>>,
}

async fn handle(State(mock): State<Mock>, request: Request) -> Response {
    let bytes = to_bytes(request.into_body(), usize::MAX).await.unwrap();
    let mut bodies = mock.bodies.lock().unwrap();
    let index = bodies.len().min(mock.replies.len() - 1);
    bodies.push(serde_json::from_slice(&bytes).unwrap_or(Value::Null));
    let chunks: String = mock.replies[index].concat();
    Response::builder()
        .header("content-type", "text/event-stream")
        .body(Body::from(Bytes::from(chunks)))
        .unwrap()
        .into_response()
}

struct Fixture {
    state: RouterAppState,
    bodies: Arc<Mutex<Vec<Value>>>,
}

async fn fixture(replies: Vec<Vec<&'static str>>) -> Fixture {
    let bodies = Arc::new(Mutex::new(Vec::new()));
    let mock = Mock {
        replies: Arc::new(replies),
        bodies: bodies.clone(),
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
    let config: CodexRouterConfig = serde_json::from_value(json!({
        "accounts": [
            {"id":"a","auth":{"kind":"apiKey","apiKey":"key-a"},"availableModelIds":null,"quotaWindows":[],"usageFetchedAt":null,"modelCatalogFetchedAt":null},
            {"id":"c","auth":{"kind":"oAuth","accessToken":"synthetic","chatgptAccountId":"synthetic","refreshToken":null},"availableModelIds":null,"quotaWindows":[],"usageFetchedAt":null,"modelCatalogFetchedAt":null}
        ],
        "pools":[],"poolsV2":[
            {"id":"p1","displayName":"Default","publicModelName":"gpt-default","upstreamModelId":"gpt-test","enabled":true,"memberAccountIds":["a"],"modelSelectionMode":"manual","routingPolicy":"priority","authMode":"openai-api-key","maxContextWindowTokens":100,"thinkingBudgetTokens":16384,"reasoningEffort":"high"},
            {"id":"p2","displayName":"Legacy","publicModelName":"legacy-alias","upstreamModelId":"gpt-legacy","enabled":true,"memberAccountIds":["c"],"modelSelectionMode":"manual","routingPolicy":"priority","authMode":"legacy-codex-oauth"}
        ],
        "appliedAccountId":null,"activePoolId":null
    }))
    .unwrap();
    manager.try_configure(config).await.unwrap();
    let state = manager.app_state(Arc::from("router-test"), Arc::from("127.0.0.1:1"));
    // The manager is dropped; its shared state lives on inside `state`.
    Fixture { state, bodies }
}

fn ctx_with_fallback(fallback: Option<&str>) -> ClientContext {
    ClientContext {
        fallback_alias: fallback.map(str::to_string),
        ..ClientContext::unrestricted()
    }
}

fn request(path: &str, body: &Value) -> Request {
    Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

async fn send(f: &Fixture, ctx: ClientContext, body: Value) -> (StatusCode, Value) {
    let response = handle_messages(f.state.clone(), request("/v1/messages", &body), ctx).await;
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn user(model: &str, text: &str) -> Value {
    json!({"model": model, "max_tokens": 64, "stream": false,
        "messages": [{"role": "user", "content": text}]})
}

fn hits(f: &Fixture) -> usize {
    f.bodies.lock().unwrap().len()
}

fn ok_reply() -> Vec<Vec<&'static str>> {
    vec![vec![CREATED, TEXT, DONE]]
}

#[tokio::test]
async fn exact_alias_wins() {
    let f = fixture(ok_reply()).await;
    let snapshot = f.state.registry.read().await.clone();
    let ctx = ctx_with_fallback(Some("legacy-alias"));
    let route = resolve_messages_alias(&snapshot, &ctx, "GPT-Default").unwrap();
    assert_eq!(route.public_model_name, "gpt-default");
    let (status, body) = send(&f, ctx, user("gpt-default", "hi")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["content"][0]["text"], "all done");
    assert_eq!(f.bodies.lock().unwrap()[0]["model"], "gpt-test");
    assert_eq!(f.bodies.lock().unwrap()[0]["reasoning"]["effort"], "high");
}

#[tokio::test]
async fn context_window_limit_rejects_oversized_prompt() {
    let f = fixture(ok_reply()).await;
    let oversized = "a".repeat(800);
    let (status, body) = send(
        &f,
        ClientContext::unrestricted(),
        user("gpt-default", &oversized),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["type"], "invalid_request_error");
    assert!(body["error"]["message"]
        .as_str()
        .unwrap()
        .contains("context window"));
    assert_eq!(hits(&f), 0);
}

#[tokio::test]
async fn unknown_claude_model_uses_fallback_alias() {
    let f = fixture(ok_reply()).await;
    let ctx = ctx_with_fallback(Some("gpt-default"));
    let (status, body) = send(&f, ctx, user("claude-sonnet-5", "hi")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["content"][0]["text"], "all done");
    assert_eq!(hits(&f), 1);
}

#[tokio::test]
async fn fallback_missing_returns_not_found_envelope() {
    let f = fixture(ok_reply()).await;
    for fallback in [None, Some("no-such-pool")] {
        let ctx = ctx_with_fallback(fallback);
        let (status, body) = send(&f, ctx, user("claude-sonnet-5", "hi")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["type"], "error");
        assert_eq!(body["error"]["type"], "not_found_error");
    }
    assert_eq!(hits(&f), 0);
}

#[tokio::test]
async fn count_tokens_never_calls_upstream() {
    let f = fixture(ok_reply()).await;
    let body = json!({"model": "claude-sonnet-5", "system": "abcd",
        "messages": [{"role": "user", "content": "abcdefgh"}]});
    let response = handle_count_tokens(request("/v1/messages/count_tokens", &body)).await;
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json, json!({"input_tokens": 3}));
    assert_eq!(hits(&f), 0);
}

#[tokio::test]
async fn translate_error_is_400_invalid_request() {
    let f = fixture(ok_reply()).await;
    let bad = json!({"model": "gpt-default", "messages": "nope"});
    let (status, body) = send(&f, ClientContext::unrestricted(), bad).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["type"], "invalid_request_error");
    assert_eq!(hits(&f), 0);
}

#[tokio::test]
async fn legacy_codex_oauth_pool_is_rejected_for_messages() {
    let f = fixture(ok_reply()).await;
    let (status, body) = send(
        &f,
        ClientContext::unrestricted(),
        user("legacy-alias", "hi"),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["type"], "invalid_request_error");
    assert!(body["error"]["message"]
        .as_str()
        .unwrap()
        .contains("legacy-alias"));
    assert_eq!(hits(&f), 0);
}

#[tokio::test]
async fn messages_end_to_end_tool_round_trip() {
    let f = fixture(vec![
        vec![CREATED, CALL_ADDED, CALL_ARGS, CALL_DONE, DONE],
        vec![CREATED, TEXT, DONE],
    ])
    .await;
    let tools = json!([{"name": "get_weather", "description": "w",
        "input_schema": {"type": "object", "properties": {}}}]);
    let mut first = user("gpt-default", "weather?");
    first["tools"] = tools.clone();
    let (status, body) = send(&f, ClientContext::unrestricted(), first).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["stop_reason"], "tool_use");
    assert_eq!(body["content"][0]["type"], "tool_use");
    assert_eq!(body["content"][0]["id"], "call_abc");
    assert_eq!(body["content"][0]["input"], json!({"city": "Hue"}));
    assert_eq!(
        f.bodies.lock().unwrap()[0]["tools"][0]["name"],
        "get_weather"
    );

    let second = json!({"model": "gpt-default", "max_tokens": 64, "stream": false, "tools": tools,
    "messages": [
        {"role": "user", "content": "weather?"},
        {"role": "assistant", "content": [{"type": "tool_use", "id": "call_abc",
            "name": "get_weather", "input": {"city": "Hue"}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "call_abc",
            "content": "sunny"}]}
    ]});
    let (status, body) = send(&f, ClientContext::unrestricted(), second).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["stop_reason"], "end_turn");
    assert_eq!(body["content"][0]["text"], "all done");
    let sent = f.bodies.lock().unwrap()[1].to_string();
    assert!(
        sent.contains("function_call_output") && sent.contains("sunny"),
        "{sent}"
    );
}
