// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;
use serde_json::Value;
use tokio::sync::Notify;

const CODEX_USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_REFRESH_SAFETY_SECONDS: i64 = 5 * 60;

struct KeepAliveState {
    interval_mins: u64,
    running: bool,
    last_ping: Option<i64>,
    last_result: Option<String>,
}

static KEEP_ALIVE: OnceLock<Mutex<KeepAliveState>> = OnceLock::new();
static KEEP_ALIVE_NOTIFY: OnceLock<Notify> = OnceLock::new();

fn state() -> &'static Mutex<KeepAliveState> {
    KEEP_ALIVE.get_or_init(|| {
        Mutex::new(KeepAliveState {
            interval_mins: 240,
            running: false,
            last_ping: None,
            last_result: None,
        })
    })
}

fn notify() -> &'static Notify {
    KEEP_ALIVE_NOTIFY.get_or_init(Notify::new)
}

pub fn set_interval(mins: u64) {
    let mut state = state().lock().unwrap();
    state.interval_mins = mins;
}

pub fn start() {
    let mut state = state().lock().unwrap();
    if !state.running {
        state.running = true;
        drop(state);
        notify().notify_one();
    }
}

pub fn stop() {
    let mut state = state().lock().unwrap();
    state.running = false;
}

pub fn get_status() -> Value {
    let state = state().lock().unwrap();
    serde_json::json!({
        "running": state.running,
        "intervalMins": state.interval_mins,
        "lastPing": state.last_ping.map(|timestamp| {
            chrono::DateTime::from_timestamp(timestamp, 0)
                .map(|date_time| date_time.to_rfc3339())
                .unwrap_or_default()
        }),
        "lastResult": state.last_result,
    })
}

pub async fn run_background() {
    loop {
        let interval_mins = state().lock().unwrap().interval_mins;
        let should_wait = !state().lock().unwrap().running;

        if should_wait {
            notify().notified().await;
            if !state().lock().unwrap().running {
                continue;
            }
        }

        tokio::time::sleep(Duration::from_secs(interval_mins * 60)).await;
        if !state().lock().unwrap().running {
            continue;
        }

        let result = ping_maintenance().await;
        let mut state = state().lock().unwrap();
        state.last_ping = Some(chrono::Utc::now().timestamp());
        state.last_result = Some(match result {
            Ok(message) => message,
            Err(error) => format!("Failed: {}", error),
        });
    }
}

/// Run read-only authentication maintenance. This never generates model activity.
async fn ping_maintenance() -> Result<String, String> {
    let mut results = Vec::new();

    match ping_codex_maintenance().await {
        Ok(message) => results.push(format!("Codex: {}", message)),
        Err(error) if error != "No Codex auth.json found" => {
            results.push(format!("Codex: Failed: {}", error));
        }
        Err(_) => {}
    }

    match ping_antigravity_maintenance().await {
        Ok(message) => results.push(format!("Antigravity: {}", message)),
        Err(error) if error != "No Antigravity session found" => {
            results.push(format!("Antigravity: Failed: {}", error));
        }
        Err(_) => {}
    }

    if results.is_empty() {
        Ok("No accounts configured for maintenance".to_string())
    } else {
        Ok(results.join("; "))
    }
}

fn jwt_expiry(access_token: &str) -> Option<i64> {
    let payload = access_token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .ok()?;
    let claims: Value = serde_json::from_slice(&decoded).ok()?;
    claims.get("exp").and_then(Value::as_i64)
}

fn oauth_token_needs_refresh(access_token: &str, now: i64) -> bool {
    if access_token.trim().is_empty() {
        return true;
    }
    jwt_expiry(access_token)
        .map(|expiry| expiry <= now + CODEX_REFRESH_SAFETY_SECONDS)
        .unwrap_or(false)
}

