use std::sync::{Mutex, OnceLock};
use serde_json::Value;
use rand::Rng;
use sha2::{Digest, Sha256};

const CHATGPT_AUTH_URL: &str = "https://auth.openai.com/oauth/authorize";
const CHATGPT_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
fn chatgpt_client_id() -> &'static str { crate::secrets::CHATGPT_CLIENT_ID }
const CHATGPT_REDIRECT_PORT: u16 = 1455;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
fn ag_consumer_client_id() -> String { crate::credential_store::consumer_client_id() }
fn ag_consumer_client_secret() -> String { crate::credential_store::consumer_client_secret() }
const AG_GOOGLE_REDIRECT_PORT: u16 = 1456;
const AG_GOOGLE_SCOPES: &str = "openid email profile https://www.googleapis.com/auth/cloud-platform";

struct OAuthPending {
    verifier: String,
    _state: String,
    redirect_uri: String,
}

fn get_oauth_pending() -> &'static Mutex<Option<OAuthPending>> {
    static PENDING: OnceLock<Mutex<Option<OAuthPending>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(None))
}

fn get_oauth_cancel() -> &'static Mutex<Option<tokio::sync::oneshot::Sender<()>>> {
    static CANCEL: OnceLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = OnceLock::new();
    CANCEL.get_or_init(|| Mutex::new(None))
}

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

fn random_base64url(n: usize) -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..n).map(|_| rng.gen::<u8>()).collect();
    base64::Engine::encode(&base64::prelude::BASE64_URL_SAFE_NO_PAD, bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    base64::Engine::encode(&base64::prelude::BASE64_URL_SAFE_NO_PAD, hash)
}

fn pct_encode(s: &str) -> String {
    let mut result = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            result.push(b as char);
        } else {
            result.push_str(&format!("%{:02X}", b));
        }
    }
    result
}

fn extract_callback_param(request: &str, param: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.split('=');
        let k = parts.next()?;
        let v = parts.next().unwrap_or("");
        if k == param {
            // Decode percent encoding
            let mut decoded = String::new();
            let mut chars = v.chars();
            while let Some(c) = chars.next() {
                if c == '%' {
                    let h1 = chars.next()?;
                    let h2 = chars.next()?;
                    let hex_str = format!("{}{}", h1, h2);
                    if let Ok(b) = u8::from_str_radix(&hex_str, 16) {
                        decoded.push(b as char);
                    }
                } else if c == '+' {
                    decoded.push(' ');
                } else {
                    decoded.push(c);
                }
            }
            return Some(decoded);
        }
    }
    None
}

pub async fn start_oauth_flow(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let verifier = random_base64url(32);
    let challenge = pkce_challenge(&verifier);
    let state = random_base64url(16);

    // Cancel any pending flow
    if let Some(cancel_tx) = get_oauth_cancel().lock().unwrap().take() {
        let _ = cancel_tx.send(());
    }

    let addr = format!("127.0.0.1:{}", CHATGPT_REDIRECT_PORT);
    let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|e| {
        format!("Failed to bind to port {}: {}. Make sure port {} is free and no other instance is running.", CHATGPT_REDIRECT_PORT, e, CHATGPT_REDIRECT_PORT)
    })?;
    let redirect_uri = format!("http://localhost:{}/auth/callback", CHATGPT_REDIRECT_PORT);

    // Create a new cancellation channel
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *get_oauth_cancel().lock().unwrap() = Some(tx);

    // Persist PKCE state
    {
        let mut pending = get_oauth_pending().lock().unwrap();
        *pending = Some(OAuthPending {
            verifier: verifier.clone(),
            _state: state.clone(),
            redirect_uri: redirect_uri.clone(),
        });
    }

    // Spawn a tokio task that waits for either the OAuth callback or cancellation
    let expected_state = state.clone();
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        tokio::select! {
            accept_res = listener.accept() => {
                if let Ok((mut stream, _)) = accept_res {
                    use tokio::io::{AsyncReadExt, AsyncWriteExt};
                    let mut buf = vec![0u8; 8192];
                    let n = stream.read(&mut buf).await.unwrap_or(0);
                    let request = String::from_utf8_lossy(&buf[..n]).into_owned();

                    let code = extract_callback_param(&request, "code");
                    let recv_state = extract_callback_param(&request, "state");
                    let error = extract_callback_param(&request, "error");

                    // Respond with a self-closing page
                    let html = r#"<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:system-ui;color:#fff;font-size:15px;}p{opacity:.8}</style></head><body><p>✓ Login successful &mdash; you can close this tab.</p><script>setTimeout(()=>window.close(),1500);</script></body></html>"#;
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
                    let _ = app_handle_clone.emit("oauth-callback", payload);
                }
            }
            _ = rx => {
                // Cancelled! TcpListener is dropped automatically
            }
        }
    });

    // Build the authorization URL with offline_access scope to obtain a refresh token
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code\
        &scope=openid%20email%20profile%20offline_access\
        &code_challenge={}&code_challenge_method=S256\
        &state={}&prompt=login",
        CHATGPT_AUTH_URL,
        chatgpt_client_id(),
        pct_encode(&redirect_uri),
        challenge,
        state,
    );

    Ok(auth_url)
}

