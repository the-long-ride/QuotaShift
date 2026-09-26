use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::registry::{CodexKeepAliveAccount, CodexKeepAliveTokenUpdate};
use super::{apply_refreshed_tokens, CODEX_TOKEN_UPDATE_EVENT};

pub fn merge_codex_account_refresh(
    auth: &mut Value,
    refresh_response: &Value,
    refreshed_at: &str,
) -> Result<(), String> {
    let new_access = refresh_response
        .get("access_token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "OAuth refresh did not include access_token".to_string())?;

    let new_refresh = refresh_response
        .get("refresh_token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty());

    let new_id = refresh_response
        .get("id_token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty());

    let new_aid = refresh_response
        .get("account_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|t| !t.is_empty());

    let obj = auth
        .as_object_mut()
        .ok_or_else(|| "Codex account credentials must be a JSON object".to_string())?;

    obj.insert(
        "accessToken".to_string(),
        Value::String(new_access.to_string()),
    );
    if let Some(rt) = new_refresh {
        obj.insert("refreshToken".to_string(), Value::String(rt.to_string()));
    }
    if let Some(it) = new_id {
        obj.insert("idToken".to_string(), Value::String(it.to_string()));
    }
    if let Some(aid) = new_aid {
        obj.insert("accountId".to_string(), Value::String(aid.to_string()));
    }
    obj.insert(
        "lastRefresh".to_string(),
        Value::String(refreshed_at.to_string()),
    );

    if let Some(tokens) = obj.get_mut("tokens").and_then(Value::as_object_mut) {
        tokens.insert(
            "access_token".to_string(),
            Value::String(new_access.to_string()),
        );
        if let Some(rt) = new_refresh {
            tokens.insert("refresh_token".to_string(), Value::String(rt.to_string()));
        }
        if let Some(it) = new_id {
            tokens.insert("id_token".to_string(), Value::String(it.to_string()));
        }
        if let Some(aid) = new_aid {
            tokens.insert("account_id".to_string(), Value::String(aid.to_string()));
        }
    }
    Ok(())
}

pub async fn maintain_one(
    app_handle: &AppHandle,
    account: CodexKeepAliveAccount,
) -> Result<String, String> {
    let raw_key = account.api_key.trim();
    if raw_key.starts_with('{') {
        let mut auth: Value = serde_json::from_str(raw_key).map_err(|e| e.to_string())?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        let mut refreshed = false;

        let access_token = auth
            .get("accessToken")
            .or_else(|| auth.pointer("/tokens/access_token"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        let refresh_token = auth
            .get("refreshToken")
            .or_else(|| auth.pointer("/tokens/refresh_token"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(str::to_string);

        if crate::system::keep_alive::codex::oauth_token_needs_refresh(
            &access_token,
            chrono::Utc::now().timestamp(),
        ) {
            if let Some(ref rt) = refresh_token {
                let res = crate::oauth::refresh_chatgpt_token(rt.clone()).await?;
                let refreshed_at = chrono::Utc::now().to_rfc3339();
                merge_codex_account_refresh(&mut auth, &res, &refreshed_at)?;
                refreshed = true;
            }
        }

        let current_access = auth
            .get("accessToken")
            .or_else(|| auth.pointer("/tokens/access_token"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let account_id = auth
            .get("accountId")
            .or_else(|| auth.pointer("/tokens/account_id"))
            .and_then(Value::as_str)
            .map(str::to_string);

        match crate::system::keep_alive::codex::check_chatgpt_usage(
            &client,
            &current_access,
            account_id.as_deref(),
        )
        .await
        {
            Ok(()) => {}
            Err(crate::system::keep_alive::codex::UsageCheckError::Unauthorized) if !refreshed => {
                if let Some(ref rt) = refresh_token {
                    let res = crate::oauth::refresh_chatgpt_token(rt.clone()).await?;
                    let refreshed_at = chrono::Utc::now().to_rfc3339();
                    merge_codex_account_refresh(&mut auth, &res, &refreshed_at)?;
                    refreshed = true;
                    let retried_access = auth
                        .get("accessToken")
                        .or_else(|| auth.pointer("/tokens/access_token"))
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let _ = crate::system::keep_alive::codex::check_chatgpt_usage(
                        &client,
                        &retried_access,
                        account_id.as_deref(),
                    )
                    .await;
                }
            }
            Err(err) => return Err(format!("{:?}", err)),
        }

        if refreshed {
            let new_api_key = serde_json::to_string(&auth).map_err(|e| e.to_string())?;
            apply_refreshed_tokens(&account.account_id, new_api_key.clone());
            let update = CodexKeepAliveTokenUpdate {
                account_id: account.account_id.clone(),
                api_key: new_api_key,
            };
            let _ = app_handle.emit(CODEX_TOKEN_UPDATE_EVENT, update);
            return Ok("OAuth token refreshed; usage check OK".to_string());
        }
        Ok("OAuth usage check OK".to_string())
    } else {
        let auth_obj = serde_json::json!({
            "auth_mode": "openai_api_key",
            "OPENAI_API_KEY": raw_key
        });
        crate::system::keep_alive::maintain_api_key(&auth_obj).await
    }
}