fn non_empty_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn merge_refresh_response(
    auth: &mut Value,
    refresh_response: &Value,
    refreshed_at: &str,
) -> Result<(), String> {
    let new_access_token = non_empty_string(refresh_response, "access_token")
        .ok_or_else(|| "OAuth refresh response did not include access_token".to_string())?;
    let new_refresh_token = non_empty_string(refresh_response, "refresh_token");
    let new_id_token = non_empty_string(refresh_response, "id_token");
    let new_account_id = non_empty_string(refresh_response, "account_id");

    {
        let tokens = auth
            .get_mut("tokens")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "ChatGPT auth.json is missing a tokens object".to_string())?;
        tokens.insert("access_token".to_string(), Value::String(new_access_token));
        if let Some(refresh_token) = new_refresh_token {
            tokens.insert("refresh_token".to_string(), Value::String(refresh_token));
        }
        if let Some(id_token) = new_id_token {
            tokens.insert("id_token".to_string(), Value::String(id_token));
        }
        if let Some(account_id) = new_account_id {
            tokens.insert("account_id".to_string(), Value::String(account_id));
        }
    }

    auth.as_object_mut()
        .ok_or_else(|| "Codex auth.json must contain a JSON object".to_string())?
        .insert(
            "last_refresh".to_string(),
            Value::String(refreshed_at.to_string()),
        );
    Ok(())
}

async fn refresh_oauth_credentials(auth_path: &Path, auth: &mut Value) -> Result<(), String> {
    let refresh_token = auth
        .pointer("/tokens/refresh_token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "ChatGPT OAuth refresh token is missing".to_string())?
        .to_string();

    let response = crate::oauth::refresh_chatgpt_token(refresh_token).await?;
    let refreshed_at = chrono::Utc::now().to_rfc3339();
    merge_refresh_response(auth, &response, &refreshed_at)?;
    crate::codex_sync::write_codex_auth_value_at(auth_path, auth)
}

#[derive(Debug)]
enum UsageCheckError {
    Unauthorized,
    Other(String),
}

async fn check_chatgpt_usage(
    client: &reqwest::Client,
    access_token: &str,
    account_id: Option<&str>,
) -> Result<(), UsageCheckError> {
    let mut request = client
        .get(CODEX_USAGE_URL)
        .bearer_auth(access_token)
        .header("Accept", "application/json");
    if let Some(account_id) = account_id.filter(|id| !id.trim().is_empty()) {
        request = request.header("ChatGPT-Account-Id", account_id);
    }

    let response = request
        .send()
        .await
        .map_err(|error| UsageCheckError::Other(format!("Usage request failed: {}", error)))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(UsageCheckError::Unauthorized);
    }
    if !response.status().is_success() {
        return Err(UsageCheckError::Other(format!(
            "Usage check returned HTTP {}",
            response.status()
        )));
    }

    response
        .json::<Value>()
        .await
        .map_err(|error| UsageCheckError::Other(format!("Usage response was not valid JSON: {}", error)))?;
    Ok(())
}

