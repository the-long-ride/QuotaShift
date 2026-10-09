use serde_json::Value;
use std::process::Command;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const CODEX_MODELS_BASE_URL: &str = "https://chatgpt.com/backend-api/codex/models";
pub const CODEX_MODELS_COMPAT_CLIENT_VERSION: &str = "0.153.4";
const CODEX_MODELS_ORIGINATOR: &str = "codex_cli_rs";
const CODEX_MODELS_TIMEOUT_SECS: u64 = 15;
const CODEX_RELEASES_LATEST_URL: &str = "https://api.github.com/repos/openai/codex/releases/latest";
const CODEX_RELEASE_TIMEOUT_SECS: u64 = 5;
const CODEX_RELEASE_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const CODEX_RELEASE_RETRY_TTL: Duration = Duration::from_secs(10 * 60);

/// Latest published Codex version (or the failed lookup), so a scan burst makes one request.
/// The lock is held across the request: concurrent callers wait for it and read its result.
static LATEST_RELEASE: Mutex<Option<(Instant, Option<String>)>> = Mutex::const_new(None);

pub fn codex_models_url(client_version: &str) -> Result<reqwest::Url, String> {
    let client_version = client_version.trim();
    if client_version.is_empty() {
        return Err("Codex client version is required".to_string());
    }

    let mut url = reqwest::Url::parse(CODEX_MODELS_BASE_URL)
        .map_err(|error| format!("Invalid Codex model catalog URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("client_version", client_version);
    Ok(url)
}

/// The catalog is tailored to the client version, so the newest known version wins: an explicit
/// one, then the latest published release (no Codex CLI needed), then an installed CLI, then a
/// built-in floor.
pub fn select_codex_client_version(
    explicit: Option<&str>,
    published: Option<&str>,
    installed: Option<&str>,
) -> String {
    [explicit, published, installed]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .unwrap_or(CODEX_MODELS_COMPAT_CLIENT_VERSION)
        .to_string()
}

/// `rust-v0.162.0` / `v0.162.0` / `0.162.0` -> `0.162.0`; anything else is not a release version.
pub fn parse_release_version(tag: &str) -> Option<String> {
    let version = tag
        .trim()
        .trim_start_matches("rust-")
        .trim_start_matches('v');
    let valid = version.chars().next().is_some_and(|ch| ch.is_ascii_digit())
        && version
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '+'));
    valid.then(|| version.to_string())
}

async fn fetch_latest_release_version() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(CODEX_RELEASE_TIMEOUT_SECS))
        .build()
        .ok()?;
    let response = client
        .get(CODEX_RELEASES_LATEST_URL)
        .header("User-Agent", "QuotaShift")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let release = response.json::<Value>().await.ok()?;
    parse_release_version(release.get("tag_name")?.as_str()?)
}

/// Latest published Codex version from the public release feed; `None` when it is unreachable.
pub async fn latest_published_codex_version() -> Option<String> {
    let mut guard = LATEST_RELEASE.lock().await;
    if let Some((at, version)) = guard.as_ref() {
        let ttl = if version.is_some() {
            CODEX_RELEASE_CACHE_TTL
        } else {
            CODEX_RELEASE_RETRY_TTL
        };
        if at.elapsed() < ttl {
            return version.clone();
        }
    }
    let version = fetch_latest_release_version().await;
    *guard = Some((Instant::now(), version.clone()));
    version
}

pub fn validate_catalog_request_inputs(access_token: &str, account_id: &str) -> Result<(), String> {
    if access_token.trim().is_empty() {
        return Err("Codex access token is required".to_string());
    }
    if account_id.trim().is_empty() {
        return Err("Codex account ID is required".to_string());
    }
    Ok(())
}

