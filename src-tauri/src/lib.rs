use std::process::Command;
use std::sync::{Mutex, OnceLock};
use base64::Engine;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

// ── Windows: remove DWM 1px border ────────────────────────────────────
#[cfg(target_os = "windows")]
mod dwm_fix {
    // DWMWA_BORDER_COLOR = 34, DWMWA_COLOR_NONE = 0xFFFFFFFE
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut std::ffi::c_void,
            dw_attribute: u32,
            pv_attribute: *const std::ffi::c_void,
            cb_attribute: u32,
        ) -> i32;
    }

    pub fn remove_border(hwnd: *mut std::ffi::c_void) {
        let color = DWMWA_COLOR_NONE;
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                &color as *const u32 as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}
// ───────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct QuotaData {
    pub model: String,
    pub percent: u32,
    #[serde(rename = "refreshTime")]
    pub refresh_time: String,
    #[serde(rename = "fiveHourPercent")]
    pub five_hour_percent: u32,
    #[serde(rename = "fiveHourReset")]
    pub five_hour_reset: String,
    #[serde(rename = "fiveHourDisabled")]
    pub five_hour_disabled: bool,
    #[serde(rename = "weeklyPercent")]
    pub weekly_percent: u32,
    #[serde(rename = "weeklyReset")]
    pub weekly_reset: String,
    #[serde(rename = "weeklyDisabled")]
    pub weekly_disabled: bool,
}


#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CreditInfo {
    pub balance: f64,
    #[serde(rename = "creditType")]
    pub credit_type: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CodexMonitoredInfo {
    #[serde(rename = "accountId")]
    pub account_id: String,
    pub label: String,
    #[serde(rename = "primaryPercent")]
    pub primary_percent: Option<u32>,
    #[serde(rename = "primaryLabel")]
    pub primary_label: String,
    #[serde(rename = "secondaryPercent")]
    pub secondary_percent: Option<u32>,
    #[serde(rename = "secondaryLabel")]
    pub secondary_label: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FullStatus {
    pub credits: Option<CreditInfo>,
    pub quotas: Vec<QuotaData>,
    #[serde(rename = "planTier")]
    pub plan_tier: Option<String>,
    #[serde(rename = "recentlyUsedModel")]
    pub recently_used_model: Option<String>,
    #[serde(rename = "monitoredCodex")]
    pub monitored_codex: Option<CodexMonitoredInfo>,
    pub email: Option<String>,
}

struct AppState {
    cached_pid: Option<u32>,
    cached_token: Option<String>,
    cached_port: Option<u16>,
    last_status: Option<FullStatus>,
    monitored_model: Option<String>,
    monitored_codex: Option<CodexMonitoredInfo>,
    poll_interval_secs: u64,
}

static STATE: OnceLock<Mutex<AppState>> = OnceLock::new();

fn get_state() -> &'static Mutex<AppState> {
    STATE.get_or_init(|| {
        Mutex::new(AppState {
            cached_pid: None,
            cached_token: None,
            cached_port: None,
            last_status: None,
            monitored_model: None,
            monitored_codex: None,
            poll_interval_secs: 30,
        })
    })
}

#[tauri::command]
fn get_quota_status() -> Option<FullStatus> {
    let state = get_state().lock().unwrap();
    let mut status = state.last_status.clone()?;
    // Always overlay the live monitored_codex so callers see the latest
    // set_monitored_codex() call without waiting for the next full poll.
    status.monitored_codex = state.monitored_codex.clone();
    Some(status)
}

#[tauri::command]
async fn force_refresh(app_handle: tauri::AppHandle) -> Option<FullStatus> {
    let _ = poll_and_update_tray(&app_handle).await;
    let state = get_state().lock().unwrap();
    state.last_status.clone()
}

#[tauri::command]
fn set_monitored_model(model: String, app_handle: tauri::AppHandle) {
    {
        let mut state = get_state().lock().unwrap();
        state.monitored_model = Some(model);
        state.monitored_codex = None;
    }
    update_tray_only(&app_handle);
}

#[tauri::command]
fn set_monitored_codex(info: Option<CodexMonitoredInfo>, app_handle: tauri::AppHandle) {
    {
        let mut state = get_state().lock().unwrap();
        state.monitored_codex = info;
        if state.monitored_codex.is_some() {
            state.monitored_model = None;
        }
    }
    update_tray_only(&app_handle);
}

fn update_tray_only(app_handle: &tauri::AppHandle) {
    let (status_opt, monitored_codex) = {
        let state = get_state().lock().unwrap();
        (state.last_status.clone(), state.monitored_codex.clone())
    };

    let mut status = status_opt.unwrap_or(FullStatus {
        credits: None,
        quotas: Vec::new(),
        plan_tier: None,
        recently_used_model: None,
        monitored_codex: monitored_codex.clone(),
        email: None,
    });
    // Always overlay the live monitored_codex so the tray reflects the latest
    // set_monitored_codex() call immediately, without waiting for the next poll.
    status.monitored_codex = monitored_codex;

    let tooltip = format_tooltip(&status);
    if let Some(tray) = app_handle.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}


#[tauri::command]
fn set_poll_interval(seconds: u64) {
    let mut state = get_state().lock().unwrap();
    state.poll_interval_secs = seconds;
}

#[tauri::command]
fn is_debug() -> bool {
    cfg!(debug_assertions)
}

// ── ChatGPT OAuth PKCE ──────────────────────────────────────────────
// Public client_id used by the chatgpt.com web application.
const CHATGPT_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_AUTH_URL: &str = "https://auth.openai.com/oauth/authorize";
const CHATGPT_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const CHATGPT_REDIRECT_PORT: u16 = 1455;
const CHATGPT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

struct OAuthPending {
    verifier: String,
    _state: String,
    redirect_uri: String,
}

