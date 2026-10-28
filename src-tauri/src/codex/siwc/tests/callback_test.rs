use super::*;

#[test]
fn matching_codex_subject_is_required_before_linking() {
    assert!(siwc_subject_matches(Some("subject-a"), "subject-a"));
    assert!(!siwc_subject_matches(Some("subject-a"), "subject-b"));
    assert!(!siwc_subject_matches(Some("subject-a"), ""));
    assert!(siwc_subject_matches(None, "subject-b"));
}

#[test]
fn failure_page_shows_escaped_reason() {
    let (status, body) = callback_page(false, Some("Token <x> & \"y\" (HTTP 400: invalid_grant)"));
    assert_eq!(status, "400 Bad Request");
    assert!(body.contains("Token &lt;x&gt; &amp; &quot;y&quot; (HTTP 400: invalid_grant)"));
    assert!(!body.contains("<x>"));
    let (status, body) = callback_page(true, None);
    assert_eq!(status, "200 OK");
    assert!(body.contains("window.close()"));
}

#[test]
fn complete_callback_headers_are_required() {
    assert!(parse_callback_head(
        b"GET /auth/callback?state=ok&code=xyz HTTP/1.1\r\nHost: 127.0.0.1:6789",
        6789,
    )
    .is_ok());
    assert!(parse_callback_head(
        b"GET /auth/callback?state=ok HTTP/1.1\r\nHost: evil.example",
        6789,
    )
    .is_err());
    assert!(parse_callback_head(
        b"POST /auth/callback?state=ok HTTP/1.1\r\nHost: 127.0.0.1:6789",
        6789,
    )
    .is_err());
}

#[test]
fn retries_once_with_retained_client_id_on_initial_invalid_grant() {
    let invalid_grant_err =
        "OpenAI rejected this sign-in token exchange. (HTTP 400 Bad Request: invalid_grant)";
    assert!(should_retry_with_retained_client_id(
        false,
        false,
        invalid_grant_err
    ));
    assert!(!should_retry_with_retained_client_id(
        true,
        false,
        invalid_grant_err
    ));
    assert!(!should_retry_with_retained_client_id(
        false,
        true,
        invalid_grant_err
    ));
    assert!(!should_retry_with_retained_client_id(
        false,
        false,
        "SIWC OAuth token server unreachable"
    ));

    let issued_id = "0123456789abcdef0123456789abcdef";
    let (next_params, retry_url) = build_retained_client_retry(
        "urn:uuid:00000000-0000-4000-8000-000000000001",
        61128,
        issued_id,
    )
    .unwrap();
    assert!(!next_params.state.is_empty());
    assert!(retry_url.contains(&format!("client_id={issued_id}")));
    assert!(!retry_url.contains("client_id=dynamic_agent_client"));

    let redirect = redirect_response(&retry_url);
    assert!(redirect.starts_with("HTTP/1.1 302 Found\r\nLocation: https://auth.openai.com/"));
}
