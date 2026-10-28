use serde_json::{json, Value};

use super::events::AnthropicSseEvent as E;
use super::stream::{aggregate_message, MessagesStreamTranslator};

pub(super) fn frame(data: Value) -> String {
    format!(
        "event: {}\ndata: {}\n\n",
        data["type"].as_str().unwrap_or("x"),
        data
    )
}

pub(super) fn run(frames: Vec<Value>) -> (Vec<E>, MessagesStreamTranslator) {
    let bytes: String = frames.into_iter().map(frame).collect();
    let mut t = MessagesStreamTranslator::new("msg_1".into(), "alias".into());
    let mut out = Vec::new();
    for chunk in bytes.as_bytes().chunks(7) {
        out.extend(t.push(chunk));
    }
    out.extend(t.finish());
    (out, t)
}

pub(super) fn created() -> Value {
    json!({"type": "response.created", "response": {"status": "in_progress"}})
}

fn text_delta(idx: u64, text: &str) -> Value {
    json!({"type": "response.output_text.delta", "output_index": idx, "delta": text})
}

pub(super) fn item_added(idx: u64, item: Value) -> Value {
    json!({"type": "response.output_item.added", "output_index": idx, "item": item})
}

pub(super) fn item_done(idx: u64, item: Value) -> Value {
    json!({"type": "response.output_item.done", "output_index": idx, "item": item})
}

pub(super) fn completed() -> Value {
    json!({"type": "response.completed", "response": {"status": "completed",
        "usage": {"input_tokens": 11, "output_tokens": 5}}})
}

fn call(idx: u64, call_id: &str, name: &str, args: &str) -> Vec<Value> {
    let item = json!({"type": "function_call", "call_id": call_id, "name": name});
    vec![
        item_added(idx, item.clone()),
        json!({"type": "response.function_call_arguments.delta", "output_index": idx, "delta": args}),
        item_done(
            idx,
            json!({"type": "function_call", "call_id": call_id, "name": name, "arguments": args}),
        ),
    ]
}

pub(super) fn msg_item() -> Value {
    json!({"type": "message", "role": "assistant"})
}

#[test]
fn text_stream_maps_to_text_block() {
    let (events, t) = run(vec![
        created(),
        item_added(0, msg_item()),
        text_delta(0, "Hel"),
        text_delta(0, "lo"),
        item_done(0, msg_item()),
        completed(),
    ]);
    let expected = vec![
        E::MessageStart {
            message_id: "msg_1".into(),
            model: "alias".into(),
            input_tokens: 0,
        },
        E::ContentBlockStart {
            index: 0,
            block_type: "text".into(),
            id: None,
            name: None,
        },
        E::ContentBlockDeltaText {
            index: 0,
            text: "Hel".into(),
        },
        E::ContentBlockDeltaText {
            index: 0,
            text: "lo".into(),
        },
        E::ContentBlockStop { index: 0 },
        E::MessageDelta {
            stop_reason: "end_turn".into(),
            output_tokens: Some(5),
            input_tokens: Some(11),
            cache_read_input_tokens: None,
        },
        E::MessageStop,
    ];
    assert_eq!(events, expected);
    assert!(t.saw_content());
}

#[test]
fn message_item_alone_is_not_content() {
    let mut t = MessagesStreamTranslator::new("m".into(), "a".into());
    let bytes = frame(created()) + &frame(item_added(0, msg_item()));
    t.push(bytes.as_bytes());
    assert!(!t.saw_content());
}

#[test]
fn function_call_maps_to_tool_use_with_input_json_delta() {
    let mut frames = vec![created()];
    frames.extend(call(0, "call_abc", "get_weather", "{\"city\":\"Hue\"}"));
    frames.push(completed());
    let (events, t) = run(frames);
    assert!(events.contains(&E::ContentBlockStart {
        index: 0,
        block_type: "tool_use".into(),
        id: Some("call_abc".into()),
        name: Some("get_weather".into()),
    }));
    assert!(events.contains(&E::ContentBlockDeltaJson {
        index: 0,
        partial_json: "{\"city\":\"Hue\"}".into()
    }));
    assert!(matches!(&events[events.len() - 2],
        E::MessageDelta { stop_reason, .. } if stop_reason == "tool_use"));
    assert_eq!(events.last(), Some(&E::MessageStop));
    assert!(t.saw_content());
}

