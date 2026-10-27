use super::request::{
    convert_anthropic_to_responses, convert_anthropic_to_responses_with_options, requested_model,
};
use serde_json::{json, Value};

fn convert(req: Value) -> Value {
    convert_anthropic_to_responses(&req, "gpt-5").expect("convert")
}

fn user(content: Value) -> Value {
    json!({ "model": "m", "messages": [{ "role": "user", "content": content }] })
}

fn contains_key(v: &Value, key: &str) -> bool {
    match v {
        Value::Object(m) => m.contains_key(key) || m.values().any(|x| contains_key(x, key)),
        Value::Array(a) => a.iter().any(|x| contains_key(x, key)),
        _ => false,
    }
}

#[test]
fn base_payload_flags_and_model() {
    let out = convert(user(json!("hi")));
    assert_eq!(out["model"], "gpt-5");
    assert_eq!(out["store"], false);
    assert_eq!(out["stream"], true);
    assert!(out.get("instructions").is_none());
}

#[test]
fn requested_model_reads_model_field() {
    assert_eq!(requested_model(&json!({"model": "opus"})), Some("opus"));
    assert_eq!(requested_model(&json!({})), None);
}

#[test]
fn system_blocks_join_with_blank_line() {
    let mut req = user(json!("hi"));
    req["system"] = json!([{ "type": "text", "text": "a" }, { "type": "text", "text": "b" }]);
    assert_eq!(convert(req)["instructions"], "a\n\nb");
}

#[test]
fn system_string_is_instructions() {
    let mut req = user(json!("hi"));
    req["system"] = json!("be brief");
    assert_eq!(convert(req)["instructions"], "be brief");
}

#[test]
fn system_role_messages_merge_into_instructions() {
    let req = json!({
        "model": "m",
        "system": "top-level system",
        "messages": [
            { "role": "system", "content": "msg system 1" },
            { "role": "user", "content": "hi" },
            { "role": "system", "content": [{ "type": "text", "text": "msg system 2" }] }
        ]
    });
    let out = convert(req);
    assert_eq!(
        out["instructions"],
        "top-level system\n\nmsg system 1\n\nmsg system 2"
    );
    let input = out["input"].as_array().unwrap();
    assert_eq!(input.len(), 1);
    assert_eq!(input[0]["role"], "user");
}

#[test]
fn system_role_message_without_top_level_system_sets_instructions() {
    let req = json!({
        "model": "m",
        "messages": [
            { "role": "system", "content": "only in messages" },
            { "role": "user", "content": "hi" }
        ]
    });
    let out = convert(req);
    assert_eq!(out["instructions"], "only in messages");
    assert_eq!(out["input"].as_array().unwrap().len(), 1);
}

