use std::sync::{Mutex, OnceLock};

static CACHED_CREDENTIALS: OnceLock<Mutex<Option<ResolvedCredentials>>> = OnceLock::new();

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
        .or_else(resolve_from_adc);
    if let Some(ref creds) = resolved {
        *guard = Some(creds.clone());
    }
    resolved
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
    get_credentials()
        .map(|c| c.consumer_client_id)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| crate::secrets::AG_CONSUMER_CLIENT_ID.to_string())
}

pub(crate) fn consumer_client_secret() -> String {
    get_credentials()
        .map(|c| c.consumer_client_secret)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| crate::secrets::AG_CONSUMER_CLIENT_SECRET.to_string())
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