static OAUTH_PENDING: OnceLock<Mutex<Option<OAuthPending>>> = OnceLock::new();

fn get_oauth_pending() -> &'static Mutex<Option<OAuthPending>> {
    OAUTH_PENDING.get_or_init(|| Mutex::new(None))
}

static OAUTH_CANCEL: OnceLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = OnceLock::new();

fn get_oauth_cancel() -> &'static Mutex<Option<tokio::sync::oneshot::Sender<()>>> {
    OAUTH_CANCEL.get_or_init(|| Mutex::new(None))
}

/// Generate `n` random bytes encoded as base64url (no padding)
fn random_base64url(n: usize) -> String {
    use rand::RngCore;
    let mut bytes = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
}

/// SHA-256 of `input`, base64url-encoded (PKCE S256 code challenge)
fn pkce_challenge(verifier: &str) -> String {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}

/// Percent-encode a string (RFC 3986 unreserved chars kept as-is)
fn pct_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Extract a query-param value from a raw HTTP request line like:
///   GET /callback?code=abc&state=xyz HTTP/1.1
fn extract_callback_param(request: &str, param: &str) -> Option<String> {
    let line = request.lines().next()?;
    let q_start = line.find('?')? + 1;
    let q_end = line[q_start..].find(' ').map_or(line.len() - q_start, |i| i);
    let query = &line[q_start..q_start + q_end];
    for part in query.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k == param {
                // simple %xx decode
                let mut decoded = String::new();
                let mut iter = v.bytes();
                while let Some(b) = iter.next() {
                    if b == b'%' {
                        let h = iter.next().unwrap_or(b'0') as char;
                        let l = iter.next().unwrap_or(b'0') as char;
                        if let Ok(byte) = u8::from_str_radix(&format!("{}{}", h, l), 16) {
                            decoded.push(byte as char);
                        }
                    } else if b == b'+' {
                        decoded.push(' ');
                    } else {
                        decoded.push(b as char);
                    }
                }
                return Some(decoded);
            }
        }
    }
    None
}

#[tauri::command]
async fn start_oauth_flow(app_handle: tauri::AppHandle) -> Result<String, String> {
    let verifier = random_base64url(32);
    let challenge = pkce_challenge(&verifier);
    let state = random_base64url(16);

    // Cancel any existing active flow to release port 1455
    if let Some(cancel) = get_oauth_cancel().lock().unwrap().take() {
        let _ = cancel.send(());
    }

    // Bind to the exact port 1455 required by the Codex CLI client ID redirect_uri
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", CHATGPT_REDIRECT_PORT)).await.map_err(|e| {
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
        CHATGPT_CLIENT_ID,
        pct_encode(&redirect_uri),
        challenge,
        state,
    );

    Ok(auth_url)
}

#[tauri::command]
async fn exchange_oauth_token(code: String) -> Result<serde_json::Value, String> {
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
        ("client_id", CHATGPT_CLIENT_ID),
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

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    // Clear pending state
    {
        let mut pending = get_oauth_pending().lock().unwrap();
        *pending = None;
    }

    Ok(json)
}

#[tauri::command]
async fn fetch_chatgpt_workspaces(access_token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://chatgpt.com/backend-api/accounts")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", CHATGPT_USER_AGENT)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Failed to fetch accounts ({status}): {body}"));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn fetch_chatgpt_usage(access_token: String, account_id: Option<String>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut req = client
        .get("https://chatgpt.com/backend-api/wham/usage")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", CHATGPT_USER_AGENT)
        .header("Accept", "application/json");

    if let Some(acc_id) = account_id {
        if !acc_id.is_empty() {
            req = req.header("ChatGPT-Account-Id", acc_id);
        }
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Failed to fetch ChatGPT usage ({status}): {body}"));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn refresh_chatgpt_token(refresh_token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
        ("client_id", CHATGPT_CLIENT_ID),
        ("scope", "openid profile email offline_access"),
    ];

    let res = client
        .post(CHATGPT_TOKEN_URL)
        .header("User-Agent", CHATGPT_USER_AGENT)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed ({status}): {body}"));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn reset_oauth_session() -> Result<(), String> {
    // Cancel the listener
    if let Some(cancel) = get_oauth_cancel().lock().unwrap().take() {
        let _ = cancel.send(());
    }
    // Clear pending state
    {
        let mut pending = get_oauth_pending().lock().unwrap();
        *pending = None;
    }
    Ok(())
}

fn get_home_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .map(std::path::PathBuf::from)
            .ok()
            .or_else(|| {
                std::env::var("HOMEDRIVE").and_then(|hd| {
                    std::env::var("HOMEPATH").map(|hp| std::path::PathBuf::from(format!("{}{}", hd, hp)))
                }).ok()
            })
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").map(std::path::PathBuf::from).ok()
    }
}

#[tauri::command]
async fn read_codex_auth() -> Result<Option<String>, String> {
    if let Some(mut path) = get_home_dir() {
        path.push(".codex");
        path.push("auth.json");
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => Ok(Some(content)),
                Err(e) => Err(format!("Failed to read auth.json: {}", e)),
            }
        } else {
            Ok(None)
        }
    } else {
        Err("Could not determine home directory".to_string())
    }
}

#[tauri::command]
async fn write_codex_auth(content: String) -> Result<(), String> {
    if let Some(mut path) = get_home_dir() {
        path.push(".codex");
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create .codex directory: {}", e))?;
        }
        path.push("auth.json");
        std::fs::write(&path, content).map_err(|e| format!("Failed to write auth.json: {}", e))?;
        Ok(())
    } else {
        Err("Could not determine home directory".to_string())
    }
}


