use super::request::TranslateError;
use serde_json::{json, Value};

/// Converts one Anthropic message into Responses `input` items, appended to `out`.
/// Order is preserved: text/image parts are flushed as a message item before
/// any tool item that follows them.
pub fn convert_message(
    role: &str,
    content: &Value,
    out: &mut Vec<Value>,
) -> Result<(), TranslateError> {
    if role != "user" && role != "assistant" {
        return Err(TranslateError::new(format!(
            "Unsupported message role '{role}'"
        )));
    }
    if let Some(text) = content.as_str() {
        push_message(role, vec![text_part(role, text)], out);
        return Ok(());
    }
    let blocks = content
        .as_array()
        .ok_or_else(|| TranslateError::new("Message 'content' must be a string or array"))?;
    let mut parts: Vec<Value> = Vec::new();
    for block in blocks {
        match block.get("type").and_then(Value::as_str).unwrap_or("") {
            "text" => {
                let text = block.get("text").and_then(Value::as_str).unwrap_or("");
                parts.push(text_part(role, text));
            }
            "image" => {
                if role != "user" {
                    return Err(TranslateError::new(
                        "Image blocks are only supported in user messages",
                    ));
                }
                parts.push(image_part(block)?);
            }
            "thinking" | "redacted_thinking" => {}
            "tool_use" => {
                push_message(role, std::mem::take(&mut parts), out);
                out.push(function_call(block));
            }
            "tool_result" => {
                push_message(role, std::mem::take(&mut parts), out);
                push_tool_result(block, out)?;
            }
            other => {
                return Err(TranslateError::new(format!(
                    "Unsupported content block type '{other}'"
                )));
            }
        }
    }
    push_message(role, parts, out);
    Ok(())
}

fn text_part(role: &str, text: &str) -> Value {
    let kind = if role == "assistant" {
        "output_text"
    } else {
        "input_text"
    };
    json!({ "type": kind, "text": text })
}

fn push_message(role: &str, parts: Vec<Value>, out: &mut Vec<Value>) {
    if !parts.is_empty() {
        out.push(json!({ "type": "message", "role": role, "content": parts }));
    }
}

fn image_part(block: &Value) -> Result<Value, TranslateError> {
    let src = block
        .get("source")
        .ok_or_else(|| TranslateError::new("Image block missing 'source'"))?;
    let field = |k: &str| src.get(k).and_then(Value::as_str);
    let url = match field("type") {
        Some("base64") => {
            let media = field("media_type")
                .ok_or_else(|| TranslateError::new("Image source missing 'media_type'"))?;
            let data =
                field("data").ok_or_else(|| TranslateError::new("Image source missing 'data'"))?;
            format!("data:{media};base64,{data}")
        }
        Some("url") => field("url")
            .ok_or_else(|| TranslateError::new("Image source missing 'url'"))?
            .to_string(),
        other => {
            return Err(TranslateError::new(format!(
                "Unsupported image source type '{}'",
                other.unwrap_or("")
            )))
        }
    };
    Ok(json!({ "type": "input_image", "image_url": url }))
}

fn function_call(block: &Value) -> Value {
    let field = |k: &str| block.get(k).and_then(Value::as_str).unwrap_or("");
    let input = block.get("input").cloned().unwrap_or_else(|| json!({}));
    json!({
        "type": "function_call",
        "call_id": field("id"),
        "name": field("name"),
        "arguments": input.to_string(),
    })
}

fn push_tool_result(block: &Value, out: &mut Vec<Value>) -> Result<(), TranslateError> {
    let call_id = block
        .get("tool_use_id")
        .and_then(Value::as_str)
        .unwrap_or("");
    let mut texts: Vec<&str> = Vec::new();
    let mut images: Vec<Value> = Vec::new();
    match block.get("content") {
        None | Some(Value::Null) => {}
        Some(Value::String(s)) => texts.push(s),
        Some(Value::Array(parts)) => {
            for part in parts {
                match part.get("type").and_then(Value::as_str).unwrap_or("") {
                    "text" => texts.push(part.get("text").and_then(Value::as_str).unwrap_or("")),
                    "image" => images.push(image_part(part)?),
                    other => {
                        return Err(TranslateError::new(format!(
                            "Unsupported tool_result content block type '{other}'"
                        )))
                    }
                }
            }
        }
        Some(_) => {
            return Err(TranslateError::new(
                "tool_result 'content' must be a string or array",
            ))
        }
    }
    let mut output = texts.join("\n");
    if block.get("is_error").and_then(Value::as_bool) == Some(true) {
        output = format!("Error: {output}");
    }
    out.push(json!({ "type": "function_call_output", "call_id": call_id, "output": output }));
    push_message("user", images, out);
    Ok(())
}
