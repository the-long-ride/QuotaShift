//! Local token estimate for `/v1/messages/count_tokens`. Never calls upstream.
use serde_json::Value;

fn chars(text: &str) -> u64 {
    text.chars().count() as u64
}

fn content_chars(content: &Value) -> u64 {
    match content {
        Value::String(text) => chars(text),
        Value::Array(blocks) => blocks.iter().map(block_chars).sum(),
        _ => 0,
    }
}

fn block_chars(block: &Value) -> u64 {
    let text = |key: &str| block.get(key).and_then(Value::as_str).map_or(0, chars);
    match block.get("type").and_then(Value::as_str) {
        Some("text") => text("text"),
        Some("thinking") => text("thinking"),
        Some("tool_use") => {
            text("name")
                + block
                    .get("input")
                    .map_or(0, |input| chars(&input.to_string()))
        }
        Some("tool_result") => block.get("content").map_or(0, content_chars),
        _ => 0,
    }
}

/// ceil(characters of system, message text, tool_use/tool_result text and tool schemas / 4).
pub fn estimate_tokens(req: &Value) -> u64 {
    let mut total = req.get("system").map_or(0, content_chars);
    if let Some(messages) = req.get("messages").and_then(Value::as_array) {
        total += messages
            .iter()
            .filter_map(|message| message.get("content"))
            .map(content_chars)
            .sum::<u64>();
    }
    if let Some(tools) = req.get("tools").and_then(Value::as_array) {
        total += tools
            .iter()
            .map(|tool| chars(&tool.to_string()))
            .sum::<u64>();
    }
    total.div_ceil(4)
}
