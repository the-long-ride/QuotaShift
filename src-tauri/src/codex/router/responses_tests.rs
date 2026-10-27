use super::responses_transport::{
    process_sse_stream, AuthTransport, RefreshGate, SseStreamOutcome, StreamCommitTracker,
};
use super::siwc_request::{get_siwc_endpoint, prepare_siwc_payload, validate_siwc_request};
use serde_json::json;
use std::sync::Arc;

#[test]
fn siwc_requires_store_false_stream_true_array_input() {
    // Valid SIWC payload
    let valid = json!({
        "model": "public-alias",
        "store": false,
        "stream": true,
        "input": [
            {"role": "user", "content": "Hello"}
        ]
    });
    assert!(validate_siwc_request(&valid).is_ok());

    let prepared = prepare_siwc_payload(&valid, "gpt-4o").expect("prepared");
    assert_eq!(prepared["model"], "gpt-4o");
    assert_eq!(prepared["store"], false);
    assert_eq!(prepared["stream"], true);

    // Missing store: false
    let missing_store = json!({
        "model": "gpt-4o",
        "stream": true,
        "input": []
    });
    assert!(validate_siwc_request(&missing_store).is_err());

    // store: true is rejected
    let store_true = json!({
        "model": "gpt-4o",
        "store": true,
        "stream": true,
        "input": []
    });
    assert!(validate_siwc_request(&store_true).is_err());

    // stream: false is rejected
    let stream_false = json!({
        "model": "gpt-4o",
        "store": false,
        "stream": false,
        "input": []
    });
    assert!(validate_siwc_request(&stream_false).is_err());

    // Non-array input is rejected
    let non_array_input = json!({
        "model": "gpt-4o",
        "store": false,
        "stream": true,
        "input": "just a string"
    });
    assert!(validate_siwc_request(&non_array_input).is_err());
}

#[test]
fn siwc_rejects_unsupported_preview_fields() {
    let banned_fields = [
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
    ];

    for field in banned_fields {
        let mut payload = json!({
            "model": "gpt-4o",
            "store": false,
            "stream": true,
            "input": []
        });
        payload
            .as_object_mut()
            .unwrap()
            .insert(field.to_string(), json!("val"));
        let result = validate_siwc_request(&payload);
        assert!(
            result.is_err(),
            "Expected field '{}' to be rejected by SIWC policy",
            field
        );
    }
}

#[test]
fn siwc_does_not_use_private_backend_endpoint() {
    let endpoint = get_siwc_endpoint();
    assert_eq!(endpoint, "https://api.openai.com/v1/responses");
    assert!(!endpoint.contains("chatgpt.com"));
    assert!(!endpoint.contains("backend-api"));
}

#[test]
fn api_key_transport_billing_separate() {
    let siwc_auth = AuthTransport::Siwc {
        access_token: "siwc-acc-tok-123".to_string(),
    };
    let api_key_auth = AuthTransport::OpenAiApiKey {
        api_key: "sk-proj-xyz789".to_string(),
    };

    assert_eq!(siwc_auth.billing_domain(), "chatgpt_subscription");
    assert_eq!(api_key_auth.billing_domain(), "api_metered_billing");
    assert_ne!(
        siwc_auth.auth_header_value(),
        api_key_auth.auth_header_value()
    );
    assert!(siwc_auth.is_siwc());
    assert!(!api_key_auth.is_siwc());
}

#[test]
fn catalog_not_entitlement() {
    use crate::codex::siwc::accounts::AccountCatalog;

    let mut catalog = AccountCatalog::new();
    // Catalog contains model ids, but registration must be specifically verified
    assert!(!catalog.is_eligible("unverified-account"));

    catalog.add_account("verified-account", true);
    assert!(catalog.is_eligible("verified-account"));
}

