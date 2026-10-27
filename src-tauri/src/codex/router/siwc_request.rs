use serde_json::Value;

pub const SIWC_RESPONSES_ENDPOINT: &str = "https://api.openai.com/v1/responses";

pub const BANNED_SIWC_PREVIEW_FIELDS: &[&str] = &[
    "background",
    "conversation",
    "max_output_tokens",
    "max_tool_calls",
    "metadata",
    "moderation",
    "multi_agent",
    "prompt",
    "prompt_cache_retention",
    "safety_identifier",
    "temperature",
    "top_logprobs",
    "top_p",
    "truncation",
    "user",
    "previous_response_id",
];

pub fn get_siwc_endpoint() -> &'static str {
    SIWC_RESPONSES_ENDPOINT
}

pub fn validate_siwc_request(body: &Value) -> Result<(), String> {
    let obj = body
        .as_object()
        .ok_or_else(|| "Request body must be a JSON object".to_string())?;

    // store must be explicitly false
    match obj.get("store") {
        Some(Value::Bool(false)) => (),
        Some(_) => return Err("SIWC policy requires 'store: false'".to_string()),
        None => return Err("Missing required field 'store: false' for SIWC request".to_string()),
    }

    // stream must be explicitly true
    match obj.get("stream") {
        Some(Value::Bool(true)) => (),
        Some(_) => return Err("SIWC policy requires 'stream: true'".to_string()),
        None => return Err("Missing required field 'stream: true' for SIWC request".to_string()),
    }

    // input must be an array
    match obj.get("input") {
        Some(Value::Array(_)) => (),
        Some(_) => return Err("Field 'input' must be a JSON array".to_string()),
        None => return Err("Missing required field 'input' in SIWC request".to_string()),
    }

    // Explicit system-role input is not supported by the SIWC HTTP preview.
    if let Some(serde_json::Value::Array(items)) = obj.get("input") {
        for item in items {
            if item.get("role").and_then(Value::as_str) == Some("system") {
                return Err("SIWC HTTP preview rejects system-role input; use instructions or developer role".into());
            }
        }
    }

    // Reject all unsupported preview fields
    for &banned in BANNED_SIWC_PREVIEW_FIELDS {
        if obj.contains_key(banned) {
            return Err(format!(
                "Field '{}' is not supported by OpenAI SIWC Responses policy",
                banned
            ));
        }
    }

    Ok(())
}

pub fn prepare_siwc_payload(body: &Value, upstream_model: &str) -> Result<Value, String> {
    validate_siwc_request(body)?;
    let mut payload = body.clone();
    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            "model".to_string(),
            Value::String(upstream_model.to_string()),
        );
    }
    Ok(payload)
}
