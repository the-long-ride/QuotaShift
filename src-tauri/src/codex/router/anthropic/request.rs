use super::content::convert_message;
use super::tools::{convert_anthropic_tools_to_openai, convert_tool_choice};
use serde_json::{json, Value};
use std::fmt;

/// A request the translator cannot map; surfaces as `invalid_request_error`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslateError {
    pub message: String,
}

impl TranslateError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for TranslateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for TranslateError {}

pub fn requested_model(req: &Value) -> Option<&str> {
    req.get("model").and_then(Value::as_str)
}

fn system_instructions(system: &Value) -> Result<String, TranslateError> {
    if let Some(text) = system.as_str() {
        return Ok(text.to_string());
    }
    let blocks = system.as_array().ok_or_else(|| {
        TranslateError::new("Field 'system' must be a string or array of text blocks")
    })?;
    let texts: Vec<&str> = blocks
        .iter()
        .filter_map(|b| b.get("text").and_then(Value::as_str))
        .collect();
    Ok(texts.join("\n\n"))
}

pub fn effort_for_budget(budget: u64) -> &'static str {
    if budget < 1024 {
        "minimal"
    } else if budget < 4096 {
        "low"
    } else if budget < 16384 {
        "medium"
    } else if budget < 32768 {
        "high"
    } else {
        "xhigh"
    }
}

fn normalize_effort(effort: &str) -> Option<&'static str> {
    match effort.trim().to_ascii_lowercase().as_str() {
        "minimal" | "none" => Some("minimal"),
        "low" => Some("low"),
        "medium" => Some("medium"),
        "high" => Some("high"),
        "xhigh" | "max" => Some("xhigh"),
        _ => None,
    }
}

fn request_explicit_effort(obj: &serde_json::Map<String, Value>) -> Option<&'static str> {
    obj.get("output_config")
        .and_then(|c| c.get("effort"))
        .and_then(Value::as_str)
        .and_then(normalize_effort)
        .or_else(|| {
            obj.get("thinking")
                .and_then(|t| t.get("effort"))
                .and_then(Value::as_str)
                .and_then(normalize_effort)
        })
        .or_else(|| {
            obj.get("reasoning")
                .and_then(|r| r.get("effort"))
                .and_then(Value::as_str)
                .and_then(normalize_effort)
        })
        .or_else(|| {
            obj.get("reasoning_effort")
                .and_then(Value::as_str)
                .and_then(normalize_effort)
        })
        .or_else(|| {
            obj.get("effort")
                .and_then(Value::as_str)
                .and_then(normalize_effort)
        })
}

fn resolve_reasoning_effort(
    obj: &serde_json::Map<String, Value>,
    default_effort: Option<&str>,
    default_thinking_budget: Option<u64>,
) -> Option<&'static str> {
    if let Some(explicit) = request_explicit_effort(obj) {
        return Some(explicit);
    }
    let thinking = obj.get("thinking");
    let kind = thinking.and_then(|t| t.get("type")).and_then(Value::as_str);
    if kind == Some("disabled") {
        return Some("minimal");
    }
    if let Some(budget) = thinking
        .filter(|_| kind == Some("enabled"))
        .and_then(|t| t.get("budget_tokens"))
        .and_then(Value::as_u64)
    {
        if default_thinking_budget == Some(budget) {
            return default_effort
                .and_then(normalize_effort)
                .or_else(|| Some(effort_for_budget(budget)));
        }
        return Some(effort_for_budget(budget));
    }
    default_effort
        .and_then(normalize_effort)
        .or_else(|| default_thinking_budget.map(effort_for_budget))
}

pub fn convert_anthropic_to_responses(
    req: &Value,
    upstream_model: &str,
) -> Result<Value, TranslateError> {
    convert_anthropic_to_responses_with_options(req, upstream_model, None, None)
}

pub fn convert_anthropic_to_responses_with_options(
    req: &Value,
    upstream_model: &str,
    default_effort: Option<&str>,
    default_thinking_budget: Option<u64>,
) -> Result<Value, TranslateError> {
    let obj = req
        .as_object()
        .ok_or_else(|| TranslateError::new("Anthropic request must be a JSON object"))?;
    let messages = obj
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| TranslateError::new("Missing or invalid 'messages' array"))?;

    let mut system_parts = Vec::new();
    if let Some(system) = obj.get("system") {
        let text = system_instructions(system)?;
        if !text.is_empty() {
            system_parts.push(text);
        }
    }

    let mut input = Vec::new();
    for msg in messages {
        let role = msg
            .get("role")
            .and_then(Value::as_str)
            .ok_or_else(|| TranslateError::new("Message turn missing 'role'"))?;
        let content = msg
            .get("content")
            .ok_or_else(|| TranslateError::new("Message turn missing 'content'"))?;
        if role == "system" {
            let text = system_instructions(content)?;
            if !text.is_empty() {
                system_parts.push(text);
            }
            continue;
        }
        convert_message(role, content, &mut input)?;
    }

    let mut payload = json!({
        "model": upstream_model,
        "store": false,
        "stream": true,
        "input": input,
    });
    if !system_parts.is_empty() {
        payload["instructions"] = json!(system_parts.join("\n\n"));
    }
    if let Some(tools) = obj.get("tools").and_then(Value::as_array) {
        payload["tools"] = json!(convert_anthropic_tools_to_openai(tools)?);
    }
    if let Some(choice) = obj.get("tool_choice") {
        payload["tool_choice"] = convert_tool_choice(choice)?;
    }
    if let Some(effort) = resolve_reasoning_effort(obj, default_effort, default_thinking_budget) {
        payload["reasoning"] = json!({ "effort": effort });
    }
    Ok(payload)
}
