use crate::oauth;
use base64::Engine;
use serde_json::Value;

pub fn mask_email_address(email: &str) -> String {
    let trimmed = email.trim();
    if let Some((local, domain)) = trimmed.split_once('@') {
        if !local.is_empty() && !domain.is_empty() {
            let chars: Vec<char> = local.chars().collect();
            let take_len = chars.len().min(3);
            let head: String = chars.iter().take(take_len).collect();
            return format!("{}***@{}", head, domain);
        }
    }
    format!("{}***", trimmed)
}

fn extract_jwt_email(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .ok()?;
    let claims: Value = serde_json::from_slice(&decoded).ok()?;
    claims
        .get("email")
        .and_then(Value::as_str)
        .or_else(|| {
            claims
                .pointer("/https:~1~1api.openai.com~1profile/email")
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

#[tauri::command]
pub async fn start_oauth_flow(app_handle: tauri::AppHandle) -> Result<String, String> {
    oauth::start_oauth_flow(&app_handle).await
}

#[tauri::command]
pub async fn exchange_oauth_token(code: String) -> Result<serde_json::Value, String> {
    oauth::exchange_oauth_token(code).await
}

#[tauri::command]
pub async fn fetch_chatgpt_workspaces(access_token: String) -> Result<serde_json::Value, String> {
    oauth::fetch_chatgpt_workspaces(access_token).await
}

#[tauri::command]
pub async fn fetch_chatgpt_profile(access_token: String) -> Result<serde_json::Value, String> {
    oauth::fetch_chatgpt_profile(access_token).await
}

#[tauri::command]
pub async fn fetch_chatgpt_usage(
    access_token: String,
    account_id: String,
    email: Option<String>,
) -> Result<serde_json::Value, String> {
    let aid_label = if account_id.is_empty() || account_id == "shared-local-session" {
        "default".to_string()
    } else {
        account_id.clone()
    };
    let resolved_email = email
        .filter(|e| !e.trim().is_empty())
        .or_else(|| extract_jwt_email(&access_token));
    let email_tag = match resolved_email.as_deref() {
        Some(e) => format!("email={} ", mask_email_address(e)),
        None => String::new(),
    };
    crate::log_eprintln!(
        "[chatgpt_usage] start fetching ChatGPT usage for {}account={}",
        email_tag,
        aid_label
    );
    let aid = if account_id.is_empty() || account_id == "shared-local-session" {
        None
    } else {
        Some(account_id)
    };
    let mut usage = match oauth::fetch_chatgpt_usage(access_token.clone(), aid.clone()).await {
        Ok(u) => u,
        Err(err) => {
            crate::log_eprintln!(
                "[chatgpt_usage] usage refresh FAILED for {}account={}: {}",
                email_tag,
                aid_label,
                err
            );
            return Err(err);
        }
    };

    // Reset credits are supplemental: never fail normal quota refresh when this
    // endpoint is unavailable for a plan/account.
    let mut reset_credits_found = false;
    if let Ok(reset_credits) =
        oauth::fetch_chatgpt_rate_limit_reset_credits(access_token, aid).await
    {
        if let Some(root) = usage.as_object_mut() {
            let rate_limit = root
                .entry("rate_limit")
                .or_insert_with(|| serde_json::json!({}));
            if let Some(rate_limit) = rate_limit.as_object_mut() {
                rate_limit.insert("reset_credits".to_string(), reset_credits);
                reset_credits_found = true;
            }
        }
    }

    let plan = usage
        .get("plan_type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let primary_used = usage
        .pointer("/rate_limit/primary_window/used_percent")
        .or_else(|| usage.pointer("/rate_limit/primary_window/used_percentage"))
        .and_then(|v| v.as_f64());
    let secondary_used = usage
        .pointer("/rate_limit/secondary_window/used_percent")
        .or_else(|| usage.pointer("/rate_limit/secondary_window/used_percentage"))
        .and_then(|v| v.as_f64());

    match (primary_used, secondary_used) {
        (Some(p), Some(s)) => {
            crate::log_eprintln!(
                "[chatgpt_usage] usage refreshed for {}account={} (plan={}, primary={:.1}%, secondary={:.1}%, reset_credits={})",
                email_tag, aid_label, plan, p, s, reset_credits_found
            );
        }
        (Some(p), None) => {
            crate::log_eprintln!(
                "[chatgpt_usage] usage refreshed for {}account={} (plan={}, primary={:.1}%, reset_credits={})",
                email_tag, aid_label, plan, p, reset_credits_found
            );
        }
        _ => {
            crate::log_eprintln!(
                "[chatgpt_usage] usage refreshed for {}account={} (plan={}, reset_credits={})",
                email_tag,
                aid_label,
                plan,
                reset_credits_found
            );
        }
    }

    Ok(usage)
}

#[tauri::command]
pub async fn refresh_chatgpt_token(refresh_token: String) -> Result<serde_json::Value, String> {
    crate::log_eprintln!("[chatgpt_oauth] refreshing ChatGPT OAuth token");
    match oauth::refresh_chatgpt_token(refresh_token).await {
        Ok(res) => {
            crate::log_eprintln!("[chatgpt_oauth] successfully refreshed ChatGPT OAuth token");
            Ok(res)
        }
        Err(err) => {
            crate::log_eprintln!(
                "[chatgpt_oauth] failed to refresh ChatGPT OAuth token: {}",
                err
            );
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn reset_oauth_session() -> Result<(), String> {
    oauth::reset_oauth_session().await
}

#[tauri::command]
pub async fn start_antigravity_google_oauth(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    oauth::start_antigravity_google_oauth(&app_handle).await
}

#[tauri::command]
pub async fn exchange_antigravity_google_token(code: String) -> Result<serde_json::Value, String> {
    oauth::exchange_antigravity_google_token(code).await
}

#[tauri::command]
pub async fn reset_google_oauth_session() -> Result<(), String> {
    oauth::reset_google_oauth_session().await
}

#[tauri::command]
pub async fn fetch_chatgpt_rate_limit_reset_credits(
    access_token: String,
    account_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let aid = account_id.filter(|s| !s.is_empty() && s != "shared-local-session");
    oauth::fetch_chatgpt_rate_limit_reset_credits(access_token, aid).await
}
