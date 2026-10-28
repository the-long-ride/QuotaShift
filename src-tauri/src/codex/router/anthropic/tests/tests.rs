use super::errors::{auth_error, not_found_error};
use super::events::{AnthropicSseEvent, SseTranslatorState};

// Request and tool translation tests live in tests_request.rs.

#[test]
fn messages_unknown_alias_404() {
    let (status, err) = not_found_error("Model alias 'unknown-model' not found");
    assert_eq!(status, axum::http::StatusCode::NOT_FOUND);
    assert_eq!(err["type"], "error");
    assert_eq!(err["error"]["type"], "not_found_error");
}

#[test]
fn messages_invalid_auth_401() {
    let (status, err) = auth_error("Invalid or missing client bearer token");
    assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);
    assert_eq!(err["type"], "error");
    assert_eq!(err["error"]["type"], "authentication_error");
}

// ==========================================
// SSE Streaming Tests (Task 3 reworks these)
// ==========================================

#[test]
fn anthropic_message_start_first() {
    let mut state = SseTranslatorState::new("msg_123", "claude-3-5-sonnet");
    let ev = state.start_message().expect("message_start");
    assert!(matches!(ev, AnthropicSseEvent::MessageStart { .. }));
    let wire = ev.to_sse_wire();
    assert!(wire.starts_with("event: message_start\n"));
    assert!(wire.contains("msg_123"));
}

#[test]
fn content_block_index_monotonic() {
    let mut state = SseTranslatorState::new("msg_123", "claude-3-5-sonnet");
    let b0 = state.start_content_block("text", None, None);
    let b1 = state.start_content_block("tool_use", Some("id1"), Some("tool1"));

    if let AnthropicSseEvent::ContentBlockStart { index, .. } = b0 {
        assert_eq!(index, 0);
    } else {
        panic!("expected block start");
    }

    if let AnthropicSseEvent::ContentBlockStart { index, .. } = b1 {
        assert_eq!(index, 1);
    } else {
        panic!("expected block start");
    }
}

#[test]
fn tool_use_input_json_delta() {
    let ev = AnthropicSseEvent::ContentBlockDeltaJson {
        index: 1,
        partial_json: "{\"loc\": \"".to_string(),
    };
    let wire = ev.to_sse_wire();
    assert!(wire.contains("input_json_delta"));
    let data_line = wire
        .lines()
        .find(|l| l.starts_with("data:"))
        .expect("data line");
    let parsed: serde_json::Value =
        serde_json::from_str(data_line.strip_prefix("data:").unwrap().trim()).expect("parse");
    assert_eq!(parsed["delta"]["partial_json"], "{\"loc\": \"");
}

#[test]
fn message_delta_stop_reason() {
    let ev = AnthropicSseEvent::MessageDelta {
        stop_reason: "end_turn".to_string(),
        output_tokens: Some(42),
        input_tokens: None,
        cache_read_input_tokens: None,
    };
    let wire = ev.to_sse_wire();
    assert!(wire.contains("end_turn"));
    assert!(wire.contains("\"output_tokens\":42"));
}

#[test]
fn message_stop_only_on_response_completed() {
    let mut state = SseTranslatorState::new("msg_123", "claude-3-5-sonnet");
    let events = state.handle_terminal_completed("end_turn", Some(50));

    assert!(state.completed);
    assert_eq!(events.last(), Some(&AnthropicSseEvent::MessageStop));
}

#[test]
fn stream_failure_not_message_stop() {
    let mut state = SseTranslatorState::new("msg_123", "claude-3-5-sonnet");
    let events = state.handle_terminal_failed("Rate limit exceeded upstream");

    assert!(state.failed);
    assert!(!events.contains(&AnthropicSseEvent::MessageStop));
    assert!(matches!(events[0], AnthropicSseEvent::Error { .. }));
}

#[test]
fn client_abort_closes_upstream() {
    use crate::codex::router::responses_transport::StreamCommitTracker;
    let tracker = StreamCommitTracker::new();
    tracker.cancel();
    assert!(tracker.is_cancelled());
}

#[test]
fn usage_unknown_not_zero() {
    // When output_tokens is None, it must NOT emit "output_tokens": 0
    let ev = AnthropicSseEvent::MessageDelta {
        stop_reason: "end_turn".to_string(),
        output_tokens: None,
        input_tokens: None,
        cache_read_input_tokens: None,
    };
    let wire = ev.to_sse_wire();
    assert!(!wire.contains("\"output_tokens\":0"));
}

#[test]
fn cached_tokens_map_to_cache_read_and_subtract_from_input_tokens() {
    use super::stream::aggregate_message;
    use super::tests_stream::{created, run};
    let completed = serde_json::json!({
        "type": "response.completed",
        "response": {
            "status": "completed",
            "usage": {
                "input_tokens": 2048,
                "output_tokens": 128,
                "input_tokens_details": { "cached_tokens": 1536 }
            }
        }
    });
    let (events, _) = run(vec![created(), completed]);
    let delta = events
        .iter()
        .find(|e| matches!(e, AnthropicSseEvent::MessageDelta { .. }))
        .expect("message_delta");
    assert_eq!(
        delta,
        &AnthropicSseEvent::MessageDelta {
            stop_reason: "end_turn".into(),
            output_tokens: Some(128),
            input_tokens: Some(512),
            cache_read_input_tokens: Some(1536),
        }
    );
    let wire = delta.to_sse_wire();
    assert!(wire.contains("\"input_tokens\":512"), "{wire}");
    assert!(wire.contains("\"cache_read_input_tokens\":1536"), "{wire}");
    let msg = aggregate_message(&events).expect("aggregate");
    assert_eq!(
        msg["usage"],
        serde_json::json!({
            "input_tokens": 512,
            "output_tokens": 128,
            "cache_read_input_tokens": 1536
        })
    );
}