#[test]
fn stream_failed_is_not_success() {
    let sse_events = vec![
        "event: response.created\ndata: {\"id\":\"resp-1\"}\n\n".to_string(),
        "event: response.failed\ndata: {\"error\":{\"message\":\"Rate limit exceeded\"}}\n\n"
            .to_string(),
    ];

    let outcome = process_sse_stream(&sse_events);
    assert_ne!(outcome, SseStreamOutcome::Completed);
    assert!(matches!(outcome, SseStreamOutcome::Failed(_)));
}

#[test]
fn stream_incomplete_is_not_success() {
    let sse_events = vec![
        "event: response.created\ndata: {\"id\":\"resp-1\"}\n\n".to_string(),
        "event: response.incomplete\ndata: {\"reason\":\"max_tokens\"}\n\n".to_string(),
    ];

    let outcome = process_sse_stream(&sse_events);
    assert_ne!(outcome, SseStreamOutcome::Completed);
    assert!(matches!(outcome, SseStreamOutcome::Incomplete(_)));
}

#[test]
fn truncated_sse_is_not_success() {
    let sse_events = vec![
        "event: response.created\ndata: {\"id\":\"resp-1\"}\n\n".to_string(),
        "event: response.output_item.added\ndata: {}\n\n".to_string(),
        // Stream terminates abruptly without response.completed
    ];

    let outcome = process_sse_stream(&sse_events);
    assert_ne!(outcome, SseStreamOutcome::Completed);
    assert_eq!(outcome, SseStreamOutcome::Truncated);
}

#[test]
fn client_cancel_closes_upstream() {
    let tracker = StreamCommitTracker::new();
    assert!(!tracker.is_cancelled());
    tracker.cancel();
    assert!(tracker.is_cancelled());
}

#[test]
fn no_post_commit_failover() {
    let mut tracker = StreamCommitTracker::new();
    assert!(tracker.can_failover(), "Pre-commit should allow failover");

    tracker.mark_downstream_committed();
    assert!(
        !tracker.can_failover(),
        "Post-commit failover must be strictly forbidden"
    );
}

#[tokio::test]
async fn credential_refresh_singleflight() {
    let gate = Arc::new(RefreshGate::new());
    let mut handles = vec![];

    for i in 0..5 {
        let g = Arc::clone(&gate);
        handles.push(tokio::spawn(async move {
            g.execute_refresh(|| async {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                Ok(format!("token_v{}", i + 1))
            })
            .await
        }));
    }

    let mut results = vec![];
    for h in handles {
        results.push(h.await.unwrap());
    }

    // Single-flight ensures only 1 refresh execution ran and all shared the token
    assert_eq!(gate.execution_count(), 1);
    let first = &results[0];
    for r in &results {
        assert_eq!(r, first);
    }
}

#[test]
fn siwc_disallows_stored_response_references_and_system_items() {
    for request in [
        json!({"model":"gpt-test","store":false,"stream":true,"input":[],"previous_response_id":"resp-123"}),
        json!({"model":"gpt-test","store":false,"stream":true,"input":[{"type":"message","role":"system","content":"secret"}]}),
        json!({"model":"gpt-test","store":false,"stream":true,"input":[{"role":"system","content":"secret"}]}),
    ] {
        assert!(validate_siwc_request(&request).is_err(), "{request}");
    }
    assert!(validate_siwc_request(&json!({
        "model":"gpt-test","store":false,"stream":true,
        "instructions":"Prefer concise responses",
        "input":[{"role":"user","content":"Hello"}]
    }))
    .is_ok());
}

#[test]
fn siwc_sse_cannot_count_forged_completion_marker_as_success() {
    let forged = vec![concat!(
        r#"event: response.completed
data: {"type":"response.failed"}

"#
    )
    .to_string()];
    assert_ne!(process_sse_stream(&forged), SseStreamOutcome::Completed);
    let missing_payload = vec!["event: response.completed\n\n".to_string()];
    assert_ne!(
        process_sse_stream(&missing_payload),
        SseStreamOutcome::Completed
    );
    let completed = vec![r#"event: response.completed
data: {"type":"response.completed","response":{"status":"completed"}}

"#
    .to_string()];
    assert_eq!(process_sse_stream(&completed), SseStreamOutcome::Completed);
}
