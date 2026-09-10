use std::sync::{Mutex, OnceLock};

const CODEX_CLIENT_ID_API_URL: &str =
    "https://raw.githubusercontent.com/openai/codex/main/codex-rs/login/src/auth/manager.rs";
const CODEX_CLIENT_ID_CACHE_FILENAME: &str = "codex_client_id.txt";

fn get_codex_client_id_cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
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

fn codex_client_id_cache_path() -> Option<std::path::PathBuf> {
    quotashift_data_dir().map(|d| d.join(CODEX_CLIENT_ID_CACHE_FILENAME))
}

fn parse_codex_client_id(content: &str) -> Result<String, String> {
    let re = regex::Regex::new(r#"pub const CLIENT_ID:\s*&str\s*=\s*"(app_[A-Za-z0-9]+)""#)
        .map_err(|e| format!("regex: {e}"))?;
    if let Some(caps) = re.captures(content) {
        let cid = caps.get(1).unwrap().as_str().to_string();
        return Ok(cid);
    }
    Err("CLIENT_ID not found in api response".to_string())
}

pub async fn fetch_codex_client_id_from_api() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build: {e}"))?;
    let res = client
        .get(CODEX_CLIENT_ID_API_URL)
        .send()
        .await
        .map_err(|e| format!("fetch: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("api status: {}", res.status()));
    }
    let body = res.text().await.map_err(|e| format!("read: {e}"))?;
    parse_codex_client_id(&body)
}

fn load_cached_codex_client_id_from_disk() {
    if let Some(path) = codex_client_id_cache_path() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            let trimmed = content.trim();
            if trimmed.starts_with("app_") {
                *get_codex_client_id_cache().lock().unwrap() = Some(trimmed.to_string());
                eprintln!("[oauth] loaded cached codex client_id from disk");
            }
        }
    }
}

fn persist_codex_client_id_to_disk(cid: &str) {
    if let Some(path) = codex_client_id_cache_path() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, cid);
    }
}

pub async fn get_codex_client_id() -> Result<String, String> {
    {
        let cache = get_codex_client_id_cache().lock().unwrap();
        if let Some(cid) = cache.as_ref() {
            return Ok(cid.clone());
        }
    }
    let cid = fetch_codex_client_id_from_api().await?;
    {
        let mut cache = get_codex_client_id_cache().lock().unwrap();
        *cache = Some(cid.clone());
    }
    persist_codex_client_id_to_disk(&cid);
    Ok(cid)
}

pub fn spawn_codex_client_id_prefetch() {
    load_cached_codex_client_id_from_disk();
    tauri::async_runtime::spawn(async move {
        match fetch_codex_client_id_from_api().await {
            Ok(cid) => {
                *get_codex_client_id_cache().lock().unwrap() = Some(cid.clone());
                persist_codex_client_id_to_disk(&cid);
                eprintln!("[oauth] prefetched codex client_id: {}", &cid);
            }
            Err(e) => {
                eprintln!(
                    "[oauth] client_id prefetch failed, using existing cache if available: {}",
                    e
                );
            }
        }
    });
}
