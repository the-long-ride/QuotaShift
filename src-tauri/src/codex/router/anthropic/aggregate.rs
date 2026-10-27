//! Builds the non-streaming Anthropic message JSON from translated SSE events.
use serde_json::{json, Value};

use super::events::AnthropicSseEvent;

struct Block {
    kind: String,
    id: Option<String>,
    name: Option<String>,
    text: String,
    json: String,
}

impl Block {
    fn into_value(self) -> Result<Value, String> {
        if self.kind == "tool_use" {
            let input = if self.json.trim().is_empty() {
                json!({})
            } else {
                serde_json::from_str(&self.json)
                    .map_err(|_| "tool_use arguments were not valid JSON".to_string())?
            };
            Ok(json!({
                "type": "tool_use",
                "id": self.id.unwrap_or_default(),
                "name": self.name.unwrap_or_default(),
                "input": input
            }))
        } else {
            Ok(json!({ "type": "text", "text": self.text }))
        }
    }
}

pub fn aggregate_message(events: &[AnthropicSseEvent]) -> Result<Value, String> {
    let mut id = String::new();
    let mut model = String::new();
    let mut input_tokens = 0u64;
    let mut output_tokens = 0u64;
    let mut cache_read_input_tokens: Option<u64> = None;
    let mut stop_reason: Option<String> = None;
    let mut stopped = false;
    let mut blocks: Vec<Block> = Vec::new();
    for event in events {
        match event {
            AnthropicSseEvent::MessageStart {
                message_id,
                model: m,
                input_tokens: input,
            } => {
                id = message_id.clone();
                model = m.clone();
                input_tokens = *input;
            }
            AnthropicSseEvent::ContentBlockStart {
                index,
                block_type,
                id,
                name,
            } => {
                if *index != blocks.len() {
                    return Err("content block index out of order".into());
                }
                blocks.push(Block {
                    kind: block_type.clone(),
                    id: id.clone(),
                    name: name.clone(),
                    text: String::new(),
                    json: String::new(),
                });
            }
            AnthropicSseEvent::ContentBlockDeltaText { index, text } => {
                blocks
                    .get_mut(*index)
                    .ok_or("delta for unknown block")?
                    .text += text;
            }
            AnthropicSseEvent::ContentBlockDeltaJson {
                index,
                partial_json,
            } => {
                blocks
                    .get_mut(*index)
                    .ok_or("delta for unknown block")?
                    .json += partial_json;
            }
            AnthropicSseEvent::ContentBlockStop { .. } => {}
            AnthropicSseEvent::MessageDelta {
                stop_reason: reason,
                output_tokens: out,
                input_tokens: input,
                cache_read_input_tokens: cache_read,
            } => {
                stop_reason = Some(reason.clone());
                output_tokens = out.unwrap_or(output_tokens);
                input_tokens = input.unwrap_or(input_tokens);
                if cache_read.is_some() {
                    cache_read_input_tokens = *cache_read;
                }
            }
            AnthropicSseEvent::MessageStop => stopped = true,
            AnthropicSseEvent::Error { message } => return Err(message.clone()),
        }
    }
    if !stopped {
        return Err("stream ended without message_stop".into());
    }
    let content = blocks
        .into_iter()
        .map(Block::into_value)
        .collect::<Result<Vec<_>, _>>()?;
    let mut usage = json!({ "input_tokens": input_tokens, "output_tokens": output_tokens });
    if let Some(cache_read) = cache_read_input_tokens {
        usage["cache_read_input_tokens"] = json!(cache_read);
    }
    Ok(json!({
        "id": id,
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": null,
        "usage": usage
    }))
}
