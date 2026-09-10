use base64::Engine;
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

pub const CODEX_USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
pub const CODEX_REFRESH_SAFETY_SECONDS: i64 = 5 * 60;

pub fn jwt_expiry(access_token: &str) -> Option<i64> {
    let payload = access_token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .ok()?;
    let claims: Value = serde_json::from_slice(&decoded).ok()?;
    claims.get("exp").and_then(Value::as_i64)
}

pub fn oauth_token_needs_refresh(access_token: &str, now: i64) -> bool {
    if access_token.trim().is_empty() {
        return true;
    }
    jwt_expiry(access_token)
        .map(|expiry| expiry <= now + CODEX_REFRESH_SAFETY_SECONDS)
        .unwrap_or(false)
}

pub fn non_empty_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

pub fn merge_refresh_response(
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

pub async fn refresh_oauth_credentials(auth_path: &Path, auth: &mut Value) -> Result<(), String> {
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
pub enum UsageCheckError {
    Unauthorized,
    Other(String),
}

pub async fn check_chatgpt_usage(
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

    response.json::<Value>().await.map_err(|error| {
        UsageCheckError::Other(format!("Usage response was not valid JSON: {}", error))
    })?;
    Ok(())
}

pub fn oauth_access_token(auth: &Value) -> String {
    auth.pointer("/tokens/access_token")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub fn oauth_account_id(auth: &Value) -> Option<String> {
    auth.pointer("/tokens/account_id")
        .or_else(|| auth.pointer("/tokens/accountId"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

pub async fn maintain_chatgpt_oauth(auth_path: &Path, mut auth: Value) -> Result<String, String> {
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

pub async fn maintain_api_key(auth: &Value) -> Result<String, String> {
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
