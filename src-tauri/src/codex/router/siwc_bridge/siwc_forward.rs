use super::types::RouterAppState;
use axum::body::Bytes;

/// Strictly validate the public SIWC Responses preview contract.
pub fn prepare_native_siwc_body(body: &Bytes, model: &str, path: &str) -> Result<Bytes, String> {
    if !matches!(path, "/responses" | "/v1/responses") {
        return Err("SIWC supports POST /v1/responses only".into());
    }
    let mut json: serde_json::Value =
        serde_json::from_slice(body).map_err(|_| "SIWC request must contain valid JSON")?;
    let object = json
        .as_object_mut()
        .ok_or("SIWC request must be an object")?;
    // These two values are required by OpenAI, but may be omitted by clients.
    object
        .entry("store")
        .or_insert(serde_json::Value::Bool(false));
    object
        .entry("stream")
        .or_insert(serde_json::Value::Bool(true));
    let checked = super::siwc_request::prepare_siwc_payload(&json, model)?;
    serde_json::to_vec(&checked)
        .map(Bytes::from)
        .map_err(|_| "SIWC payload serialization failed".into())
}

pub async fn native_siwc_bearer(
    state: &RouterAppState,
    registration_id: &str,
) -> Result<String, String> {
    let app = state
        .native_app
        .read()
        .map_err(|_| "Native SIWC registration broker is unavailable")?
        .clone()
        .ok_or("SIWC router is not bound to native account credentials")?;
    crate::codex::siwc::native_access::get_usable_siwc_bearer(&app, registration_id, &state.client)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inserts_required_preview_flags_but_never_overrides_explicit_wrong_values() {
        let request =
            Bytes::from_static(br#"{"model":"alias","input":[{"role":"user","content":"hi"}]}"#);
        let result = prepare_native_siwc_body(&request, "gpt-test", "/v1/responses").unwrap();
        let json: serde_json::Value = serde_json::from_slice(&result).unwrap();
        assert_eq!(json["store"], false);
        assert_eq!(json["stream"], true);
        assert_eq!(json["model"], "gpt-test");
        assert!(prepare_native_siwc_body(
            &Bytes::from_static(br#"{"model":"alias","input":[],"store":true}"#),
            "gpt-test",
            "/v1/responses"
        )
        .is_err());
        assert!(prepare_native_siwc_body(&request, "gpt-test", "/responses/compact").is_err());
    }
}
