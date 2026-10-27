//! One-shot loopback callback, exchange, JWKS verification and persistence.
#[cfg(test)]
use super::callback_http::{parse_callback_head, redirect_response};
use super::callback_http::{read_callback_query, respond_redirect};
use super::commands::{SiwcAccountView, SiwcSignInState};
use super::host::get_or_create_siwc_host_id;
use super::oauth::{
    build_siwc_authorization_url, generate_pkce_params, validate_siwc_callback, PkceParams,
};
use super::oidc::{fetch_openai_jwks, verify_siwc_id_token};
use super::token_exchange::{exchange_authorization_code, is_invalid_grant_error};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;

pub async fn serve_siwc_callback(
    listener: TcpListener,
    app: tauri::AppHandle,
    mut params: PkceParams,
    returning: Option<SiwcAccountView>,
    expected_subject: Option<String>,
    linked_codex_account_id: Option<String>,
    state: SiwcSignInState,
    attempt_id: u64,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
) {
    struct ResetPending(SiwcSignInState, u64);
    impl Drop for ResetPending {
        fn drop(&mut self) {
            self.0.clear_attempt(self.1);
        }
    }
    let _reset = ResetPending(state, attempt_id);
    let local_port = match listener.local_addr() {
        Ok(a) => a.port(),
        Err(_) => return,
    };
    let client = reqwest::Client::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(180);
    let mut retained_client_id = returning.as_ref().map(|r| r.client_id.clone());
    let mut retried_with_issued_id = false;
    loop {
        let accepted = tokio::select! {
            _ = &mut cancel_rx => break,
            res = tokio::time::timeout_at(deadline, listener.accept()) => res,
        };
        let Ok(Ok((mut socket, _))) = accepted else {
            break;
        };
        let Ok(pairs) = read_callback_query(&mut socket, local_port).await else {
            let _ = respond(&mut socket, false, None).await;
            continue;
        };
        let callback_state = pairs.get("state").map(String::as_str).unwrap_or("");
        // An unrelated request cannot terminate an active sign-in.
        if callback_state != params.state {
            let _ = respond(&mut socket, false, None).await;
            continue;
        }
        let mut retry_redirect_url: Option<String> = None;
        let result = async {
            if pairs.contains_key("error") {
                return Err("Authorization declined".to_string());
            }
            let code = pairs.get("code").map(String::as_str).unwrap_or("");
            let issued_id = validate_siwc_callback(
                code,
                callback_state,
                &params.state,
                pairs.get("client_id").map(String::as_str),
                retained_client_id.as_deref(),
            )?;
            let redirect = format!("http://127.0.0.1:{local_port}/auth/callback");
            let grant = match exchange_authorization_code(
                &client,
                &issued_id,
                code,
                &params.verifier,
                &redirect,
            )
            .await
            {
                Ok(grant) => grant,
                Err(err) => {
                    // Shapes only: never the code, verifier or client ID itself.
                    let source = if returning.is_some() {
                        "saved"
                    } else if retried_with_issued_id {
                        "retained_retry"
                    } else {
                        "callback"
                    };
                    crate::logger::log_warn(
                        "siwc",
                        &format!(
                            "SIWC exchange context: client_id_source={source} callback_client_id={} client_id_len={} code_len={} redirect_port={local_port}",
                            pairs.contains_key("client_id"),
                            issued_id.len(),
                            code.len()
                        ),
                    );
                    if should_retry_with_retained_client_id(
                        returning.is_some(),
                        retried_with_issued_id,
                        &err,
                    ) {
                        if let Ok((next_params, retry_url)) = get_or_create_siwc_host_id(&app)
                            .and_then(|host| {
                                build_retained_client_retry(&host, local_port, &issued_id)
                            })
                        {
                            retained_client_id = Some(issued_id);
                            retried_with_issued_id = true;
                            params = next_params;
                            retry_redirect_url = Some(retry_url);
                            return Ok(());
                        }
                    }
                    return Err(err);
                }
            };
            // An identity-only consent remains saved but is not routable.
            let id_token = grant
                .id_token()
                .ok_or("Missing signed SIWC identity token")?;
            let jwks = fetch_openai_jwks(&client).await?;
            let identity = verify_siwc_id_token(id_token, &jwks, &issued_id, &params.nonce)?;
            if let Some(old) = returning.as_ref() {
                let verified_subject = if old.linked_codex_account_id.is_some() {
                    expected_subject.as_deref().unwrap_or(old.subject.as_str())
                } else {
                    identity.subject()
                };
                if !siwc_subject_matches(Some(old.subject.as_str()), verified_subject) {
                    return Err("Reauthorization selected a different ChatGPT account".into());
                }
            } else if linked_codex_account_id.is_none() {
                if let Some(expected) = expected_subject.as_deref() {
                    if !siwc_subject_matches(Some(expected), identity.subject()) {
                        return Err("The selected ChatGPT account does not match the Codex account. No routing authorization was linked.".into());
                    }
                }
            }
            if let Some(previous) =
                returning.as_ref().and_then(|r| r.linked_codex_account_id.as_deref())
            {
                if linked_codex_account_id.as_deref().is_some_and(|next| next != previous) {
                    return Err("Cannot reassign an issued SIWC registration to a different Codex workspace".into());
                }
            }
            let mut session = grant.into_session(issued_id, &identity)?;
            if let Some(bound_subject) = expected_subject
                .clone()
                .or_else(|| returning.as_ref().map(|r| r.subject.clone()))
            {
                session.bind_subject(bound_subject);
            }
            session.bind_codex_account(
                linked_codex_account_id.clone().or_else(|| {
                    returning
                        .as_ref()
                        .and_then(|r| r.linked_codex_account_id.clone())
                }),
            );
            let existing_unlinked_id = if returning.is_none() && linked_codex_account_id.is_some()
            {
                super::commands::list_native_accounts(&app)
                    .ok()
                    .and_then(|list| {
                        list.into_iter()
                            .find(|r| {
                                r.linked_codex_account_id.is_none()
                                    && (r.subject == identity.subject()
                                        || (!r.email.is_empty()
                                            && Some(r.email.as_str()) == identity.email()))
                            })
                            .map(|r| r.id)
                    })
            } else {
                None
            };
            let registration_id = returning
                .as_ref()
                .map(|r| r.id.clone())
                .or(existing_unlinked_id)
                .unwrap_or_else(|| {
                    format!("reg_{}", crate::auth::oauth::utils::random_base64url(16))
                });
            crate::storage::secure_storage::save_native_siwc_session(
                &app,
                &registration_id,
                serde_json::to_string(&session)
                    .map_err(|_| "Cannot serialize SIWC registration")?,
            )?;
            Ok::<_, String>(())
        }
        .await;
        if let Some(retry_url) = retry_redirect_url {
            crate::logger::log_warn(
                "siwc",
                "SIWC initial dynamic code exchange returned invalid_grant; starting fresh authorization pass with retained issued client_id",
            );
            let _ = respond_redirect(&mut socket, &retry_url).await;
            continue;
        }
        if let Err(error) = &result {
            // Sanitized diagnostics only. Do not log callback codes, claims or tokens.
            crate::logger::log_warn("siwc", &format!("SIWC sign-in unsuccessful: {}", error));
            _reset.0.record_error(error.clone());
        }
        let _ = respond(
            &mut socket,
            result.is_ok(),
            result.as_ref().err().map(String::as_str),
        )
        .await;
        break;
    }
}

