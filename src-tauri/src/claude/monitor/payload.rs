use crate::claude_monitor::format_claude_model_name;
use crate::claude_monitor::types::{ClaudeRateLimitWindow, ClaudeSessionSnapshot};
use serde_json::Value;

pub fn value_string(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub fn value_u64(value: &Value, pointer: &str) -> Option<u64> {
    value.pointer(pointer).and_then(Value::as_u64)
}

pub fn value_f64(value: &Value, pointer: &str) -> Option<f64> {
    value.pointer(pointer).and_then(Value::as_f64)
}

pub fn rate_limit_window(value: &Value, pointer: &str) -> Option<ClaudeRateLimitWindow> {
    let window = value.pointer(pointer)?;
    if !window.is_object() {
        return None;
    }
    Some(ClaudeRateLimitWindow {
        used_percentage: window.get("used_percentage").and_then(Value::as_f64),
        resets_at: window.get("resets_at").and_then(Value::as_i64),
    })
}

pub fn normalize_payload_value(
    value: &Value,
    captured_at_ms: u64,
) -> Result<ClaudeSessionSnapshot, String> {
    let session_id = value
        .get("session_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "Claude statusLine payload is missing session_id".to_string())?
        .to_string();

    Ok(ClaudeSessionSnapshot {
        session_id,
        session_name: value_string(value, "/session_name"),
        model_id: value_string(value, "/model/id"),
        model_display_name: value_string(value, "/model/display_name")
            .map(|m| format_claude_model_name(&m))
            .or_else(|| {
                value_string(value, "/model/id")
                    .as_deref()
                    .map(format_claude_model_name)
            }),
        claude_code_version: value_string(value, "/version"),
        current_dir: value_string(value, "/workspace/current_dir")
            .or_else(|| value_string(value, "/cwd")),
        project_dir: value_string(value, "/workspace/project_dir"),
        captured_at_ms,
        total_cost_usd: value_f64(value, "/cost/total_cost_usd"),
        total_duration_ms: value_u64(value, "/cost/total_duration_ms"),
        total_api_duration_ms: value_u64(value, "/cost/total_api_duration_ms"),
        total_input_tokens: value_u64(value, "/context_window/total_input_tokens"),
        total_output_tokens: value_u64(value, "/context_window/total_output_tokens"),
        context_window_size: value_u64(value, "/context_window/context_window_size"),
        context_used_percentage: value_f64(value, "/context_window/used_percentage"),
        context_remaining_percentage: value_f64(value, "/context_window/remaining_percentage"),
        current_input_tokens: value_u64(value, "/context_window/current_usage/input_tokens"),
        current_output_tokens: value_u64(value, "/context_window/current_usage/output_tokens"),
        cache_creation_input_tokens: value_u64(
            value,
            "/context_window/current_usage/cache_creation_input_tokens",
        ),
        cache_read_input_tokens: value_u64(
            value,
            "/context_window/current_usage/cache_read_input_tokens",
        ),
        five_hour: rate_limit_window(value, "/rate_limits/five_hour"),
        seven_day: rate_limit_window(value, "/rate_limits/seven_day"),
    })
}

pub fn fallback_status_line(value: &Value) -> String {
    let model = value
        .pointer("/model/display_name")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/model/id").and_then(Value::as_str))
        .unwrap_or("Claude");

    match value
        .pointer("/context_window/used_percentage")
        .and_then(Value::as_f64)
    {
        Some(percent) if percent.fract().abs() < f64::EPSILON => {
            format!("{model} · {:.0}% context", percent)
        }
        Some(percent) => format!("{model} · {:.1}% context", percent),
        None => model.to_string(),
    }
}
