use crate::types::FullStatus;
use crate::parser::parse_full_status;
use serde_json::Value;

const CLOUDCODE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const PROACTIVE_REFRESH_BEFORE_EXPIRY_SECS: i64 = 300; // 5 minutes before expiry

fn b64_decode_url_safe(input: &str) -> Option<Vec<u8>> {
    let b64 = input.replace('-', "+").replace('_', "/");
    let pad_len = (4 - (b64.len() % 4)) % 4;
    let padded = b64 + &"=".repeat(pad_len);
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(padded.as_bytes())
        .ok()
}

fn extract_jwt_exp(access_token: &str) -> Option<i64> {
    let parts: Vec<&str> = access_token.splitn(3, '.').collect();
    if parts.len() < 2 {
        return None;
    }
    let decoded = b64_decode_url_safe(parts[1])?;
    let json: Value = serde_json::from_slice(&decoded).ok()?;
    json.get("exp").and_then(|v| v.as_i64())
}

pub(crate) fn is_token_near_expiry(access_token: &str) -> bool {
    if let Some(exp) = extract_jwt_exp(access_token) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        exp - now < PROACTIVE_REFRESH_BEFORE_EXPIRY_SECS
    } else {
        false
    }
}

pub(crate) async fn do_refresh_antigravity_token(
    refresh_token: &str,
    auth_method: Option<&str>,
) -> Result<serde_json::Value, String> {
    eprintln!("[quota] do_refresh_antigravity_token called, auth_method={:?}, refresh_token.len={}", auth_method, refresh_token.len());
    const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

    let client = reqwest::Client::builder()
        .user_agent(CLOUDCODE_USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let mut attempts: Vec<(&str, String, Option<String>)> = vec![
        ("original", crate::secrets::AG_ORIGINAL_CLIENT_ID.to_string(), None),
    ];
    if auth_method == Some("enterprise") {
        attempts.push(("enterprise", crate::credential_store::enterprise_client_id(), Some(crate::credential_store::enterprise_client_secret())));
        attempts.push(("consumer", crate::credential_store::consumer_client_id(), Some(crate::credential_store::consumer_client_secret())));
    } else {
        attempts.push(("consumer", crate::credential_store::consumer_client_id(), Some(crate::credential_store::consumer_client_secret())));
        attempts.push(("enterprise", crate::credential_store::enterprise_client_id(), Some(crate::credential_store::enterprise_client_secret())));
    }

    let mut last_error = String::new();
    for (name, client_id, secret_opt) in &attempts {
        eprintln!("[quota] refresh attempt: name={}, client_id={}, has_secret={}",
            name, client_id, secret_opt.is_some());
        let mut params = vec![
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh_token.to_string()),
            ("client_id", client_id.clone()),
        ];
        if let Some(secret) = secret_opt {
            params.push(("client_secret", secret.clone()));
        }

        // Do not send a narrower `scope` on refresh. Google refresh tokens
        // retain the scopes granted during the original Antigravity OAuth
        // consent flow; requesting only cloud-platform here can discard the
        // extra Antigravity scopes needed by Cloud Code endpoints.
        let res = client
            .post(GOOGLE_TOKEN_URL)
            .form(&params)
            .send()
            .await;

        match res {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if status.is_success() {
                    if let Ok(mut json) = serde_json::from_str::<Value>(&text) {
                        eprintln!("[quota] refresh OK via {}, got scope={:?}", name, json.get("scope").and_then(|v| v.as_str()));
                        json["authMethod"] = serde_json::json!(name);
                        return Ok(json);
                    }
                }
                eprintln!("[quota] refresh {} FAILED ({}): {}", name, status, text);
                last_error = format!("{} refresh failed ({}): {}", name, status, text);
            }
            Err(e) => {
                last_error = format!("{} request error: {}", name, e);
            }
        }
    }

    Err(format!("Token refresh failed: {}", last_error))
}

pub async fn refresh_antigravity_token(
    refresh_token: String,
    auth_method: Option<String>,
) -> Result<serde_json::Value, String> {
    do_refresh_antigravity_token(&refresh_token, auth_method.as_deref()).await
}

pub(crate) async fn fetch_full_status_internal() -> Result<FullStatus, String> {
    use crate::process::{scan_processes, scan_ports, query_server, query_server_https, ProcessKind};
    use crate::types::{AntigravityQuotaSource, AntigravityQuotaAccuracy};

    let procs = scan_processes();
    let mut best_status: Option<FullStatus> = None;

    for proc in procs {
        let ports = scan_ports(proc.pid);
        for port in ports {
            let mut raw_data_opt = query_server_https(port, &proc.token, "/exa.language_server_pb.LanguageServerService/GetUserStatus", serde_json::json!({
                "ideName": "antigravity",
                "extensionName": "antigravity",
                "locale": "en",
                "ideVersion": "unknown"
            })).await.ok();
            
            let mut is_http = false;
            if raw_data_opt.is_none() {
                raw_data_opt = query_server(port, &proc.token, "/exa.language_server_pb.LanguageServerService/GetUserStatus").await.ok();
                is_http = raw_data_opt.is_some();
            }

            if let Some(raw_data) = raw_data_opt {
                let raw_quota_summary = if is_http {
                    query_server(port, &proc.token, "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary").await.ok()
                } else {
                    query_server_https(port, &proc.token, "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary", serde_json::json!({
                        "ideName": "antigravity",
                        "extensionName": "antigravity",
                        "locale": "en",
                        "ideVersion": "unknown"
                    })).await.ok()
                };

                if let Ok(mut status) = parse_full_status(raw_data, raw_quota_summary.unwrap_or(serde_json::Value::Null)) {
                    status.source = Some(match proc.kind {
                        ProcessKind::App => AntigravityQuotaSource::AppLocal,
                        ProcessKind::Cli => AntigravityQuotaSource::AgyLocal,
                        ProcessKind::Ide => AntigravityQuotaSource::IdeLocal,
                    });
                    
                    let has_weekly = status.quotas.iter().any(|q| q.weekly_percent.is_some());
                    if has_weekly {
                        status.accuracy = Some(AntigravityQuotaAccuracy::ExactGrouped);
                    } else {
                        status.accuracy = Some(AntigravityQuotaAccuracy::SessionOnly);
                    }

                    if status.accuracy == Some(AntigravityQuotaAccuracy::ExactGrouped) {
                        return Ok(status);
                    }
                    if best_status.is_none() {
                        best_status = Some(status);
                    }
                }
            }
        }
    }

    if let Some(status) = best_status {
        Ok(status)
    } else {
        Err("Could not fetch data from any local server".to_string())
    }
}
