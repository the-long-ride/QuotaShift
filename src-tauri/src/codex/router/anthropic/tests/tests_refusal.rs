use serde_json::{json, Value};

use super::events::AnthropicSseEvent as E;
use super::tests_stream::{completed, created, item_added, item_done, msg_item, run};

fn refusal_frames(extra: Vec<Value>) -> Vec<Value> {
    let mut frames = vec![created(), item_added(0, msg_item())];
    frames.extend(extra);
    frames.push(item_done(0, msg_item()));
    frames.push(completed());
    frames
}

fn refusal(kind: &str, key: &str, text: &str) -> Value {
    json!({"type": kind, "output_index": 0, key: text})
}

#[test]
fn refusal_deltas_become_a_text_block() {
    let (events, t) = run(refusal_frames(vec![
        refusal("response.refusal.delta", "delta", "I cannot "),
        refusal("response.refusal.delta", "delta", "help"),
        refusal("response.refusal.done", "refusal", "I cannot help"),
    ]));
    assert!(t.saw_content());
    let texts: Vec<&str> = events
        .iter()
        .filter_map(|e| match e {
            E::ContentBlockDeltaText { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(
        texts,
        ["I cannot ", "help"],
        "done must not repeat the text"
    );
    let starts = events
        .iter()
        .filter(|e| matches!(e, E::ContentBlockStart { .. }))
        .count();
    assert_eq!(starts, 1);
    assert!(events.contains(&E::ContentBlockStop { index: 0 }));
    assert!(matches!(events.last(), Some(E::MessageStop)));
}

#[test]
fn whole_refusal_without_deltas_is_emitted_once() {
    let (events, t) = run(refusal_frames(vec![refusal(
        "response.refusal.done",
        "refusal",
        "No.",
    )]));
    assert!(t.saw_content());
    assert!(events.contains(&E::ContentBlockDeltaText {
        index: 0,
        text: "No.".into(),
    }));
}
