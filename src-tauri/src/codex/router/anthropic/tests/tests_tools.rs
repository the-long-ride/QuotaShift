use super::request::convert_anthropic_to_responses;
use crate::codex::router::validate_siwc_request;
use serde_json::{json, Value};

fn convert(req: Value) -> Value {
    convert_anthropic_to_responses(&req, "gpt-5").expect("convert")
}

fn user(content: Value) -> Value {
    json!({ "model": "m", "messages": [{ "role": "user", "content": content }] })
}

#[test]
fn document_block_is_rejected_by_name() {
    let err = convert_anthropic_to_responses(
        &user(json!([{ "type": "document", "source": {} }])),
        "gpt-5",
    )
    .unwrap_err();
    assert!(err.message.contains("document"), "{}", err.message);
}

#[test]
fn server_tool_is_rejected() {
    let mut req = user(json!("hi"));
    req["tools"] = json!([{ "type": "web_search_20250305", "name": "web_search" }]);
    let err = convert_anthropic_to_responses(&req, "gpt-5").unwrap_err();
    assert!(
        err.message.contains("web_search_20250305"),
        "{}",
        err.message
    );
}

#[test]
fn tools_map_with_strict_false() {
    let mut req = user(json!("hi"));
    let schema = json!({ "type": "object", "properties": { "p": { "type": "string" } } });
    req["tools"] = json!([{ "name": "read", "description": "d", "input_schema": schema.clone() }]);
    assert_eq!(
        convert(req)["tools"][0],
        json!({"type":"function","name":"read","description":"d","parameters":schema,"strict":false})
    );
}

#[test]
fn custom_typed_tool_is_accepted() {
    let mut req = user(json!("hi"));
    req["tools"] = json!([{ "type": "custom", "name": "t", "input_schema": { "type": "object" } }]);
    assert_eq!(convert(req)["tools"][0]["name"], "t");
}

#[test]
fn duplicate_tool_names_are_not_pre_empted() {
    let mut req = user(json!("hi"));
    let t = json!({ "name": "d", "input_schema": { "type": "object" } });
    req["tools"] = json!([t.clone(), t]);
    assert_eq!(convert(req)["tools"].as_array().unwrap().len(), 2);
}

#[test]
fn tool_choice_maps() {
    let cases = [
        (json!({"type":"auto"}), json!("auto")),
        (json!({"type":"any"}), json!("required")),
        (json!({"type":"none"}), json!("none")),
        (
            json!({"type":"tool","name":"x"}),
            json!({"type":"function","name":"x"}),
        ),
    ];
    for (choice, want) in cases {
        let mut req = user(json!("hi"));
        req["tool_choice"] = choice;
        assert_eq!(convert(req)["tool_choice"], want);
    }
}

#[test]
fn unknown_tool_choice_is_rejected() {
    let mut req = user(json!("hi"));
    req["tool_choice"] = json!({ "type": "exotic" });
    assert!(convert_anthropic_to_responses(&req, "gpt-5").is_err());
}

#[test]
fn unknown_role_message_is_rejected() {
    let req = json!({ "messages": [{ "role": "tool", "content": "x" }] });
    assert!(convert_anthropic_to_responses(&req, "gpt-5").is_err());
}

#[test]
fn system_role_message_passes_siwc_validation() {
    let req = json!({
        "model": "m",
        "messages": [
            { "role": "system", "content": "sys" },
            { "role": "user", "content": "hi" }
        ]
    });
    let payload = convert(req);
    assert_eq!(payload["input"][0]["role"], "developer");
    assert_eq!(payload["input"][0]["content"][0]["text"], "sys");
    assert!(validate_siwc_request(&payload).is_ok());
}

#[test]
fn missing_messages_is_rejected() {
    assert!(convert_anthropic_to_responses(&json!({ "model": "m" }), "gpt-5").is_err());
}

#[test]
fn payload_passes_siwc_validation() {
    let req = json!({
        "model": "m", "system": "sys",
        "tools": [{ "name": "t", "input_schema": { "type": "object" } }],
        "thinking": { "type": "enabled", "budget_tokens": 2000 },
        "messages": [
            { "role": "user", "content": "go" },
            { "role": "assistant", "content": [
                { "type": "tool_use", "id": "c1", "name": "t", "input": {} }] },
            { "role": "user", "content": [
                { "type": "tool_result", "tool_use_id": "c1", "content": "done" }] }
        ]
    });
    let payload = convert(req);
    assert!(validate_siwc_request(&payload).is_ok());
}

#[test]
fn estimate_counts_blocks_and_tools() {
    use super::count_tokens::estimate_tokens;
    let req = json!({
        "system": [{"type": "text", "text": "abcd"}],
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "abcd"}]},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "x",
                "content": [{"type": "text", "text": "abcd"}]}]}
        ]
    });
    assert_eq!(estimate_tokens(&req), 3);
    let with_tool = json!({"messages": [], "tools": [{"name": "t"}]});
    assert!(estimate_tokens(&with_tool) > 0);
    assert_eq!(estimate_tokens(&json!({})), 0);
}
