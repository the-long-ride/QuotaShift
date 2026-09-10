// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::Value;
use tokio::sync::Notify;

pub mod codex;
pub use codex::*;

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
mod tests;
