use serde_json::Value;
use std::sync::{Mutex, OnceLock};

pub mod utils;
pub use utils::*;

pub mod codex_client_id;
pub use codex_client_id::*;

pub mod codex;
pub use codex::*;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
fn ag_consumer_client_id() -> String {
    crate::credential_store::consumer_client_id()
}
fn ag_consumer_client_secret() -> String {
    crate::credential_store::consumer_client_secret()
}
const AG_GOOGLE_REDIRECT_PORT: u16 = 1456;
const AG_GOOGLE_SCOPES: &str = "openid email profile https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs";

struct GoogleOAuthPending {
    verifier: String,
    _state: String,
    redirect_uri: String,
}

fn get_google_oauth_pending() -> &'static Mutex<Option<GoogleOAuthPending>> {
    static PENDING: OnceLock<Mutex<Option<GoogleOAuthPending>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(None))
}

fn get_google_oauth_cancel() -> &'static Mutex<Option<tokio::sync::oneshot::Sender<()>>> {
    static CANCEL: OnceLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = OnceLock::new();
    CANCEL.get_or_init(|| Mutex::new(None))
}

pub async fn start_antigravity_google_oauth(
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    let verifier = random_base64url(32);
    let challenge = pkce_challenge(&verifier);
    let state = random_base64url(16);

    let prev_cancel = get_google_oauth_cancel().lock().unwrap().take();
    if let Some(cancel_tx) = prev_cancel {
        let _ = cancel_tx.send(());
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let addr = format!("127.0.0.1:{}", AG_GOOGLE_REDIRECT_PORT);
    let mut listener = None;
    for attempt in 0..5 {
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => {
                listener = Some(l);
                break;
            }
            Err(_e) if attempt < 4 => {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
            Err(e) => {
                return Err(format!(
                    "Failed to bind to port {}: {}. Make sure port {} is free.",
                    AG_GOOGLE_REDIRECT_PORT, e, AG_GOOGLE_REDIRECT_PORT
                ));
            }
        }
    }
    let listener = listener.unwrap();
    let redirect_uri = format!("http://localhost:{}/auth/callback", AG_GOOGLE_REDIRECT_PORT);

    let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();
    *get_google_oauth_cancel().lock().unwrap() = Some(tx);

    {
        let mut pending = get_google_oauth_pending().lock().unwrap();
        *pending = Some(GoogleOAuthPending {
            verifier: verifier.clone(),
            _state: state.clone(),
            redirect_uri: redirect_uri.clone(),
        });
    }

    let expected_state = state.clone();
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                accept_res = listener.accept() => {
                    if let Ok((mut stream, _)) = accept_res {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut buf = vec![0u8; 8192];
                        let n = stream.read(&mut buf).await.unwrap_or(0);
                        if n == 0 {
                            continue;
                        }
                        let request = String::from_utf8_lossy(&buf[..n]).into_owned();

                        if request.starts_with("GET /favicon.ico") {
                            let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                            let _ = stream.write_all(resp.as_bytes()).await;
                            let _ = stream.flush().await;
                            continue;
                        }

                        let code = extract_callback_param(&request, "code");
                        let recv_state = extract_callback_param(&request, "state");
                        let error = extract_callback_param(&request, "error");

                        if code.is_none() && error.is_none() && recv_state.is_none() {
                            let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                            let _ = stream.write_all(resp.as_bytes()).await;
                            let _ = stream.flush().await;
                            continue;
                        }

                        let html = r#"<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui;color:#fff;font-size:15px;}p{opacity:.8}</style></head><body><p>&#10003; Login successful &mdash; you can close this tab.</p><script>setTimeout(()=>window.close(),1500);</script></body></html>"#;
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(), html
                        );
                        let _ = stream.write_all(resp.as_bytes()).await;
                        let _ = stream.flush().await;

                        let payload = if let Some(err) = error {
                            serde_json::json!({ "error": err })
                        } else if recv_state.as_deref() != Some(&expected_state) {
                            serde_json::json!({ "error": "state_mismatch" })
                        } else if let Some(code) = code {
                            serde_json::json!({ "code": code })
                        } else {
                            serde_json::json!({ "error": "no_code" })
                        };

                        use tauri::Emitter;
                        let _ = app_handle_clone.emit("google-oauth-callback", payload);
                        break;
                    }
                }
                _ = &mut rx => {
                    break;
                }
            }
        }
    });

    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code\
        &scope={}&code_challenge={}&code_challenge_method=S256\
        &state={}&prompt=consent&access_type=offline",
        GOOGLE_AUTH_URL,
        ag_consumer_client_id(),
        pct_encode(&redirect_uri),
        pct_encode(AG_GOOGLE_SCOPES),
        challenge,
        state,
    );

    Ok(auth_url)
}

pub async fn exchange_antigravity_google_token(code: String) -> Result<Value, String> {
    let (verifier, redirect_uri) = {
        let pending = get_google_oauth_pending().lock().unwrap();
        let p = pending.as_ref().ok_or("No pending Google OAuth flow")?;
        (p.verifier.clone(), p.redirect_uri.clone())
    };

    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code".to_string()),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("code_verifier", verifier),
        ("client_id", ag_consumer_client_id().to_string()),
        ("client_secret", ag_consumer_client_secret().to_string()),
    ];

    let res = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Google token exchange failed ({status}): {body}"));
    }

    let mut json: Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(token) = json.get("access_token").and_then(|v| v.as_str()) {
        if let Ok(user_info_res) = client
            .get("https://www.googleapis.com/oauth2/v3/userinfo")
            .bearer_auth(token)
            .send()
            .await
        {
            if user_info_res.status().is_success() {
                if let Ok(info) = user_info_res.json::<Value>().await {
                    if let Some(obj) = json.as_object_mut() {
                        if let Some(e) = info.get("email").and_then(|v| v.as_str()) {
                            obj.insert("email".to_string(), Value::String(e.to_string()));
                        }
                        if let Some(p) = info.get("picture").and_then(|v| v.as_str()) {
                            obj.insert("picture".to_string(), Value::String(p.to_string()));
                        }
                    }
                }
            }
        }
    }
    if let Some(obj) = json.as_object_mut() {
        obj.insert(
            "authMethod".to_string(),
            Value::String("consumer".to_string()),
        );
    }
    Ok(json)
}

pub async fn reset_google_oauth_session() -> Result<(), String> {
    if let Some(tx) = get_google_oauth_cancel().lock().unwrap().take() {
        let _ = tx.send(());
    }
    let mut pending = get_google_oauth_pending().lock().unwrap();
    *pending = None;
    Ok(())
}