pub fn mask_codex_account_id(account_id: &str) -> String {
    let trimmed = account_id.trim();
    if trimmed.is_empty() || trimmed == "shared-local-session" {
        return "default".to_string();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    let len = chars.len();
    if len <= 4 {
        let head: String = chars.iter().take(1).collect();
        return format!("{head}***");
    }
    if len <= 8 {
        let head: String = chars.iter().take(2).collect();
        let tail: String = chars.iter().skip(len - 2).collect();
        return format!("{head}***{tail}");
    }
    let head: String = chars.iter().take(4).collect();
    let tail: String = chars.iter().skip(len - 4).collect();
    format!("{head}***{tail}")
}

pub fn codex_catalog_model_count(value: &Value) -> usize {
    if let Some(rows) = value.as_array() {
        return rows.len();
    }
    value
        .get("models")
        .or_else(|| value.get("data"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0)
}

pub fn format_codex_models_request_in(account_id: &str, client_version: &str) -> String {
    let account = mask_codex_account_id(account_id);
    format!("[codex_models] request in account={account} client={client_version}")
}

pub fn format_codex_models_request_out(
    account_id: &str,
    status: &str,
    model_count: Option<usize>,
) -> String {
    let account = mask_codex_account_id(account_id);
    match model_count {
        Some(count) => {
            format!("[codex_models] request out account={account} status={status} models={count}")
        }
        None => format!("[codex_models] request out account={account} status={status}"),
    }
}

fn emit_codex_models_log(message: &str) {
    #[cfg(not(test))]
    {
        crate::log_eprintln!("{}", message);
    }
    #[cfg(test)]
    {
        let _ = message;
    }
}

fn parse_codex_version_output(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .rev()
        .map(|value| value.trim().trim_start_matches('v'))
        .find(|value| {
            !value.is_empty()
                && value.chars().next().is_some_and(|ch| ch.is_ascii_digit())
                && value
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '+'))
        })
        .map(ToOwned::to_owned)
}

pub fn detect_installed_codex_client_version() -> Option<String> {
    let output = Command::new("codex").arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_codex_version_output(&String::from_utf8_lossy(&output.stdout))
        .or_else(|| parse_codex_version_output(&String::from_utf8_lossy(&output.stderr)))
}

// Exposed through the Tauri handler in lib.rs.
#[tauri::command]
pub async fn fetch_chatgpt_models(
    access_token: String,
    account_id: String,
    client_version: Option<String>,
) -> Result<Value, String> {
    validate_catalog_request_inputs(&access_token, &account_id)?;

    let published_version = latest_published_codex_version().await;
    let installed_version = detect_installed_codex_client_version();
    let client_version = select_codex_client_version(
        client_version.as_deref(),
        published_version.as_deref(),
        installed_version.as_deref(),
    );
    let url = codex_models_url(&client_version)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(CODEX_MODELS_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("Failed to build Codex model catalog client: {error}"))?;

    emit_codex_models_log(&format_codex_models_request_in(
        &account_id,
        &client_version,
    ));

    let response = match client
        .get(url)
        .bearer_auth(access_token.trim())
        .header("ChatGPT-Account-Id", account_id.trim())
        .header("originator", CODEX_MODELS_ORIGINATOR)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            emit_codex_models_log(&format_codex_models_request_out(
                &account_id,
                "network_error",
                None,
            ));
            return Err(format!("Failed to fetch Codex model catalog: {error}"));
        }
    };

    let status = response.status();
    if !status.is_success() {
        emit_codex_models_log(&format_codex_models_request_out(
            &account_id,
            &status.as_u16().to_string(),
            None,
        ));
        return Err(format!(
            "Failed to fetch Codex model catalog (status: {})",
            status
        ));
    }

    let catalog = match response.json::<Value>().await {
        Ok(value) => value,
        Err(error) => {
            emit_codex_models_log(&format_codex_models_request_out(
                &account_id,
                "decode_error",
                None,
            ));
            return Err(format!("Failed to decode Codex model catalog: {error}"));
        }
    };
    emit_codex_models_log(&format_codex_models_request_out(
        &account_id,
        &status.as_u16().to_string(),
        Some(codex_catalog_model_count(&catalog)),
    ));
    Ok(catalog)
}
