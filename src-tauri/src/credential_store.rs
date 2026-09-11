use std::sync::{Mutex, OnceLock};

static CACHED_CREDENTIALS: OnceLock<Mutex<Option<ResolvedCredentials>>> = OnceLock::new();

// Runtime cache for Antigravity consumer OAuth credentials. Populated at startup
// by `spawn_ag_consumer_credentials_prefetch()` from the openly published
// `skainguyen1412/antigravity-usage` repo, and persisted to disk so subsequent
// starts work even when GitHub is unreachable.
static AG_CONSUMER_CREDENTIALS_CACHE: OnceLock<Mutex<Option<(String, String)>>> = OnceLock::new();

const AG_CONSUMER_CREDENTIALS_API_URL: &str =
    "https://raw.githubusercontent.com/skainguyen1412/antigravity-usage/main/src/google/oauth.ts";
const AG_CONSUMER_CLIENT_ID_CACHE_FILENAME: &str = "ag_client_id.txt";
const AG_CONSUMER_CLIENT_SECRET_CACHE_FILENAME: &str = "ag_client_secret.txt";

#[derive(Debug, Clone)]
pub(crate) struct ResolvedCredentials {
    pub consumer_client_id: String,
    pub consumer_client_secret: String,
    pub enterprise_client_id: String,
    pub enterprise_client_secret: String,
}

pub(crate) fn get_credentials() -> Option<ResolvedCredentials> {
    let lock = CACHED_CREDENTIALS.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().unwrap();
    if let Some(ref cached) = *guard {
        return Some(cached.clone());
    }
    let resolved = resolve_from_install()
        .or_else(resolve_from_adc)
        .or_else(resolve_from_runtime_cache);
    if let Some(ref creds) = resolved {
        *guard = Some(creds.clone());
    }
    resolved
}

fn get_ag_consumer_cache() -> &'static Mutex<Option<(String, String)>> {
    AG_CONSUMER_CREDENTIALS_CACHE.get_or_init(|| Mutex::new(None))
}

fn quotashift_data_dir() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        if let Ok(home) = std::env::var("USERPROFILE") {
            return Some(std::path::PathBuf::from(home).join(".quotashift"));
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Some(std::path::PathBuf::from(home).join(".quotashift"));
        }
    }
    None
}

fn ag_client_id_cache_path() -> Option<std::path::PathBuf> {
    quotashift_data_dir().map(|d| d.join(AG_CONSUMER_CLIENT_ID_CACHE_FILENAME))
}

fn ag_client_secret_cache_path() -> Option<std::path::PathBuf> {
    quotashift_data_dir().map(|d| d.join(AG_CONSUMER_CLIENT_SECRET_CACHE_FILENAME))
}