#[test]
fn parallel_function_calls_become_separate_tool_use_blocks() {
    let mut frames = vec![created()];
    frames.extend(call(0, "call_a", "read", "{\"p\":1}"));
    frames.extend(call(1, "call_b", "write", "{\"p\":2}"));
    frames.push(completed());
    let (events, _) = run(frames);
    let starts: Vec<(usize, Option<String>)> = events
        .iter()
        .filter_map(|e| match e {
            E::ContentBlockStart {
                index,
                block_type,
                id,
                ..
            } if block_type == "tool_use" => Some((*index, id.clone())),
            _ => None,
        })
        .collect();
    assert_eq!(
        starts,
        vec![
            (0, Some("call_a".to_string())),
            (1, Some("call_b".to_string()))
        ]
    );
    let stops = events
        .iter()
        .filter(|e| matches!(e, E::ContentBlockStop { .. }))
        .count();
    assert_eq!(stops, 2);
    assert!(events.iter().any(|e| matches!(e,
        E::MessageDelta { stop_reason, .. } if stop_reason == "tool_use")));
}

#[test]
fn reasoning_items_are_not_forwarded() {
    let reasoning = json!({"type": "reasoning", "id": "rs_1"});
    let (events, _) = run(vec![
        created(),
        item_added(0, reasoning.clone()),
        json!({"type": "response.reasoning_summary_text.delta", "output_index": 0, "delta": "pondering"}),
        item_done(0, reasoning),
        item_added(1, msg_item()),
        text_delta(1, "answer"),
        item_done(1, msg_item()),
        completed(),
    ]);
    assert!(!format!("{events:?}").contains("pondering"));
    let starts = events
        .iter()
        .filter(|e| matches!(e, E::ContentBlockStart { .. }))
        .count();
    assert_eq!(starts, 1);
    assert!(events.contains(&E::ContentBlockDeltaText {
        index: 0,
        text: "answer".into()
    }));
}

#[test]
fn incomplete_max_output_tokens_maps_to_max_tokens() {
    let (events, _) = run(vec![
        created(),
        text_delta(0, "cut"),
        json!({"type": "response.incomplete", "response": {
            "incomplete_details": {"reason": "max_output_tokens"}, "usage": {"output_tokens": 9}}}),
    ]);
    assert!(events.iter().any(|e| matches!(e,
        E::MessageDelta { stop_reason, output_tokens: Some(9), .. } if stop_reason == "max_tokens")));
    assert_eq!(events.last(), Some(&E::MessageStop));
    assert!(events
        .iter()
        .any(|e| matches!(e, E::ContentBlockStop { index: 0 })));
}

#[test]
fn incomplete_other_reason_is_error_event() {
    let (events, _) = run(vec![
        created(),
        json!({"type": "response.incomplete", "response": {
            "incomplete_details": {"reason": "content_filter"}}}),
    ]);
    assert!(
        matches!(events.last(), Some(E::Error { message }) if message.contains("content_filter"))
    );
    assert!(!events.contains(&E::MessageStop));
}

#[test]
fn failed_is_error_event_never_message_stop() {
    let (events, _) = run(vec![
        created(),
        json!({"type": "response.failed", "response": {"error": {"message": "upstream broke"}}}),
    ]);
    assert_eq!(
        events.last(),
        Some(&E::Error {
            message: "upstream broke".into()
        })
    );
    assert!(!events.contains(&E::MessageStop));
}

#[test]
fn truncated_stream_finish_emits_error() {
    let (events, _) = run(vec![created(), text_delta(0, "partial")]);
    assert!(matches!(events.last(), Some(E::Error { .. })));
    assert!(!events.contains(&E::MessageStop));
}

#[test]
fn aggregate_message_builds_content_array() {
    let mut frames = vec![
        created(),
        item_added(0, msg_item()),
        text_delta(0, "Hi "),
        text_delta(0, "there"),
    ];
    frames.push(item_done(0, msg_item()));
    frames.extend(call(1, "call_x", "lookup", "{\"q\":\"rust\"}"));
    frames.push(completed());
    let (events, _) = run(frames);
    let msg = aggregate_message(&events).expect("aggregate");
    assert_eq!(msg["type"], "message");
    assert_eq!(msg["stop_reason"], "tool_use");
    assert_eq!(
        msg["content"][0],
        json!({"type": "text", "text": "Hi there"})
    );
    assert_eq!(
        msg["content"][1],
        json!({"type": "tool_use", "id": "call_x", "name": "lookup", "input": {"q": "rust"}})
    );
    assert_eq!(
        msg["usage"],
        json!({"input_tokens": 11, "output_tokens": 5})
    );
}

#[test]
fn aggregate_message_errors_on_error_or_missing_stop() {
    let (events, _) = run(vec![created(), text_delta(0, "x")]);
    assert!(aggregate_message(&events).is_err());
    assert!(aggregate_message(&[E::MessageStop]).is_ok());
    assert!(aggregate_message(&[]).is_err());
}
