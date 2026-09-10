use std::sync::{Mutex, OnceLock};

use super::ResolvedCredentials;

static AG_CONSUMER_CREDENTIALS_CACHE: OnceLock<Mutex<Option<(String, String)>>> = OnceLock::new();

const AG_CONSUMER_CREDENTIALS_API_URL: &str =
    "https://raw.githubusercontent.com/skainguyen1412/antigravity-usage/main/src/google/oauth.ts";
const AG_CONSUMER_CLIENT_ID_CACHE_FILENAME: &str = "ag_client_id.txt";
const AG_CONSUMER_CLIENT_SECRET_CACHE_FILENAME: &str = "ag_client_secret.txt";

pub(crate) fn get_ag_consumer_cache() -> &'static Mutex<Option<(String, String)>> {
    AG_CONSUMER_CREDENTIALS_CACHE.get_or_init(|| Mutex::new(None))
}

fn quotashift_data_dir() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE")
            .ok()
            .map(|h| std::path::PathBuf::from(h).join(".quotashift"))
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME")
            .ok()
            .map(|h| std::path::PathBuf::from(h).join(".quotashift"))
    }
}

fn ag_client_id_cache_path() -> Option<std::path::PathBuf> {
    quotashift_data_dir().map(|d| d.join(AG_CONSUMER_CLIENT_ID_CACHE_FILENAME))
}

fn ag_client_secret_cache_path() -> Option<std::path::PathBuf> {
    quotashift_data_dir().map(|d| d.join(AG_CONSUMER_CLIENT_SECRET_CACHE_FILENAME))
}

fn parse_ag_consumer_credentials(content: &str) -> Result<(String, String), String> {
    let id_re =
        regex::Regex::new(r#"['"]([0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com)['"]"#)
            .map_err(|e| format!("id regex: {e}"))?;
    let secret_re = regex::Regex::new(r#"['"](GOCSPX-[A-Za-z0-9_-]+)['"]"#)
        .map_err(|e| format!("secret regex: {e}"))?;
    let client_id = id_re
        .captures(content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| "client_id not found in antigravity-usage oauth.ts".to_string())?;
    let client_secret = secret_re
        .captures(content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| "client_secret not found in antigravity-usage oauth.ts".to_string())?;
    Ok((client_id, client_secret))
}

pub async fn fetch_ag_credentials_from_api() -> Result<(String, String), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build: {e}"))?;
    let res = client
        .get(AG_CONSUMER_CREDENTIALS_API_URL)
        .send()
        .await
        .map_err(|e| format!("fetch: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("api status: {}", res.status()));
    }
    let body = res.text().await.map_err(|e| format!("read: {e}"))?;
    parse_ag_consumer_credentials(&body)
}

fn load_cached_ag_credentials_from_disk() {
    let id_path = match ag_client_id_cache_path() {
        Some(p) => p,
        None => return,
    };
    let secret_path = match ag_client_secret_cache_path() {
        Some(p) => p,
        None => return,
    };
    let id = std::fs::read_to_string(&id_path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.contains(".apps.googleusercontent.com"));
    let secret = std::fs::read_to_string(&secret_path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| s.starts_with("GOCSPX-"));
    if let (Some(id), Some(secret)) = (id, secret) {
        *get_ag_consumer_cache().lock().unwrap() = Some((id, secret));
        eprintln!("[credential_store] loaded cached AG consumer credentials from disk");
    }
}

fn persist_ag_credentials_to_disk(id: &str, secret: &str) {
    if let (Some(id_path), Some(secret_path)) =
        (ag_client_id_cache_path(), ag_client_secret_cache_path())
    {
        if let Some(parent) = id_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&id_path, id);
        let _ = std::fs::write(&secret_path, secret);
    }
}

pub fn spawn_ag_consumer_credentials_prefetch() {
    load_cached_ag_credentials_from_disk();
    tauri::async_runtime::spawn(async move {
        match fetch_ag_credentials_from_api().await {
            Ok((id, secret)) => {
                *get_ag_consumer_cache().lock().unwrap() = Some((id.clone(), secret.clone()));
                persist_ag_credentials_to_disk(&id, &secret);
                super::invalidate_cached_credentials();
                let preview_len = 12.min(id.len());
                eprintln!(
                    "[credential_store] prefetched AG consumer credentials: {}...",
                    &id[..preview_len]
                );
            }
            Err(e) => {
                eprintln!(
                    "[credential_store] AG credentials prefetch failed, using existing cache if available: {}",
                    e
                );
            }
        }
    });
}

pub(crate) fn resolve_from_runtime_cache() -> Option<ResolvedCredentials> {
    let guard = get_ag_consumer_cache().lock().unwrap();
    let (id, secret) = guard.as_ref()?;
    if id.is_empty() || secret.is_empty() {
        return None;
    }
    eprintln!("[credential_store] resolved consumer OAuth credentials from runtime cache");
    Some(ResolvedCredentials {
        consumer_client_id: id.clone(),
        consumer_client_secret: secret.clone(),
        enterprise_client_id: crate::secrets::AG_ENTERPRISE_CLIENT_ID.to_string(),
        enterprise_client_secret: crate::secrets::AG_ENTERPRISE_CLIENT_SECRET.to_string(),
    })
}