pub async fn exchange_oauth_token(code: String) -> Result<Value, String> {
    let (verifier, redirect_uri) = {
        let pending = get_oauth_pending().lock().unwrap();
        let p = pending.as_ref().ok_or("No pending OAuth flow")?;
        (p.verifier.clone(), p.redirect_uri.clone())
    };

    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("code_verifier", verifier.as_str()),
        ("client_id", chatgpt_client_id()),
        ("scope", "openid profile email offline_access"),
    ];

    let res = client
        .post(CHATGPT_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed ({status}): {body}"));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

pub async fn fetch_chatgpt_workspaces(access_token: String) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://chatgpt.com/backend-api/accounts")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to fetch workspaces (status: {})", res.status()));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

pub async fn fetch_chatgpt_usage(access_token: String, account_id: Option<String>) -> Result<Value, String> {
    let client = reqwest::Client::new();
    
    // ── 1. Fetch usage/rate-limit data from wham/usage (original v0.0.1 endpoint) ──
    let mut req = client
        .get("https://chatgpt.com/backend-api/wham/usage")
        .bearer_auth(&access_token)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .header("Accept", "application/json");

    if let Some(ref aid) = account_id {
        if !aid.is_empty() {
            req = req.header("ChatGPT-Account-Id", aid.as_str());
        }
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Failed to fetch ChatGPT usage ({status}): {body}"));
    }

    let mut json: Value = res.json().await.map_err(|e| e.to_string())?;
    
    // ── 2. If wham/usage lacks plan_type, fallback to models endpoint ──
    if json.get("plan_type").is_none() {
        let mut models_url = "https://chatgpt.com/backend-api/models".to_string();
        if account_id.is_some() {
            models_url = format!("{}?history_and_training_disabled=false", models_url);
        }
        let mut models_req = client.get(&models_url).bearer_auth(&access_token);
        if let Some(ref aid) = account_id {
            if !aid.is_empty() {
                models_req = models_req.header("ChatGPT-Account-Id", aid.as_str());
            }
        }
        if let Ok(models_res) = models_req.send().await {
            if models_res.status().is_success() {
                if let Ok(models_json) = models_res.json::<Value>().await {
                    if let Some(cats) = models_json.get("categories").and_then(|v| v.as_array()) {
                        for cat in cats {
                            if let Some(level) = cat.get("subscription_level").and_then(|v| v.as_str()) {
                                if let Some(obj) = json.as_object_mut() {
                                    obj.insert("plan_type".to_string(), Value::String(level.to_string()));
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(json)
}
pub async fn refresh_chatgpt_token(refresh_token: String) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
        ("client_id", chatgpt_client_id()),
    ];

    let res = client
        .post(CHATGPT_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed ({status}): {body}"));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

pub async fn start_antigravity_google_oauth(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let verifier = random_base64url(32);
    let challenge = pkce_challenge(&verifier);
    let state = random_base64url(16);

    if let Some(cancel_tx) = get_google_oauth_cancel().lock().unwrap().take() {
        let _ = cancel_tx.send(());
    }

    let addr = format!("127.0.0.1:{}", AG_GOOGLE_REDIRECT_PORT);
    let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|e| {
        format!("Failed to bind to port {}: {}. Make sure port {} is free.", AG_GOOGLE_REDIRECT_PORT, e, AG_GOOGLE_REDIRECT_PORT)
    })?;
    let redirect_uri = format!("http://localhost:{}/auth/callback", AG_GOOGLE_REDIRECT_PORT);

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
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
        tokio::select! {
            accept_res = listener.accept() => {
                if let Ok((mut stream, _)) = accept_res {
                    use tokio::io::{AsyncReadExt, AsyncWriteExt};
                    let mut buf = vec![0u8; 8192];
                    let n = stream.read(&mut buf).await.unwrap_or(0);
                    let request = String::from_utf8_lossy(&buf[..n]).into_owned();

                    let code = extract_callback_param(&request, "code");
                    let recv_state = extract_callback_param(&request, "state");
                    let error = extract_callback_param(&request, "error");

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
                }
            }
            _ = rx => {}
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
    if let Some(obj) = json.as_object_mut() {
        obj.insert("authMethod".to_string(), Value::String("consumer".to_string()));
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

pub async fn reset_oauth_session() -> Result<(), String> {
    if let Some(tx) = get_oauth_cancel().lock().unwrap().take() {
        let _ = tx.send(());
    }
    let mut pending = get_oauth_pending().lock().unwrap();
    *pending = None;
    Ok(())
}