// Parses the antigravity-usage `src/google/oauth.ts` file. The file stores the
// consumer client_id and client_secret as plain string literals (with env-var
// overrides via `||`). We match those literals directly so we don't have to
// understand TS grammar.
fn parse_ag_consumer_credentials(content: &str) -> Result<(String, String), String> {
    let id_re = regex::Regex::new(r#"['"]([0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com)['"]"#)
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
                // Invalidate the resolved-credentials cache so the next
                // `get_credentials()` call re-resolves with the freshly fetched
                // consumer creds (instead of returning a stale `None`).
                if let Some(lock) = CACHED_CREDENTIALS.get() {
                    *lock.lock().unwrap() = None;
                }
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

fn resolve_from_runtime_cache() -> Option<ResolvedCredentials> {
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

fn resolve_from_install() -> Option<ResolvedCredentials> {
    let main_js = find_antigravity_main_js()?;
    let content = std::fs::read_to_string(&main_js).ok()?;

    let consumer_id = extract_google_client_id(&content, "1071006060")?;
    let consumer_secret = extract_gocsp_secret(&content, &consumer_id)?;

    let enterprise_id = extract_google_client_id(&content, "8843549190")?;
    let enterprise_secret = extract_gocsp_secret(&content, &enterprise_id)?;

    eprintln!("[credential_store] resolved OAuth credentials from Antigravity IDE install");
    Some(ResolvedCredentials {
        consumer_client_id: consumer_id,
        consumer_client_secret: consumer_secret,
        enterprise_client_id: enterprise_id,
        enterprise_client_secret: enterprise_secret,
    })
}

fn resolve_from_adc() -> Option<ResolvedCredentials> {
    let adc_path = get_adc_path()?;
    let content = std::fs::read_to_string(&adc_path).ok()?;
    let data: serde_json::Value = serde_json::from_str(&content).ok()?;
    if data.get("type").and_then(|v| v.as_str()) != Some("authorized_user") {
        return None;
    }
    let client_id = data.get("client_id").and_then(|v| v.as_str())?.to_string();
    let client_secret = data.get("client_secret").and_then(|v| v.as_str())?.to_string();
    let is_enterprise = client_id.starts_with("8843");

    eprintln!("[credential_store] resolved OAuth credentials from gcloud ADC");
    if is_enterprise {
        Some(ResolvedCredentials {
            consumer_client_id: crate::secrets::AG_CONSUMER_CLIENT_ID.to_string(),
            consumer_client_secret: crate::secrets::AG_CONSUMER_CLIENT_SECRET.to_string(),
            enterprise_client_id: client_id,
            enterprise_client_secret: client_secret,
        })
    } else {
        Some(ResolvedCredentials {
            consumer_client_id: client_id,
            consumer_client_secret: client_secret,
            enterprise_client_id: crate::secrets::AG_ENTERPRISE_CLIENT_ID.to_string(),
            enterprise_client_secret: crate::secrets::AG_ENTERPRISE_CLIENT_SECRET.to_string(),
        })
    }
}

fn find_antigravity_main_js() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA").ok()?;
        let p = std::path::PathBuf::from(&local).join("Programs/Antigravity/resources/app/out/main.js");
        if p.exists() { return Some(p); }
    }
    #[cfg(target_os = "macos")]
    {
        for c in &["/Applications/Antigravity IDE.app/Contents/Resources/app/out/main.js",
                    "/Applications/Antigravity.app/Contents/Resources/app/out/main.js"] {
            let p = std::path::PathBuf::from(c);
            if p.exists() { return Some(p); }
        }
    }
    #[cfg(target_os = "linux")]
    {
        for c in &["/usr/lib/antigravity/resources/app/out/main.js",
                    "/opt/Antigravity/resources/app/out/main.js"] {
            let p = std::path::PathBuf::from(c);
            if p.exists() { return Some(p); }
        }
    }
    None
}

fn get_adc_path() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").ok()?;
        Some(std::path::PathBuf::from(appdata).join("gcloud/application_default_credentials.json"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").ok()?;
        Some(std::path::PathBuf::from(home).join(".config/gcloud/application_default_credentials.json"))
    }
}

fn extract_google_client_id(content: &str, prefix: &str) -> Option<String> {
    for part in content.split('"') {
        if part.starts_with(prefix) && part.contains(".apps.googleusercontent.com") {
            return Some(part.to_string());
        }
    }
    None
}

fn extract_gocsp_secret(content: &str, client_id: &str) -> Option<String> {
    let pos = content.find(client_id)?;
    let after = &content[pos + client_id.len()..];
    for part in after.split('"') {
        if part.starts_with("GOCSPX-") && part.len() > 10 && part.len() < 100 {
            return Some(part.to_string());
        }
    }
    None
}

pub(crate) fn consumer_client_id() -> String {
    if let Some(c) = get_credentials() {
        if !c.consumer_client_id.is_empty() {
            return c.consumer_client_id;
        }
    }
    // Direct runtime-cache fallback. `get_credentials()` consults this cache as
    // its third fallback already, but if it returned `None` for any reason
    // (e.g., install/ADC/runtime-cache all empty at first call, then prefetch
    // populated the runtime cache later) we still want to surface the freshly
    // fetched value here without forcing callers to re-trigger resolution.
    if let Some((id, _)) = get_ag_consumer_cache().lock().unwrap().as_ref() {
        if !id.is_empty() {
            return id.clone();
        }
    }
    crate::secrets::AG_CONSUMER_CLIENT_ID.to_string()
}

pub(crate) fn consumer_client_secret() -> String {
    if let Some(c) = get_credentials() {
        if !c.consumer_client_secret.is_empty() {
            return c.consumer_client_secret;
        }
    }
    if let Some((_, secret)) = get_ag_consumer_cache().lock().unwrap().as_ref() {
        if !secret.is_empty() {
            return secret.clone();
        }
    }
    crate::secrets::AG_CONSUMER_CLIENT_SECRET.to_string()
}

pub(crate) fn enterprise_client_id() -> String {
    get_credentials()
        .map(|c| c.enterprise_client_id)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| crate::secrets::AG_ENTERPRISE_CLIENT_ID.to_string())
}

pub(crate) fn enterprise_client_secret() -> String {
    get_credentials()
        .map(|c| c.enterprise_client_secret)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| crate::secrets::AG_ENTERPRISE_CLIENT_SECRET.to_string())
}