fn should_retry_with_retained_client_id(
    is_returning: bool,
    already_retried: bool,
    error: &str,
) -> bool {
    !is_returning && !already_retried && is_invalid_grant_error(error)
}

fn build_retained_client_retry(
    host_id: &str,
    local_port: u16,
    issued_client_id: &str,
) -> Result<(PkceParams, String), String> {
    let next_params = generate_pkce_params();
    let retry_url =
        build_siwc_authorization_url(host_id, local_port, Some(issued_client_id), &next_params)?;
    Ok((next_params, retry_url))
}

fn siwc_subject_matches(expected: Option<&str>, verified: &str) -> bool {
    !verified.is_empty() && expected.is_none_or(|subject| subject == verified)
}

#[cfg(test)]
#[path = "tests/callback_test.rs"]
mod callback_tests;

/// Reasons are QuotaShift's own sanitized error strings; never tokens or callback codes.
fn callback_page(ok: bool, reason: Option<&str>) -> (&'static str, String) {
    let (status, message, script) = if ok {
        (
            "200 OK",
            "\u{2713} QuotaShift sign-in completed &mdash; you can close this tab.",
            "<script>setTimeout(()=>window.close(),1500);</script>",
        )
    } else {
        (
            "400 Bad Request",
            "\u{2715} QuotaShift sign-in unsuccessful &mdash; you can close this tab and return to QuotaShift.",
            "",
        )
    };
    let detail = reason
        .filter(|_| !ok)
        .map(|r| format!("<p class=\"reason\">{}</p>", escape_html(r)))
        .unwrap_or_default();
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#0a0a0a;font-family:system-ui;color:#fff;font-size:15px;}}p{{opacity:.8;margin:6px 24px;text-align:center}}.reason{{opacity:.6;font-size:13px}}</style></head><body><p>{message}</p>{detail}{script}</body></html>"
    );
    (status, body)
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

async fn respond(
    socket: &mut tokio::net::TcpStream,
    ok: bool,
    reason: Option<&str>,
) -> std::io::Result<()> {
    let (status, body) = callback_page(ok, reason);
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}", body.len(), body);
    socket.write_all(response.as_bytes()).await
}