fn oauth_access_token(auth: &Value) -> String {
    auth.pointer("/tokens/access_token")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn oauth_account_id(auth: &Value) -> Option<String> {
    auth.pointer("/tokens/account_id")
        .or_else(|| auth.pointer("/tokens/accountId"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

async fn maintain_chatgpt_oauth(auth_path: &Path, mut auth: Value) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let mut refreshed = false;

    let access_token = oauth_access_token(&auth);
    if oauth_token_needs_refresh(&access_token, chrono::Utc::now().timestamp()) {
        refresh_oauth_credentials(auth_path, &mut auth).await?;
        refreshed = true;
    }

    let mut access_token = oauth_access_token(&auth);
    if access_token.is_empty() {
        return Err("ChatGPT OAuth access token is missing".to_string());
    }
    let mut account_id = oauth_account_id(&auth);

    match check_chatgpt_usage(&client, &access_token, account_id.as_deref()).await {
        Ok(()) => {}
        Err(UsageCheckError::Unauthorized) if !refreshed => {
            refresh_oauth_credentials(auth_path, &mut auth).await?;
            refreshed = true;
            access_token = oauth_access_token(&auth);
            account_id = oauth_account_id(&auth);
            check_chatgpt_usage(&client, &access_token, account_id.as_deref())
                .await
                .map_err(|error| match error {
                    UsageCheckError::Unauthorized => {
                        "OAuth usage check remained unauthorized after refresh".to_string()
                    }
                    UsageCheckError::Other(message) => message,
                })?;
        }
        Err(UsageCheckError::Unauthorized) => {
            return Err("OAuth usage check was unauthorized after refresh".to_string());
        }
        Err(UsageCheckError::Other(message)) => return Err(message),
    }

    if refreshed {
        Ok("OAuth token refreshed; usage check OK".to_string())
    } else {
        Ok("OAuth usage check OK".to_string())
    }
}

async fn maintain_api_key(auth: &Value) -> Result<String, String> {
    let api_key = auth
        .get("OPENAI_API_KEY")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .ok_or_else(|| "No API key configured".to_string())?;
    let base_url = auth
        .get("OPENAI_BASE_URL")
        .and_then(Value::as_str)
        .unwrap_or("https://api.openai.com/v1");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let response = client
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().is_success() {
        Ok("API key check OK".to_string())
    } else if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        Err("API key was rejected (401)".to_string())
    } else {
        Err(format!("API key check returned HTTP {}", response.status()))
    }
}

async fn ping_codex_maintenance() -> Result<String, String> {
    let home = crate::session::get_home_dir().ok_or_else(|| "Home dir not found".to_string())?;
    let auth_path = home.join(".codex").join("auth.json");
    if !auth_path.exists() {
        return Err("No Codex auth.json found".to_string());
    }

    let content = std::fs::read_to_string(&auth_path).map_err(|error| error.to_string())?;
    let auth: Value = serde_json::from_str(&content).map_err(|error| error.to_string())?;

    if auth.get("auth_mode").and_then(Value::as_str) == Some("chatgpt") {
        maintain_chatgpt_oauth(&auth_path, auth).await
    } else {
        maintain_api_key(&auth).await
    }
}

async fn ping_antigravity_maintenance() -> Result<String, String> {
    let session = crate::session::read_antigravity_session()
        .await
        .map_err(|error| error.to_string())?;

    let access_token = session
        .get("antigravityUnifiedStateSync.oauthToken")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let refresh_token = session
        .get("antigravity.refreshToken")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if access_token.is_empty() && refresh_token.is_empty() {
        return Err("No Antigravity session found".to_string());
    }

    let auth_method = session
        .get("antigravity.authMethod")
        .and_then(Value::as_str)
        .map(str::to_string);
    let result = crate::antigravity_usage::fetch_antigravity_account_usage(
        access_token,
        (!refresh_token.is_empty()).then_some(refresh_token),
        auth_method,
    )
    .await
    .map_err(|error| format!("{:?}", error))?;

    Ok(format!(
        "quota check OK (plan: {})",
        result.plan_tier.unwrap_or_else(|| "?".to_string())
    ))
}

#[cfg(test)]
mod oauth_maintenance_tests {
    use super::*;

    fn jwt_with_exp(exp: i64) -> String {
        let payload = serde_json::json!({"exp": exp});
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::to_vec(&payload).unwrap());
        format!("header.{}.signature", encoded)
    }

    #[test]
    fn refresh_decision_uses_five_minute_safety_window() {
        let now = 1_700_000_000;
        assert!(!oauth_token_needs_refresh(&jwt_with_exp(now + 301), now));
        assert!(oauth_token_needs_refresh(&jwt_with_exp(now + 300), now));
        assert!(oauth_token_needs_refresh("", now));
        assert!(!oauth_token_needs_refresh("not-a-jwt", now));
    }

    #[test]
    fn refresh_merge_preserves_unknown_fields_and_existing_optional_tokens() {
        let mut auth = serde_json::json!({
            "auth_mode": "chatgpt",
            "custom": {"keep": true},
            "tokens": {
                "access_token": "old",
                "refresh_token": "old-refresh",
                "id_token": "old-id",
                "account_id": "account-1",
                "custom_token_field": 42
            }
        });

        merge_refresh_response(
            &mut auth,
            &serde_json::json!({"access_token": "new-access"}),
            "2026-07-21T00:00:00Z",
        )
        .unwrap();

        assert_eq!(
            auth.pointer("/custom/keep").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            auth.pointer("/tokens/access_token").and_then(Value::as_str),
            Some("new-access")
        );
        assert_eq!(
            auth.pointer("/tokens/refresh_token")
                .and_then(Value::as_str),
            Some("old-refresh")
        );
        assert_eq!(
            auth.pointer("/tokens/id_token").and_then(Value::as_str),
            Some("old-id")
        );
        assert_eq!(
            auth.pointer("/tokens/account_id").and_then(Value::as_str),
            Some("account-1")
        );
        assert_eq!(
            auth.pointer("/tokens/custom_token_field")
                .and_then(Value::as_i64),
            Some(42)
        );
        assert_eq!(
            auth.get("last_refresh").and_then(Value::as_str),
            Some("2026-07-21T00:00:00Z")
        );
    }
}
