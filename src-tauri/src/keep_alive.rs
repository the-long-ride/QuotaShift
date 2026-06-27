use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tokio::sync::Notify;

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
    let mut s = state().lock().unwrap();
    s.interval_mins = mins;
}

pub fn start() {
    let mut s = state().lock().unwrap();
    if !s.running {
        s.running = true;
        drop(s);
        notify().notify_one();
    }
}

pub fn stop() {
    let mut s = state().lock().unwrap();
    s.running = false;
}

pub fn get_status() -> serde_json::Value {
    let s = state().lock().unwrap();
    serde_json::json!({
        "running": s.running,
        "intervalMins": s.interval_mins,
        "lastPing": s.last_ping.map(|ts| {
            chrono::DateTime::from_timestamp(ts, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        }),
        "lastResult": s.last_result,
    })
}

pub async fn run_background() {
    loop {
        let interval_mins = {
            let s = state().lock().unwrap();
            s.interval_mins
        };

        let should_wait = {
            let s = state().lock().unwrap();
            !s.running
        };

        if should_wait {
            notify().notified().await;
            let running = {
                let s = state().lock().unwrap();
                s.running
            };
            if !running {
                continue;
            }
        }

        tokio::time::sleep(Duration::from_secs(interval_mins * 60)).await;

        {
            let s = state().lock().unwrap();
            if !s.running {
                continue;
            }
        }

        match ping_keep_alive().await {
            Ok(msg) => {
                let mut s = state().lock().unwrap();
                s.last_ping = Some(chrono::Utc::now().timestamp());
                s.last_result = Some(msg);
            }
            Err(e) => {
                let mut s = state().lock().unwrap();
                s.last_ping = Some(chrono::Utc::now().timestamp());
                s.last_result = Some(format!("Failed: {}", e));
            }
        }
    }
}

async fn ping_keep_alive() -> Result<String, String> {
    let mut results = Vec::new();

    if let Ok(msg) = ping_codex_keep_alive().await {
        results.push(format!("Codex: {}", msg));
    }

    if let Ok(msg) = ping_antigravity_keep_alive().await {
        results.push(format!("Antigravity: {}", msg));
    }

    if results.is_empty() {
        Ok("No accounts to keep alive".to_string())
    } else {
        Ok(results.join("; "))
    }
}

async fn ping_codex_keep_alive() -> Result<String, String> {
    let home = crate::session::get_home_dir().ok_or_else(|| "Home dir not found".to_string())?;
    let auth_path = home.join(".codex").join("auth.json");

    if !auth_path.exists() {
        return Err("No Codex auth.json found".to_string());
    }

    let content = std::fs::read_to_string(&auth_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let api_key = json.get("OPENAI_API_KEY")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if api_key.is_empty() {
        return Err("No API key configured".to_string());
    }

    let base_url = json.get("OPENAI_BASE_URL")
        .and_then(|v| v.as_str())
        .unwrap_or("https://api.openai.com/v1")
        .to_string();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(format!("OK (status {})", res.status()))
    } else if res.status().as_u16() == 401 {
        Err("Token expired (401)".to_string())
    } else {
        Ok(format!("status {}", res.status()))
    }
}

async fn ping_antigravity_keep_alive() -> Result<String, String> {
    let session = crate::session::read_antigravity_session().await.map_err(|e| e.to_string())?;

    let access_token = session.get("antigravityUnifiedStateSync.oauthToken")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let refresh_token = session.get("antigravity.refreshToken")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if access_token.is_empty() && refresh_token.is_empty() {
        return Err("No Antigravity session found".to_string());
    }

    let auth_method = session.get("antigravity.authMethod")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let result = crate::quota::fetch_antigravity_quota(
        access_token,
        if refresh_token.is_empty() { None } else { Some(refresh_token) },
        auth_method,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(format!("OK (plan: {})", result.get("planTier").and_then(|v| v.as_str()).unwrap_or("?")))
}