#[test]
fn user_text_becomes_input_text() {
    let out = convert(user(json!([{ "type": "text", "text": "hi" }])));
    assert_eq!(
        out["input"][0],
        json!({"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]})
    );
}

#[test]
fn assistant_text_becomes_output_text() {
    let req = json!({ "messages": [{ "role": "assistant", "content": [{ "type": "text", "text": "yo" }] }] });
    assert_eq!(
        convert(req)["input"][0],
        json!({"type":"message","role":"assistant","content":[{"type":"output_text","text":"yo"}]})
    );
}

#[test]
fn string_content_is_treated_as_one_text_block() {
    let out = convert(user(json!("hi")));
    assert_eq!(
        out["input"][0],
        json!({"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]})
    );
}

#[test]
fn message_order_is_preserved() {
    let req = json!({ "messages": [
        { "role": "user", "content": "q1" },
        { "role": "assistant", "content": "a1" },
        { "role": "user", "content": "q2" }
    ]});
    let input = convert(req)["input"].as_array().unwrap().clone();
    assert_eq!(input.len(), 3);
    assert_eq!(input[0]["role"], "user");
    assert_eq!(input[1]["role"], "assistant");
    assert_eq!(input[2]["content"][0]["text"], "q2");
}

#[test]
fn base64_image_becomes_data_url_input_image() {
    let out = convert(user(json!([{ "type": "image", "source":
        { "type": "base64", "media_type": "image/png", "data": "AAA" } }])));
    assert_eq!(
        out["input"][0]["content"][0],
        json!({"type":"input_image","image_url":"data:image/png;base64,AAA"})
    );
}

#[test]
fn url_image_uses_url() {
    let out = convert(user(json!([{ "type": "image", "source":
        { "type": "url", "url": "https://x.test/a.png" } }])));
    assert_eq!(
        out["input"][0]["content"][0],
        json!({"type":"input_image","image_url":"https://x.test/a.png"})
    );
}

#[test]
fn tool_use_becomes_function_call() {
    let req = json!({ "messages": [{ "role": "assistant", "content": [
        { "type": "tool_use", "id": "toolu_1", "name": "calc", "input": { "e": "2+2" } }
    ]}]});
    let item = convert(req)["input"][0].clone();
    assert_eq!(item["type"], "function_call");
    assert_eq!(item["call_id"], "toolu_1");
    assert_eq!(item["name"], "calc");
    assert_eq!(item["arguments"], "{\"e\":\"2+2\"}");
}

#[test]
fn parallel_tool_uses_keep_order() {
    let req = json!({ "messages": [{ "role": "assistant", "content": [
        { "type": "text", "text": "go" },
        { "type": "tool_use", "id": "c1", "name": "f1", "input": {} },
        { "type": "tool_use", "id": "c2", "name": "f2", "input": {} }
    ]}]});
    let input = convert(req)["input"].as_array().unwrap().clone();
    assert_eq!(input.len(), 3);
    assert_eq!(input[0]["type"], "message");
    assert_eq!(input[1]["call_id"], "c1");
    assert_eq!(input[2]["call_id"], "c2");
}

#[test]
fn tool_result_text_becomes_function_call_output() {
    let out = convert(user(
        json!([{ "type": "tool_result", "tool_use_id": "c1", "content": "ok" }]),
    ));
    assert_eq!(
        out["input"][0],
        json!({"type":"function_call_output","call_id":"c1","output":"ok"})
    );
}

#[test]
fn tool_result_error_is_prefixed() {
    let out = convert(user(json!([{ "type": "tool_result", "tool_use_id": "c1",
        "is_error": true, "content": [{ "type": "text", "text": "boom" }] }])));
    assert_eq!(out["input"][0]["output"], "Error: boom");
}

#[test]
fn tool_result_with_image_parts_splits_output_and_image() {
    let out = convert(user(
        json!([{ "type": "tool_result", "tool_use_id": "c1", "content": [
            { "type": "text", "text": "one" },
            { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "AAA" } },
            { "type": "text", "text": "two" }
        ]}]),
    ));
    let input = out["input"].as_array().unwrap();
    assert_eq!(input.len(), 2);
    assert_eq!(
        input[0],
        json!({"type":"function_call_output","call_id":"c1","output":"one\ntwo"})
    );
    assert_eq!(
        input[1],
        json!({"type":"message","role":"user","content":[
            {"type":"input_image","image_url":"data:image/png;base64,AAA"}]})
    );
}

#[test]
fn user_text_after_tool_result_keeps_order() {
    let out = convert(user(json!([
        { "type": "tool_result", "tool_use_id": "c1", "content": "ok" },
        { "type": "text", "text": "next" }
    ])));
    let input = out["input"].as_array().unwrap();
    assert_eq!(input[0]["type"], "function_call_output");
    assert_eq!(input[1]["content"][0]["text"], "next");
}

#[test]
fn dropped_fields_never_reach_payload() {
    let req = json!({
        "model": "m", "max_tokens": 10, "temperature": 0.5, "top_p": 0.9, "top_k": 5,
        "stop_sequences": ["x"], "metadata": { "user_id": "u" },
        "messages": [{ "role": "user", "content": [
            { "type": "text", "text": "hi", "cache_control": { "type": "ephemeral" } }
        ]}]
    });
    let out = convert(req);
    for key in [
        "max_tokens",
        "max_output_tokens",
        "temperature",
        "top_p",
        "top_k",
    ] {
        assert!(!contains_key(&out, key), "{key}");
    }
    for key in ["stop_sequences", "metadata", "cache_control"] {
        assert!(!contains_key(&out, key), "{key}");
    }
}

#[test]
fn thinking_blocks_are_dropped() {
    let req = json!({ "messages": [{ "role": "assistant", "content": [
        { "type": "thinking", "thinking": "hmm", "signature": "s" },
        { "type": "redacted_thinking", "data": "x" },
        { "type": "text", "text": "answer" }
    ]}]});
    let input = convert(req)["input"].as_array().unwrap().clone();
    assert_eq!(input.len(), 1);
    assert_eq!(
        input[0]["content"],
        json!([{"type":"output_text","text":"answer"}])
    );
}

#[test]
fn thinking_budget_maps_to_effort() {
    for (budget, effort) in [
        (512, "minimal"),
        (1024, "low"),
        (4096, "medium"),
        (16384, "high"),
        (32768, "xhigh"),
    ] {
        let mut req = user(json!("hi"));
        req["thinking"] = json!({ "type": "enabled", "budget_tokens": budget });
        assert_eq!(convert(req)["reasoning"]["effort"], effort, "{budget}");
    }
    assert!(convert(user(json!("hi"))).get("reasoning").is_none());
}

#[test]
fn pool_default_effort_and_budget_apply_when_thinking_omitted() {
    let req = user(json!("hi"));
    let out = convert_anthropic_to_responses_with_options(&req, "gpt-5", Some("high"), Some(16384))
        .expect("convert with pool options");
    assert_eq!(out["reasoning"]["effort"], "high");
    let from_budget = convert_anthropic_to_responses_with_options(&req, "gpt-5", None, Some(32768))
        .expect("convert with pool budget");
    assert_eq!(from_budget["reasoning"]["effort"], "xhigh");
    let mut dynamic_req = user(json!("hi"));
    dynamic_req["thinking"] = json!({ "type": "enabled", "budget_tokens": 8192 });
    dynamic_req["output_config"] = json!({ "effort": "max" });
    let overridden = convert_anthropic_to_responses_with_options(
        &dynamic_req,
        "gpt-5",
        Some("medium"),
        Some(8192),
    )
    .expect("dynamic output_config.effort overrides pinned budget");
    assert_eq!(overridden["reasoning"]["effort"], "xhigh");
}
