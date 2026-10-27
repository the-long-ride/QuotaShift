use super::request::TranslateError;
use serde_json::{json, Value};

pub fn convert_anthropic_tools_to_openai(tools: &[Value]) -> Result<Vec<Value>, TranslateError> {
    tools.iter().map(convert_tool).collect()
}

fn convert_tool(tool: &Value) -> Result<Value, TranslateError> {
    let obj = tool
        .as_object()
        .ok_or_else(|| TranslateError::new("Tool definition must be an object"))?;

    if let Some(kind) = obj.get("type").and_then(Value::as_str) {
        if kind != "custom" {
            return Err(TranslateError::new(format!(
                "Server tool type '{kind}' is not supported"
            )));
        }
    }

    let name = obj
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| TranslateError::new("Tool definition missing required 'name'"))?;
    let schema = obj
        .get("input_schema")
        .cloned()
        .unwrap_or_else(|| json!({ "type": "object" }));

    let mut def = json!({
        "type": "function",
        "name": name,
        "parameters": schema,
        "strict": false,
    });
    if let Some(desc) = obj.get("description") {
        def["description"] = desc.clone();
    }
    Ok(def)
}

pub fn convert_tool_choice(choice: &Value) -> Result<Value, TranslateError> {
    let obj = choice
        .as_object()
        .ok_or_else(|| TranslateError::new("tool_choice must be an object"))?;
    match obj.get("type").and_then(Value::as_str) {
        Some("auto") => Ok(json!("auto")),
        Some("any") => Ok(json!("required")),
        Some("none") => Ok(json!("none")),
        Some("tool") => {
            let name = obj
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| TranslateError::new("tool_choice type 'tool' requires 'name'"))?;
            Ok(json!({ "type": "function", "name": name }))
        }
        Some(other) => Err(TranslateError::new(format!(
            "Unsupported tool_choice type '{other}'"
        ))),
        None => Err(TranslateError::new("tool_choice missing 'type'")),
    }
}
