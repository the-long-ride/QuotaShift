use super::precommit::{read_until_commit, FailureKind, Precommit, PrecommitLimits};
use super::types::RetryableFailure;
use axum::body::Bytes;
use futures_util::StreamExt;
use std::time::Duration;

const CREATED: &str = "event: response.created\ndata: {\"type\":\"response.created\",\"response\":{\"id\":\"r1\"}}\n\n";
const QUOTA: &str = "event: error\ndata: {\"type\":\"error\",\"error\":{\"code\":\"usage_limit_exceeded\",\"message\":\"limit reached\"}}\n\n";

fn reqwest_response(status: u16, chunks: Vec<&'static str>, hang: bool) -> reqwest::Response {
    let items = futures_util::stream::iter(
        chunks
            .into_iter()
            .map(|c| Ok::<_, std::io::Error>(Bytes::from(c))),
    );
    let body = if hang {
        reqwest::Body::wrap_stream(items.chain(futures_util::stream::pending()))
    } else {
        reqwest::Body::wrap_stream(items)
    };
    reqwest::Response::from(
        axum::http::Response::builder()
            .status(status)
            .body(body)
            .unwrap(),
    )
}

const CUSTOM_CALL: &str = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"custom_tool_call\",\"name\":\"apply_patch\"}}\n\n";
const CUSTOM_INPUT: &str = "event: response.custom_tool_call_input.delta\ndata: {\"type\":\"response.custom_tool_call_input.delta\",\"delta\":\"*** Begin Patch\"}\n\n";
const WEB_SEARCH: &str = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"web_search_call\"}}\n\n";
const SHELL_CALL: &str = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"local_shell_call\"}}\n\n";
const REASONING_ITEM: &str = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"reasoning\"}}\n\n";
const REASONING_DELTA: &str = "event: response.reasoning_summary_text.delta\ndata: {\"type\":\"response.reasoning_summary_text.delta\",\"delta\":\"thinking\"}\n\n";
const MESSAGE_ITEM: &str = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"message\"}}\n\n";

/// True when the stream commits right away instead of waiting out `max_wait`.
async fn commits_at_once(chunks: Vec<&'static str>, wide_commit: bool) -> bool {
    let response = reqwest_response(200, chunks, true);
    let limits = PrecommitLimits {
        max_prefix_bytes: 1 << 20,
        max_wait: Duration::from_millis(600),
        wide_commit,
    };
    let started = std::time::Instant::now();
    let committed = matches!(
        read_until_commit(response, limits).await,
        Precommit::Commit { .. }
    );
    committed && started.elapsed() < Duration::from_millis(400)
}

#[tokio::test]
async fn passthrough_commits_on_codex_item_types_and_deltas() {
    for events in [
        vec![CREATED, CUSTOM_CALL],
        vec![CREATED, CUSTOM_INPUT],
        vec![CREATED, WEB_SEARCH],
        vec![CREATED, SHELL_CALL],
        vec![CREATED, REASONING_ITEM],
        vec![CREATED, REASONING_DELTA],
    ] {
        assert!(commits_at_once(events.clone(), true).await, "{events:?}");
    }
}

#[tokio::test]
async fn passthrough_still_holds_a_bare_message_item() {
    assert!(!commits_at_once(vec![CREATED, MESSAGE_ITEM], true).await);
}

#[tokio::test]
async fn messages_encoding_keeps_the_narrow_commit_rule() {
    for events in [
        vec![CREATED, REASONING_DELTA],
        vec![CREATED, REASONING_ITEM],
        vec![CREATED, CUSTOM_CALL],
        vec![CREATED, CUSTOM_INPUT],
    ] {
        assert!(!commits_at_once(events.clone(), false).await, "{events:?}");
    }
}

fn limits(max_prefix_bytes: usize, ms: u64) -> PrecommitLimits {
    PrecommitLimits {
        max_prefix_bytes,
        max_wait: Duration::from_millis(ms),
        wide_commit: false,
    }
}

#[tokio::test]
async fn bare_message_item_does_not_commit_but_timeout_commits() {
    let item = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"message\"}}\n\n";
    let response = reqwest_response(200, vec![CREATED, item], true);
    let started = std::time::Instant::now();
    match read_until_commit(response, limits(1 << 20, 150)).await {
        Precommit::Commit { prefix, .. } => {
            assert!(started.elapsed() >= Duration::from_millis(100));
            assert!(String::from_utf8_lossy(&prefix).contains("message"));
        }
        _ => panic!("expected commit after timeout"),
    }
}

#[tokio::test]
async fn function_call_item_and_prefix_cap_commit_immediately() {
    let call = "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"function_call\"}}\n\n";
    let response = reqwest_response(200, vec![CREATED, call], true);
    assert!(matches!(
        read_until_commit(response, limits(1 << 20, 5000)).await,
        Precommit::Commit { .. }
    ));
    let response = reqwest_response(200, vec![CREATED], true);
    assert!(matches!(
        read_until_commit(response, limits(10, 5000)).await,
        Precommit::Commit { .. }
    ));
}

#[tokio::test]
async fn quota_error_retries_and_plain_error_status_fails() {
    let response = reqwest_response(200, vec![CREATED, QUOTA], true);
    assert!(matches!(
        read_until_commit(response, limits(1 << 20, 5000)).await,
        Precommit::RetryNextAccount(RetryableFailure::Backoff, FailureKind::Quota)
    ));
    let response = reqwest_response(500, vec!["boom"], false);
    assert!(matches!(
        read_until_commit(response, PrecommitLimits::default()).await,
        Precommit::Fail { .. }
    ));
}
