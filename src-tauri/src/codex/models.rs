use serde_json::Value;
use std::process::Command;
use std::time::Duration;

const CODEX_MODELS_BASE_URL: &str = "https://chatgpt.com/backend-api/codex/models";
pub const CODEX_MODELS_COMPAT_CLIENT_VERSION: &str = "0.153.4";
const CODEX_MODELS_ORIGINATOR: &str = "codex_cli_rs";
const CODEX_MODELS_TIMEOUT_SECS: u64 = 15;

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

pub fn select_codex_client_version(explicit: Option<&str>, installed: Option<&str>) -> String {
    explicit
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| installed.map(str::trim).filter(|value| !value.is_empty()))
        .unwrap_or(CODEX_MODELS_COMPAT_CLIENT_VERSION)
        .to_string()
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

    let installed_version = detect_installed_codex_client_version();
    let client_version =
        select_codex_client_version(client_version.as_deref(), installed_version.as_deref());
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