#[tauri::command]
async fn execute_update(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("User-Agent", "QuotaShift")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to download update: status {}", res.status()));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;

    let file_name = if cfg!(target_os = "windows") {
        "update_setup.exe"
    } else {
        "update.deb"
    };

    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(file_name);

    std::fs::write(&temp_file_path, bytes).map_err(|e| e.to_string())?;

    // Execute the installer
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&temp_file_path)
            .arg("/UPDATE")
            .spawn()
            .map_err(|e| e.to_string())?;

        // Exit the app so the installer can overwrite it
        app_handle.exit(0);
    }

    #[cfg(target_os = "linux")]
    {
        // Try opening with xdg-open so the system package manager handles it
        std::process::Command::new("xdg-open")
            .arg(&temp_file_path)
            .spawn()
            .map_err(|e| e.to_string())?;

        app_handle.exit(0);
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = app_handle;
        return Err("Unsupported OS for auto update".to_string());
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn scan_processes() -> Option<(u32, String)> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object {$_.Name -like '*language_server*'} | Select-Object ProcessId,CommandLine | ConvertTo-Json"
        ])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return None;
    }

    let json_val: serde_json::Value = serde_json::from_str(trimmed).ok()?;
    let processes = if let Some(arr) = json_val.as_array() {
        arr.clone()
    } else {
        vec![json_val]
    };

    let token_re = regex::Regex::new(r"--csrf[_-]?token[=\s]+([a-f0-9-]+)").ok()?;
    for proc in processes {
        let cmd_line = proc.get("CommandLine").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(caps) = token_re.captures(cmd_line) {
            let token = caps.get(1)?.as_str().to_string();
            let pid = proc.get("ProcessId").and_then(|v| v.as_u64()).map(|v| v as u32)?;
            return Some((pid, token));
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn scan_processes() -> Option<(u32, String)> {
    let output = Command::new("sh")
        .args(["-c", "ps -axo pid,args | grep -i language_server | grep -v grep"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines = stdout.trim().lines();
    let token_re = regex::Regex::new(r"--csrf[_-]?token[=\s]+([a-f0-9-]+)").ok()?;
    for line in lines {
        if let Some(caps) = token_re.captures(line) {
            let token = caps.get(1)?.as_str().to_string();
            let pid_str = line.trim().split_whitespace().next()?;
            let pid = pid_str.parse::<u32>().ok()?;
            return Some((pid, token));
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn scan_port(pid: u32) -> Option<u16> {
    let cmd = format!(
        "Get-NetTCPConnection -OwningProcess {} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort",
        pid
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &cmd])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let port_str = stdout.trim().lines().next()?.trim();
    port_str.parse::<u16>().ok()
}

#[cfg(target_os = "macos")]
fn scan_port(pid: u32) -> Option<u16> {
    let cmd = format!(
        "lsof -iTCP -sTCP:LISTEN -a -p {} -Fn 2>/dev/null | grep '^n' | sed 's/n\\*://'",
        pid
    );
    let output = Command::new("sh")
        .args(["-c", &cmd])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let port_str = stdout.trim().lines().next()?.trim();
    port_str.parse::<u16>().ok()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn scan_port(pid: u32) -> Option<u16> {
    let cmd = format!("ss -tlnpH 2>/dev/null | grep -F \"pid={},\"", pid);
    let output = Command::new("sh")
        .args(["-c", &cmd])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.trim().lines().next()?;
    let port_re = regex::Regex::new(r"(?:^|:)(\d+)(?:\s|$)").ok()?;
    let caps = port_re.captures(line)?;
    caps.get(1)?.as_str().parse::<u16>().ok()
}

async fn query_server(port: u16, token: &str, path: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "http://127.0.0.1:{}{}",
        port, path
    );
    let payload = serde_json::json!({
        "metadata": { "ideName": "antigravity" }
    });

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .header("X-Codeium-Csrf-Token", token)
        .json(&payload)
        .send()
        .await;

    match res {
        Ok(r) => {
            if r.status().is_success() {
                r.json::<serde_json::Value>()
                    .await
                    .map_err(|e| e.to_string())
            } else {
                Err(format!("HTTP status: {}", r.status()))
            }
        }
        Err(e) => {
            let err_msg = e.to_string().to_lowercase();
            if err_msg.contains("http instead of https")
                || err_msg.contains("wrong version number")
                || err_msg.contains("client sent an http request to an https server")
            {
                let https_client = reqwest::Client::builder()
                    .danger_accept_invalid_certs(true)
                    .build()
                    .map_err(|e| e.to_string())?;

                let https_url = format!(
                    "https://127.0.0.1:{}{}",
                    port, path
                );
                let https_res = https_client
                    .post(&https_url)
                    .header("Content-Type", "application/json")
                    .header("Connect-Protocol-Version", "1")
                    .header("X-Codeium-Csrf-Token", token)
                    .json(&payload)
                    .send()
                    .await;

                match https_res {
                    Ok(r) => {
                        if r.status().is_success() {
                            r.json::<serde_json::Value>()
                                .await
                                .map_err(|inner| inner.to_string())
                        } else {
                            Err(format!("HTTPS status: {}", r.status()))
                        }
                    }
                    Err(inner) => Err(inner.to_string()),
                }
            } else {
                Err(e.to_string())
            }
        }
    }
}

async fn fetch_full_status_internal() -> Result<FullStatus, String> {
    let (mut pid, mut token, mut port) = {
        let state = get_state().lock().unwrap();
        (
            state.cached_pid,
            state.cached_token.clone(),
            state.cached_port,
        )
    };

    let mut raw_data = None;
    let mut raw_quota_summary = None;

    if let (Some(_p), Some(t), Some(po)) = (pid, &token, port) {
        if let Ok(data) = query_server(po, t, "/exa.language_server_pb.LanguageServerService/GetUserStatus").await {
            raw_data = Some(data);
            raw_quota_summary = query_server(po, t, "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary").await.ok();
        }
    }

    if raw_data.is_none() {
        if let Some((p, t)) = scan_processes() {
            if let Some(po) = scan_port(p) {
                if let Ok(data) = query_server(po, &t, "/exa.language_server_pb.LanguageServerService/GetUserStatus").await {
                    pid = Some(p);
                    token = Some(t);
                    port = Some(po);

                    {
                        let mut state = get_state().lock().unwrap();
                        state.cached_pid = pid;
                        state.cached_token = token.clone();
                        state.cached_port = port;
                    }

                    raw_data = Some(data);
                    raw_quota_summary = query_server(po, token.as_deref().unwrap(), "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary").await.ok();
                }
            }
        }
    }

    let raw = raw_data.ok_or_else(|| "Could not fetch data from server".to_string())?;
    let mut new_status = parse_full_status(raw, raw_quota_summary.unwrap_or(serde_json::Value::Null))?;

    // Sync recently_used_model with the user's chosen monitored model
    let chosen_model = {
        let state = get_state().lock().unwrap();
        state.monitored_model.clone()
    };

    if let Some(ref model) = chosen_model {
        if new_status.quotas.iter().any(|q| &q.model == model) {
            new_status.recently_used_model = Some(model.clone());
        }
    }

    Ok(new_status)
}

fn parse_full_status(raw: serde_json::Value, quota_summary: serde_json::Value) -> Result<FullStatus, String> {
    let mut credits = None;
    let credit_info_raw = raw.pointer("/userStatus/userInfo/creditInfo");
    let alt_credit_info_raw = raw.pointer("/userStatus/userTier/availableCredits/0");
    let src = credit_info_raw.or(alt_credit_info_raw);

    if let Some(s) = src {
        let balance = s
            .get("currentBalance")
            .or(s.get("balance"))
            .or(s.get("creditAmount"))
            .and_then(|v| {
                v.as_f64()
                    .or_else(|| v.as_str().and_then(|st| st.parse::<f64>().ok()))
                    .or_else(|| v.as_i64().map(|i| i as f64))
            })
            .unwrap_or(0.0);
        let credit_type = s
            .get("creditType")
            .or(s.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("UNKNOWN")
            .to_string();
        credits = Some(CreditInfo {
            balance,
            credit_type,
        });
    }

    let plan_tier = raw
        .pointer("/userStatus/userTier/name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let email = raw
        .pointer("/userStatus/userInfo/email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Helper structure to keep track of parsed groups/buckets
    #[derive(Debug, Clone)]
    struct ParsedBucket {
        window: String,
        remaining_fraction: f64,
        reset_time: String,
        disabled: bool,
    }

    #[derive(Debug, Clone)]
    struct ParsedGroup {
        display_name: String,
        description: String,
        buckets: Vec<ParsedBucket>,
    }

    let mut groups = Vec::new();
    if let Some(groups_arr) = quota_summary.pointer("/response/groups").and_then(|v| v.as_array()) {
        for g in groups_arr {
            let group_name = g.get("displayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let desc = g.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut buckets = Vec::new();
            if let Some(buckets_arr) = g.get("buckets").and_then(|v| v.as_array()) {
                for b in buckets_arr {
                    let win = b.get("window").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let remaining = b.get("remainingFraction").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let reset = b.get("resetTime").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let disabled = b.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
                    buckets.push(ParsedBucket {
                        window: win,
                        remaining_fraction: remaining,
                        reset_time: reset,
                        disabled,
                    });
                }
            }
            groups.push(ParsedGroup {
                display_name: group_name,
                description: desc,
                buckets,
            });
        }
    }

    let mut gemini_pool = QuotaData {
        model: "Google Gemini Models".to_string(),
        percent: 100,
        refresh_time: "Ready".to_string(),
        five_hour_percent: 100,
        five_hour_reset: "".to_string(),
        five_hour_disabled: false,
        weekly_percent: 100,
        weekly_reset: "".to_string(),
        weekly_disabled: false,
    };

    let mut claude_gpt_pool = QuotaData {
        model: "Claude & OpenAI Models".to_string(),
        percent: 100,
        refresh_time: "Ready".to_string(),
        five_hour_percent: 100,
        five_hour_reset: "".to_string(),
        five_hour_disabled: false,
        weekly_percent: 100,
        weekly_reset: "".to_string(),
        weekly_disabled: false,
    };

    let mut found_gemini = false;
    let mut found_claude_gpt = false;

    // 1. Try to populate from the API response's groups first
    for g in &groups {
        let name_lower = g.display_name.to_lowercase();
        let desc_lower = g.description.to_lowercase();
        
        let is_gemini = name_lower.contains("gemini") || desc_lower.contains("gemini");
        let is_claude_gpt = name_lower.contains("claude") || name_lower.contains("gpt") || name_lower.contains("openai") ||
                            desc_lower.contains("claude") || desc_lower.contains("gpt") || desc_lower.contains("openai");

        if is_gemini {
            found_gemini = true;
            for b in &g.buckets {
                let pct = (b.remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                if b.window == "5h" {
                    gemini_pool.five_hour_percent = pct;
                    gemini_pool.five_hour_reset = b.reset_time.clone();
                    gemini_pool.five_hour_disabled = b.disabled;
                } else if b.window == "weekly" {
                    gemini_pool.weekly_percent = pct;
                    gemini_pool.weekly_reset = b.reset_time.clone();
                    gemini_pool.weekly_disabled = b.disabled;
                }
            }
        } else if is_claude_gpt {
            found_claude_gpt = true;
            for b in &g.buckets {
                let pct = (b.remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                if b.window == "5h" {
                    claude_gpt_pool.five_hour_percent = pct;
                    claude_gpt_pool.five_hour_reset = b.reset_time.clone();
                    claude_gpt_pool.five_hour_disabled = b.disabled;
                } else if b.window == "weekly" {
                    claude_gpt_pool.weekly_percent = pct;
                    claude_gpt_pool.weekly_reset = b.reset_time.clone();
                    claude_gpt_pool.weekly_disabled = b.disabled;
                }
            }
        }
    }

    // 2. If groups were not found (e.g. offline/empty groups), fall back to clientModelConfigs
    if !found_gemini || !found_claude_gpt {
        if let Some(configs) = raw
            .pointer("/userStatus/cascadeModelConfigData/clientModelConfigs")
            .and_then(|v| v.as_array())
        {
            for config in configs {
                let label = match config.get("label").and_then(|v| v.as_str()) {
                    Some(l) => l.to_string(),
                    None => continue,
                };
                let model_lower = label.to_lowercase();
                let is_gemini = model_lower.contains("gemini");
                let is_claude_gpt = model_lower.contains("claude") || model_lower.contains("gpt") || model_lower.contains("openai");

                if is_gemini && !found_gemini {
                    if let Some(quota_info) = config.get("quotaInfo") {
                        if let Some(fraction) = quota_info.get("remainingFraction").and_then(|v| v.as_f64()) {
                            let pct = (fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                            gemini_pool.five_hour_percent = pct;
                            gemini_pool.weekly_percent = pct;
                        }
                        if let Some(reset_time) = quota_info.get("resetTime").and_then(|v| v.as_str()) {
                            gemini_pool.five_hour_reset = reset_time.to_string();
                            gemini_pool.weekly_reset = reset_time.to_string();
                        }
                    }
                    found_gemini = true;
                } else if is_claude_gpt && !found_claude_gpt {
                    if let Some(quota_info) = config.get("quotaInfo") {
                        if let Some(fraction) = quota_info.get("remainingFraction").and_then(|v| v.as_f64()) {
                            let pct = (fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                            claude_gpt_pool.five_hour_percent = pct;
                            claude_gpt_pool.weekly_percent = pct;
                        }
                        if let Some(reset_time) = quota_info.get("resetTime").and_then(|v| v.as_str()) {
                            claude_gpt_pool.five_hour_reset = reset_time.to_string();
                            claude_gpt_pool.weekly_reset = reset_time.to_string();
                        }
                    }
                    found_claude_gpt = true;
                }
            }
        }
    }

    // 3. Finalize percentages, refresh times, and disabled statuses
    if gemini_pool.weekly_percent == 0 {
        gemini_pool.five_hour_percent = 0;
    }
    gemini_pool.percent = gemini_pool.five_hour_percent;
    gemini_pool.refresh_time = if gemini_pool.five_hour_disabled {
        "Disabled".to_string()
    } else if gemini_pool.five_hour_reset.is_empty() {
        "Exhausted".to_string()
    } else {
        gemini_pool.five_hour_reset.clone()
    };

    if claude_gpt_pool.weekly_percent == 0 {
        claude_gpt_pool.five_hour_percent = 0;
    }
    claude_gpt_pool.percent = claude_gpt_pool.five_hour_percent;
    claude_gpt_pool.refresh_time = if claude_gpt_pool.five_hour_disabled {
        "Disabled".to_string()
    } else if claude_gpt_pool.five_hour_reset.is_empty() {
        "Exhausted".to_string()
    } else {
        claude_gpt_pool.five_hour_reset.clone()
    };

    let mut quotas = Vec::new();
    quotas.push(gemini_pool);
    quotas.push(claude_gpt_pool);

    // Sort descending by percentage, with alphabetical model name as stable tie-breaker
    quotas.sort_by(|a, b| {
        let cmp = b.percent.cmp(&a.percent);
        if cmp == std::cmp::Ordering::Equal {
            a.model.cmp(&b.model)
        } else {
            cmp
        }
    });

    let recently_used_model = quotas.first().map(|q| q.model.clone());

    let monitored_codex = {
        let state = get_state().lock().unwrap();
        state.monitored_codex.clone()
    };

    Ok(FullStatus {
        credits,
        quotas,
        plan_tier,
        recently_used_model,
        monitored_codex,
        email,
    })
}

fn format_tooltip(status: &FullStatus) -> String {
    if let Some(codex) = &status.monitored_codex {
        let mut line = format!("Codex\n{}", codex.label);
        if let Some(p) = codex.primary_percent {
            line.push_str(&format!(": {}%", p));
            if let Some(s) = codex.secondary_percent {
                line.push_str(&format!("/{}%", s));
            }
        } else {
            line.push_str(": —");
        }
        line
    } else {
        // Antigravity mode
        let gemini = status.quotas.iter().find(|q| q.model.contains("Gemini") || q.model.to_lowercase().contains("google"));
        let claude_openai = status.quotas.iter().find(|q| q.model.contains("Claude") || q.model.contains("OpenAI") || q.model.to_lowercase().contains("gpt"));
        
        let mut lines = vec!["Antigravity".to_string()];
        
        match gemini {
            Some(q) => {
                lines.push(format!("Google Gemini: {}%/{}%", q.five_hour_percent, q.weekly_percent));
            }
            None => {
                lines.push("Google Gemini: —".to_string());
            }
        }
        
        match claude_openai {
            Some(q) => {
                lines.push(format!("Claude & OpenAI: {}%/{}%", q.five_hour_percent, q.weekly_percent));
            }
            None => {
                lines.push("Claude & OpenAI: —".to_string());
            }
        }
        
        lines.join("\n")
    }
}

async fn poll_and_update_tray(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let res = fetch_full_status_internal().await;
    match res {
        Ok(status) => {
            {
                let mut state = get_state().lock().unwrap();
                state.last_status = Some(status.clone());
            }
            let _ = app_handle.emit("status-updated", &status);
            let tooltip = format_tooltip(&status);
            if let Some(tray) = app_handle.tray_by_id("main") {
                let _ = tray.set_tooltip(Some(tooltip));
            }
            Ok(())
        }
        Err(_) => {
            let _ = app_handle.emit("status-updated", serde_json::Value::Null);
            if let Some(tray) = app_handle.tray_by_id("main") {
                let _ = tray.set_tooltip(Some(
                    "QuotaShift: offline\n⚠️ Language server not reachable.".to_string(),
                ));
            }
            Err("Offline".to_string())
        }
    }
}

fn position_window(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let scale_factor = monitor.scale_factor();

        let win_w = (680.0 * scale_factor) as i32;
        let win_h = (760.0 * scale_factor) as i32;
        let padding = (12.0 * scale_factor) as i32;
        let taskbar_h = (48.0 * scale_factor) as i32;

        let x = monitor_pos.x + monitor_size.width as i32 - win_w - padding;
        let y = monitor_pos.y + monitor_size.height as i32 - win_h - taskbar_h - padding;

        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon_bytes = include_bytes!("../icons/32x32.png");
    let tray_icon = tauri::image::Image::from_bytes(icon_bytes).expect("Failed to load tray icon");

    let _tray = TrayIconBuilder::with_id("main")
        .tooltip("QuotaShift")
        .icon(tray_icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    position_window(&window);
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("window-shown", true);
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button, button_state, .. } = event {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let is_visible = window.is_visible().unwrap_or(false);
                        if is_visible {
                            let _ = window.hide();
                        } else {
                            position_window(&window);
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("window-shown", true);
                        }
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn get_antigravity_db_path() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    let base = std::env::var("APPDATA").ok().map(std::path::PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join("Library/Application Support"));
    #[cfg(target_os = "linux")]
    let base = std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".config"));
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let base = None;

    if let Some(b) = base {
        let path1 = b.join("Antigravity IDE").join("User").join("globalStorage").join("state.vscdb");
        if path1.exists() {
            return Some(path1);
        }
        let path2 = b.join("Antigravity").join("User").join("globalStorage").join("state.vscdb");
        if path2.exists() {
            return Some(path2);
        }
        return Some(path1);
    }
    None
}

#[tauri::command]
async fn read_antigravity_session() -> Result<serde_json::Value, String> {
    // ── Antigravity 2.0: read from Windows Credential Manager ─────────
    #[cfg(target_os = "windows")]
    {
        let py_code = r#"
import ctypes, ctypes.wintypes, json, sys
CRED_TYPE_GENERIC = 1
class FILETIME(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.wintypes.DWORD), ("dwHighDateTime", ctypes.wintypes.DWORD)]
class CREDENTIAL_ATTRIBUTE(ctypes.Structure):
    _fields_ = [("Keyword", ctypes.c_wchar_p), ("Flags", ctypes.wintypes.DWORD), ("ValueSize", ctypes.wintypes.DWORD), ("Value", ctypes.c_char_p)]
class CREDENTIAL(ctypes.Structure):
    _fields_ = [("Flags", ctypes.wintypes.DWORD), ("Type", ctypes.wintypes.DWORD), ("TargetName", ctypes.c_wchar_p), ("Comment", ctypes.c_wchar_p), ("LastWritten", FILETIME), ("CredentialBlobSize", ctypes.wintypes.DWORD), ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)), ("Persist", ctypes.wintypes.DWORD), ("AttributeCount", ctypes.wintypes.DWORD), ("Attributes", ctypes.POINTER(CREDENTIAL_ATTRIBUTE)), ("TargetAlias", ctypes.c_wchar_p), ("UserName", ctypes.c_wchar_p)]
adv = ctypes.WinDLL("advapi32")
adv.CredReadW.restype = ctypes.wintypes.BOOL
adv.CredReadW.argtypes = [ctypes.c_wchar_p, ctypes.wintypes.DWORD, ctypes.wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(CREDENTIAL))]
adv.CredFree.argtypes = [ctypes.c_void_p]
pcred = ctypes.POINTER(CREDENTIAL)()
if adv.CredReadW("gemini:antigravity", CRED_TYPE_GENERIC, 0, ctypes.byref(pcred)):
    cred = pcred.contents
    blob = bytes(cred.CredentialBlob[:cred.CredentialBlobSize])
    adv.CredFree(pcred)
    try:
        data = json.loads(blob.decode("utf-8"))
        tok = data.get("token", {})
        print(json.dumps({"antigravityUnifiedStateSync.oauthToken": tok.get("access_token", ""), "antigravity.refreshToken": tok.get("refresh_token", ""), "antigravity.credentialManagerVersion": "2", "antigravity.authMethod": data.get("auth_method", "consumer")}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(0)
print(json.dumps({}))
"#;
        let output = Command::new("python")
            .args(["-c", py_code])
            .output()
            .map_err(|e| format!("Failed to run python: {}", e))?;
        if output.status.success() {
            let stdout_str = String::from_utf8_lossy(&output.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(stdout_str.trim()) {
                if val.get("antigravityUnifiedStateSync.oauthToken").is_some() {
                    return Ok(val);
                }
            }
        }
    }

    // ── Antigravity 1.x fallback: read from state.vscdb ───────────────
    let db_path = get_antigravity_db_path().ok_or_else(|| "Could not determine AppData path".to_string())?;
    let db_str = db_path.to_string_lossy().to_string();

    let py_code = r#"
import sqlite3, json, sys, os
db = sys.argv[1]
if not os.path.exists(db):
    print(json.dumps({}))
    sys.exit(0)
try:
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'")
    if not c.fetchone():
        print(json.dumps({}))
        sys.exit(0)
    c.execute("SELECT key, value FROM ItemTable WHERE key IN ('antigravityUnifiedStateSync.oauthToken', 'antigravity.profileUrl', 'antigravityUnifiedStateSync.userStatus', 'antigravity.refreshToken')")
    res = {}
    for row in c.fetchall():
        res[row[0]] = row[1]
    print(json.dumps(res))
except Exception as e:
    print(json.dumps({"error": str(e)}))
"#;

    let output = Command::new("python")
        .args(["-c", py_code, &db_str])
        .output()
        .map_err(|e| format!("Failed to run python: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let val: serde_json::Value = serde_json::from_str(stdout_str.trim()).map_err(|e| e.to_string())?;
    Ok(val)
}

#[tauri::command]
fn export_backup_file(content: String) -> Result<String, String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let downloads = home.join("Downloads");
    
    // Ensure downloads dir exists
    if !downloads.exists() {
        std::fs::create_dir_all(&downloads).map_err(|e| format!("Failed to create Downloads folder: {}", e))?;
    }
    
    let file_path = downloads.join("antigravity_backup.json");
    std::fs::write(&file_path, content).map_err(|e| format!("Failed to write backup file: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn write_antigravity_session(token: String, refresh_token: Option<String>, profile_url: Option<String>) -> Result<(), String> {
    // ── Antigravity 2.0: write to Windows Credential Manager ──────────
    // Detect v2.0 by checking if gemini:antigravity exists in Credential Manager.
    // If it does, update its token blob; otherwise fall back to state.vscdb (v1.x).
    #[cfg(target_os = "windows")]
    {
        let token_clone = token.clone();
        let refresh_clone = refresh_token.clone().unwrap_or_default();
        let py_detect = r#"
import ctypes, ctypes.wintypes, json, sys
CRED_TYPE_GENERIC = 1
class FILETIME(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.wintypes.DWORD), ("dwHighDateTime", ctypes.wintypes.DWORD)]
class CREDENTIAL_ATTRIBUTE(ctypes.Structure):
    _fields_ = [("Keyword", ctypes.c_wchar_p), ("Flags", ctypes.wintypes.DWORD), ("ValueSize", ctypes.wintypes.DWORD), ("Value", ctypes.c_char_p)]
class CREDENTIAL(ctypes.Structure):
    _fields_ = [("Flags", ctypes.wintypes.DWORD), ("Type", ctypes.wintypes.DWORD), ("TargetName", ctypes.c_wchar_p), ("Comment", ctypes.c_wchar_p), ("LastWritten", FILETIME), ("CredentialBlobSize", ctypes.wintypes.DWORD), ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)), ("Persist", ctypes.wintypes.DWORD), ("AttributeCount", ctypes.wintypes.DWORD), ("Attributes", ctypes.POINTER(CREDENTIAL_ATTRIBUTE)), ("TargetAlias", ctypes.c_wchar_p), ("UserName", ctypes.c_wchar_p)]
adv = ctypes.WinDLL("advapi32")
adv.CredReadW.restype = ctypes.wintypes.BOOL
adv.CredReadW.argtypes = [ctypes.c_wchar_p, ctypes.wintypes.DWORD, ctypes.wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(CREDENTIAL))]
adv.CredWriteW.restype = ctypes.wintypes.BOOL
adv.CredWriteW.argtypes = [ctypes.POINTER(CREDENTIAL), ctypes.wintypes.DWORD]
adv.CredFree.argtypes = [ctypes.c_void_p]
import datetime
new_token = sys.argv[1]
new_refresh_token = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "" else None
# Read existing entry to preserve refresh_token and auth_method
pcred = ctypes.POINTER(CREDENTIAL)()
existing = {"auth_method": "consumer", "token": {}}
if adv.CredReadW("gemini:antigravity", CRED_TYPE_GENERIC, 0, ctypes.byref(pcred)):
    cred = pcred.contents
    blob = bytes(cred.CredentialBlob[:cred.CredentialBlobSize])
    adv.CredFree(pcred)
    try:
        existing = json.loads(blob.decode("utf-8"))
    except:
        pass
    # Update access_token and refresh_token
    existing["token"]["access_token"] = new_token
    if new_refresh_token:
        existing["token"]["refresh_token"] = new_refresh_token
    else:
        existing["token"].pop("refresh_token", None)
    expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).isoformat()
    existing["token"]["expiry"] = expiry
    new_blob = json.dumps(existing).encode("utf-8")
    blob_arr = (ctypes.c_ubyte * len(new_blob))(*new_blob)
    cred_write = CREDENTIAL()
    cred_write.Type = CRED_TYPE_GENERIC
    cred_write.TargetName = "gemini:antigravity"
    cred_write.CredentialBlobSize = len(new_blob)
    cred_write.CredentialBlob = blob_arr
    cred_write.Persist = 2  # CRED_PERSIST_LOCAL_MACHINE
    cred_write.UserName = "antigravity"
    ok = adv.CredWriteW(ctypes.byref(cred_write), 0)
    if ok:
        print("SUCCESS_V2")
    else:
        print("WRITE_FAILED:" + str(ctypes.get_last_error()))
else:
    print("NOT_V2")
"#;
        let output = Command::new("python")
            .args(["-c", py_detect, &token_clone, &refresh_clone])
            .output()
            .map_err(|e| format!("Failed to run python: {}", e))?;
        let out_str = String::from_utf8_lossy(&output.stdout);
        if out_str.contains("SUCCESS_V2") {
            return Ok(());
        }
        if out_str.contains("WRITE_FAILED") {
            return Err(format!("Failed to write Credential Manager: {}", out_str.trim()));
        }
        // NOT_V2 → fall through to legacy v1.x vscdb path
    }

    // ── Antigravity 1.x fallback: write to state.vscdb ────────────────
    let db_path = get_antigravity_db_path().ok_or_else(|| "Could not determine AppData path".to_string())?;
    let db_str = db_path.to_string_lossy().to_string();

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let py_code = r#"
import sqlite3, sys
db = sys.argv[1]
token = sys.argv[2]
profile = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "" else None
refresh = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != "" else None
try:
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS ItemTable(key TEXT UNIQUE, value TEXT)")
    c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravityUnifiedStateSync.oauthToken', ?)", (token,))
    if profile:
        c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravity.profileUrl', ?)", (profile,))
    else:
        c.execute("DELETE FROM ItemTable WHERE key='antigravity.profileUrl'")
    if refresh:
        c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravity.refreshToken', ?)", (refresh,))
    else:
        c.execute("DELETE FROM ItemTable WHERE key='antigravity.refreshToken'")
    conn.commit()
    conn.close()
    print("SUCCESS")
except Exception as e:
    print("ERROR:", str(e))
    sys.exit(1)
"#;

    let profile_str = profile_url.unwrap_or_default();
    let refresh_str = refresh_token.unwrap_or_default();
    let output = Command::new("python")
        .args(["-c", py_code, &db_str, &token, &profile_str, &refresh_str])
        .output()
        .map_err(|e| format!("Failed to run python: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let out_str = String::from_utf8_lossy(&output.stdout);
    if out_str.contains("ERROR:") {
        return Err(out_str.trim().to_string());
    }

    Ok(())
}

#[tauri::command]
async fn delete_antigravity_session() -> Result<(), String> {
    let db_path = get_antigravity_db_path().ok_or_else(|| "Could not determine AppData path".to_string())?;
    let db_str = db_path.to_string_lossy().to_string();

    let py_code = r#"
import sqlite3, sys, os
db = sys.argv[1]
if not os.path.exists(db):
    print("SUCCESS")
    sys.exit(0)
try:
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'")
    if c.fetchone():
        c.execute("DELETE FROM ItemTable WHERE key IN ('antigravityUnifiedStateSync.oauthToken', 'antigravity.profileUrl', 'antigravityUnifiedStateSync.userStatus')")
        conn.commit()
    conn.close()
    print("SUCCESS")
except Exception as e:
    print("ERROR:", str(e))
    sys.exit(1)
"#;

    let output = Command::new("python")
        .args(["-c", py_code, &db_str])
        .output()
        .map_err(|e| format!("Failed to run python: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let out_str = String::from_utf8_lossy(&output.stdout);
    if out_str.contains("ERROR:") {
        return Err(out_str.trim().to_string());
    }

    Ok(())
}

#[tauri::command]
async fn quit_antigravity_ide() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill").args(["/F", "/IM", "Antigravity IDE.exe"]).output();
        let _ = Command::new("taskkill").args(["/F", "/IM", "Antigravity.exe"]).output();
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("osascript").args(["-e", "tell application \"Antigravity IDE\" to quit"]).output();
        let _ = Command::new("osascript").args(["-e", "tell application \"Antigravity\" to quit"]).output();
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("pkill").arg("-f").arg("Antigravity").output();
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    Ok(())
}

#[tauri::command]
async fn open_antigravity_ide() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let local_appdata = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
        let mut path1 = std::path::PathBuf::from(&local_appdata);
        path1.push("Programs");
        path1.push("Antigravity");
        path1.push("Antigravity IDE.exe");

        if path1.exists() {
            let _ = Command::new(path1).spawn().map_err(|e| e.to_string())?;
            return Ok(());
        }

        let mut path2 = std::path::PathBuf::from(&local_appdata);
        path2.push("Programs");
        path2.push("Antigravity");
        path2.push("Antigravity.exe");

        if path2.exists() {
            let _ = Command::new(path2).spawn().map_err(|e| e.to_string())?;
            return Ok(());
        }

        Err("Antigravity IDE executable not found".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg("-a").arg("Antigravity IDE").output();
        let _ = Command::new("open").arg("-a").arg("Antigravity").output();
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("antigravity-ide").spawn();
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                position_window(&window);
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("window-shown", true);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_quota_status,
            force_refresh,
            set_monitored_model,
            set_monitored_codex,
            set_poll_interval,
            is_debug,
            execute_update,
            start_oauth_flow,
            exchange_oauth_token,
            fetch_chatgpt_workspaces,
            fetch_chatgpt_usage,
            refresh_chatgpt_token,
            reset_oauth_session,
            read_codex_auth,
            write_codex_auth,
            read_antigravity_session,
            write_antigravity_session,
            delete_antigravity_session,
            quit_antigravity_ide,
            open_antigravity_ide,
            export_backup_file
        ])
        .setup(|app| {
            let _ = setup_tray(app.handle());

            // Start background polling thread
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let _ = poll_and_update_tray(&app_handle).await;
                    let interval = {
                        let state = get_state().lock().unwrap();
                        state.poll_interval_secs
                    };
                    tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
                }
            });

            // Hide window on blur (focus loss) so it acts like a true popup panel
            let main_window = app.get_webview_window("main").unwrap();
            
            // Set window icon explicitly to bypass cache / packaging issues
            let win_icon_bytes = include_bytes!("../icons/128x128.png");
            if let Ok(win_icon) = tauri::image::Image::from_bytes(win_icon_bytes) {
                let _ = main_window.set_icon(win_icon);
            }

            let w_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = w_clone.hide();
                }
            });

            // Remove Windows DWM 1px system border (Win32 DwmSetWindowAttribute)
            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                let border_window = app.get_webview_window("main").unwrap();
                if let Ok(handle) = border_window.window_handle() {
                    if let RawWindowHandle::Win32(h) = handle.as_raw() {
                        dwm_fix::remove_border(h.hwnd.get() as *mut std::ffi::c_void);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
