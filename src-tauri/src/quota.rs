use crate::types::FullStatus;
use crate::process::{query_server, scan_port, scan_processes};
use crate::parser::{build_status_from_models_response, parse_full_status};
use crate::get_state;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

static REFRESH_INFLIGHT: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

fn get_refresh_inflight() -> &'static Mutex<HashMap<String, bool>> {
    REFRESH_INFLIGHT.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn refresh_with_dedup(
    rt: &str,
    auth_method: Option<&str>,
) -> Result<serde_json::Value, String> {
    let lock_key = format!("{:?}:{}", auth_method, &rt[..rt.len().min(20)]);

    loop {
        let is_other_inflight = {
            let mut map = get_refresh_inflight().lock().unwrap();
            if map.contains_key(&lock_key) {
                true
            } else {
                map.insert(lock_key.clone(), true);
                false
            }
        };
        if !is_other_inflight {
            let result = do_refresh_antigravity_token(rt, auth_method).await;
            {
                let mut map = get_refresh_inflight().lock().unwrap();
                map.remove(&lock_key);
            }
            return result;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

const CLOUDCODE_ENDPOINTS: [&str; 3] = [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://daily-cloudcode-pa.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
];
const CLOUDCODE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Antigravity's server-side protocol expects an `antigravity` User-Agent and a
// metadata block on every v1internal request, identical to what the official
// desktop IDE sends. See CodexBar's AntigravityRemoteUsageFetcher.swift.
const AG_REMOTE_USER_AGENT: &str = "antigravity";

fn ag_metadata_body() -> serde_json::Value {
    serde_json::json!({
        "metadata": {
            "ideType": "ANTIGRAVITY",
            "platform": "PLATFORM_UNSPECIFIED",
            "pluginType": "GEMINI",
        }
    })
}

fn ag_project_body(project_id: &str) -> serde_json::Value {
    serde_json::json!({ "project": project_id })
}

const CLOUDCODE_SCOPE: &str = "https://www.googleapis.com/auth/cloud-platform";
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

fn is_token_near_expiry(access_token: &str) -> bool {
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

    let mut attempts: Vec<(&str, String, Option<String>, bool)> = vec![
        ("original", crate::secrets::AG_ORIGINAL_CLIENT_ID.to_string(), None, false),
    ];
    if auth_method == Some("enterprise") {
        attempts.push(("enterprise", crate::credential_store::enterprise_client_id(), Some(crate::credential_store::enterprise_client_secret()), true));
        attempts.push(("consumer", crate::credential_store::consumer_client_id(), Some(crate::credential_store::consumer_client_secret()), true));
    } else {
        attempts.push(("consumer", crate::credential_store::consumer_client_id(), Some(crate::credential_store::consumer_client_secret()), true));
        attempts.push(("enterprise", crate::credential_store::enterprise_client_id(), Some(crate::credential_store::enterprise_client_secret()), true));
    }

    let mut last_error = String::new();
    for (name, client_id, secret_opt, can_request_scope) in &attempts {
        eprintln!("[quota] refresh attempt: name={}, client_id={}, has_secret={}, can_request_scope={}",
            name, client_id, secret_opt.is_some(), can_request_scope);
        let mut params = vec![
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh_token.to_string()),
            ("client_id", client_id.clone()),
        ];
        if let Some(secret) = secret_opt {
            params.push(("client_secret", secret.clone()));
        }
        if *can_request_scope {
            params.push(("scope", CLOUDCODE_SCOPE.to_string()));
        }

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

pub async fn fetch_antigravity_quota(
    access_token: String,
    refresh_token: Option<String>,
    auth_method: Option<String>,
) -> Result<serde_json::Value, String> {
    eprintln!("[quota] fetch_antigravity_quota called, token.len={}, has_refresh={}, auth_method={:?}",
        access_token.len(), refresh_token.is_some(), auth_method);

    let client = reqwest::Client::builder()
        .user_agent(CLOUDCODE_USER_AGENT)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut token = access_token;
    let mut refreshed_tokens: Option<serde_json::Value> = None;

    let token_near_expiry = is_token_near_expiry(&token);
    eprintln!("[quota] token near expiry: {}", token_near_expiry);

    if token_near_expiry {
        if let Some(ref rt) = refresh_token {
            eprintln!("[quota] token near expiry, doing proactive refresh...");
            match refresh_with_dedup(rt, auth_method.as_deref()).await {
                Ok(new_tokens) => {
                    if let Some(new_at) = new_tokens.get("access_token").and_then(|v| v.as_str()) {
                        token = new_at.to_string();
                        refreshed_tokens = Some(new_tokens);
                        eprintln!("[quota] proactive refresh OK");
                    }
                }
                Err(e) => {
                    eprintln!("[quota] proactive refresh failed: {}", e);
                }
            }
        }
    }

    let fetch_result = try_fetch_cloudcode_data(&client, &token).await;

    eprintln!("[quota] try_fetch_cloudcode_data result: {}", match &fetch_result {
        Ok(_) => "OK".to_string(),
        Err(e) => format!("ERR: {}", e),
    });

    let (raw_data, raw_quota_summary) = match fetch_result {
        Ok(res) => (Some(res.0), res.1),
        Err(e) => {
            eprintln!("[quota] handling error: {}", e);
            if e.contains("Unauthorized (401)") {
                if let Some(ref rt) = refresh_token {
                    match refresh_with_dedup(rt, auth_method.as_deref()).await {
                        Ok(new_tokens) => {
                            if let Some(new_at) = new_tokens.get("access_token").and_then(|v| v.as_str()) {
                                token = new_at.to_string();
                                refreshed_tokens = Some(new_tokens);
                                match try_fetch_cloudcode_data(&client, &token).await {
                                    Ok(res) => return Ok(build_result(res.0, res.1, refreshed_tokens)),
                                    Err(retry_err) => {
                                        if retry_err.contains("403 Forbidden") && refreshed_tokens.is_some() {
                match try_reread_session_and_fetch(&client).await {
                    Ok(res) => return Ok(res),
                    Err(_) => {}
                }

                match fetch_full_status_internal().await {
                                                Ok(status) => {
                                                    let mut result = serde_json::to_value(&status).map_err(|e| e.to_string())?;
                                                    result["_source"] = serde_json::json!("language_server_fallback");
                                                    result["refreshedTokens"] = refreshed_tokens.unwrap();
                                                    return Ok(result);
                                                }
                                                Err(ls_err) => {
                                                    return Err(format!("API 403 after refresh (scope may be insufficient). IDE fallback: {}", ls_err));
                                                }
                                            }
                                        }
                                        return Err(format!("Quota API fetch failed after token refresh: {}", retry_err));
                                    }
                                }
                            } else {
                                return Err("Token refresh succeeded but did not return access_token".to_string());
                            }
                        }
                        Err(refresh_err) => return Err(format!("Token refresh failed: {}", refresh_err)),
                    }
                } else {
                    return Err("Unauthorized (401) and no refresh token available".to_string());
                }
            } else if e.contains("403 Forbidden") {
                if refreshed_tokens.is_none() {
                    if let Some(ref rt) = refresh_token {
                        match refresh_with_dedup(rt, auth_method.as_deref()).await {
                            Ok(new_tokens) => {
                                if let Some(new_at) = new_tokens.get("access_token").and_then(|v| v.as_str()) {
                                    token = new_at.to_string();
                                    refreshed_tokens = Some(new_tokens);
                                    match try_fetch_cloudcode_data(&client, &token).await {
                                        Ok(res) => return Ok(build_result(res.0, res.1, refreshed_tokens)),
                                        Err(retry_err) => {
                                            eprintln!("[quota] 403 even after refresh: {}", retry_err);
                                        }
                                    }
                                }
                            }
                            Err(refresh_err) => {
                                eprintln!("[quota] refresh on 403 failed: {}", refresh_err);
                            }
                        }
                    }
                }

                match fetch_full_status_internal().await {
                    Ok(status) => {
                        let mut result = serde_json::to_value(&status)
                            .map_err(|e| e.to_string())?;
                        result["_source"] = serde_json::json!("language_server_fallback");
                        if let Some(tokens) = refreshed_tokens {
                            result["refreshedTokens"] = tokens;
                        }
                        return Ok(result);
                    }
                    Err(ls_err) => {
                        eprintln!("[quota] language_server_fallback ALSO failed: {}", ls_err);
                        return Err(format!(
                            "Cloud API 403. IDE fallback: {}. Ensure Antigravity IDE is running or re-login via Browser Login.",
                            ls_err
                        ));
                    }
                }
            } else {
                eprintln!("[quota] non-401/403 error: {}", e);
                return Err(format!("Could not reach Antigravity quota API: {}", e));
            }
        }
    };

    let raw = raw_data.ok_or_else(|| "Could not reach Antigravity quota API".to_string())?;
    Ok(build_result(raw, raw_quota_summary, refreshed_tokens))
}

pub async fn fetch_antigravity_quota_with_gcloud_fallback(
    access_token: String,
    refresh_token: Option<String>,
    auth_method: Option<String>,
    project_id: Option<String>,
    service_name: Option<String>,
) -> Result<serde_json::Value, String> {
    eprintln!("[quota] fetch_antigravity_quota_with_gcloud_fallback: project_id={:?}, service_name={:?}",
        project_id, service_name);
    let primary = fetch_antigravity_quota(
        access_token.clone(),
        refresh_token.clone(),
        auth_method.clone(),
    )
    .await;

    match primary {
        Ok(result) => {
            eprintln!("[quota] primary fetch OK, _source={:?}", result.get("_source").and_then(|v| v.as_str()));
            eprintln!("[quota] quotas count={}", result.get("quotas").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0));
            eprintln!("[quota] result keys: {:?}", result.as_object().map(|o| o.keys().collect::<Vec<_>>()));
            eprintln!("[quota] full result: {}", result);
            Ok(result)
        }
        Err(e) => {
            eprintln!("[quota] primary fetch ERROR: {}", e);
            if e.contains("403") && project_id.is_some() && service_name.is_some() {
                let pid = project_id.unwrap();
                let svc = service_name.unwrap();
                eprintln!("[quota] cloudcode-pa 403'd, trying Google Cloud quota provider: project={}, service={}", pid, svc);
                match crate::gcloud_quota::fetch_google_cloud_quota(&access_token, &pid, &svc).await {
                    Ok(status) => {
                        let mut result = serde_json::to_value(&status).map_err(|e| e.to_string())?;
                        result["_source"] = serde_json::json!("google_cloud_provider");
                        Ok(result)
                    }
                    Err(gc_err) => {
                        eprintln!("[quota] GC provider failed: {}", gc_err);
                        Err(format!("Cloud API 403. Google Cloud provider also failed: {}", gc_err))
                    }
                }
            } else {
                eprintln!("[quota] no GC fallback configured or not a 403: project_id={:?} svc={:?} err_contains_403={}",
                    project_id, service_name, e.contains("403"));
                Err(e)
            }
        }
    }
}

async fn try_reread_session_and_fetch(client: &reqwest::Client) -> Result<serde_json::Value, String> {
    let session = crate::session::read_antigravity_session().await.map_err(|e| e)?;

    let fresh_token = session.get("antigravityUnifiedStateSync.oauthToken")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let fresh_refresh = session.get("antigravity.refreshToken")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let fresh_auth_method = session.get("antigravity.authMethod")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if fresh_token.is_empty() {
        return Err("No token in re-read session".to_string());
    }

    if !fresh_refresh.is_empty() {
        match do_refresh_antigravity_token(&fresh_refresh, fresh_auth_method.as_deref()).await {
            Ok(new_tokens) => {
                if let Some(new_at) = new_tokens.get("access_token").and_then(|v| v.as_str()) {
                    let result_tokens = Some(new_tokens.clone());
                    match try_fetch_cloudcode_data(client, new_at).await {
                        Ok(res) => return Ok(build_result(res.0, res.1, result_tokens)),
                        Err(_) => {}
                    }
                }
            }
            Err(_) => {}
        }
    }

    match try_fetch_cloudcode_data(client, &fresh_token).await {
        Ok(res) => Ok(build_result(res.0, res.1, None)),
        Err(e) => Err(format!("Fresh session token also failed: {}", e)),
    }
}

fn build_result(
    raw_data: serde_json::Value,
    raw_quota_summary: Option<serde_json::Value>,
    refreshed_tokens: Option<serde_json::Value>,
) -> serde_json::Value {
    let quota_summary = raw_quota_summary.unwrap_or(serde_json::Value::Null);
    let status = parse_full_status(raw_data, quota_summary);
    let mut result = match status {
        Ok(s) => serde_json::to_value(s).unwrap_or_default(),
        Err(_) => serde_json::Value::Null,
    };
    if let Some(tokens) = refreshed_tokens {
        result["refreshedTokens"] = tokens;
    }
    result
}

async fn try_fetch_cloudcode_data(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<(serde_json::Value, Option<serde_json::Value>), String> {
    eprintln!("[quota] try_fetch_cloudcode_data: token prefix={}", &access_token[..access_token.len().min(12)]);
    let mut errors = Vec::new();

    for base in CLOUDCODE_ENDPOINTS.iter() {
        match fetch_remote_quota_via_chain(client, base, access_token).await {
            Ok((models_json, quota_buckets_opt, plan_info_opt)) => {
                let wrapped = build_status_from_models_response(models_json, plan_info_opt.as_ref());

                // Cloud OAuth returns model-shaped quotas (buckets[]), not the
                // grouped RetrieveUserQuotaSummary payload. Surface them under
                // /response/groups so downstream parsers can still consume it.
                let wrapped_quota = quota_buckets_opt.map(|q| {
                    serde_json::json!({ "response": { "modelBuckets": q } })
                });

                return Ok((wrapped, wrapped_quota));
            }
            Err(RemoteFetchError::Unauthorized) => {
                eprintln!("[quota] {} remote fetch: 401 Unauthorized", base);
                return Err("Unauthorized (401)".to_string());
            }
            Err(RemoteFetchError::Forbidden(msg)) => {
                eprintln!("[quota] {} remote fetch: 403 Forbidden body={}", base, msg);
                errors.push(format!(
                    "{}: 403 Forbidden — token may lack required scope ({})",
                    base, msg
                ));
            }
            Err(RemoteFetchError::Other(msg)) => {
                errors.push(format!("{}: {}", base, msg));
            }
        }
    }

    Err(if errors.is_empty() {
        "No endpoints tried".to_string()
    } else {
        errors.join("; ")
    })
}

#[derive(Debug)]
enum RemoteFetchError {
    Unauthorized,
    Forbidden(String),
    Other(String),
}

/// Performs the Google OAuth-backed Antigravity quota fetch:
///
/// 1. loadCodeAssist (with metadata) -> { cloudaicompanionProject, currentTier, allowedTiers, planInfo }
/// 2. onboardUser (only if no cloudaicompanionProject)
/// 3. fetchAvailableModels (with {project: id}) -> { models: { id: { quotaInfo, displayName, label } } }
/// 4. retrieveUserQuota (with {project: id}) -> { buckets: [{ modelId, remainingFraction, resetTime }] }
///
/// Returns (models_json, optional_quota_buckets_array, optional_plan_info).
/// All requests use User-Agent: antigravity and the proper request envelope.
async fn fetch_remote_quota_via_chain(
    client: &reqwest::Client,
    base: &str,
    access_token: &str,
) -> Result<(serde_json::Value, Option<Vec<serde_json::Value>>, Option<serde_json::Value>), RemoteFetchError> {
    // 1) loadCodeAssist
    let load_url = format!("{}/v1internal:loadCodeAssist", base);
    let code_assist: serde_json::Value = send_remote_json(
        client, &load_url, access_token, ag_metadata_body(),
    ).await.map_err(|e| classify_remote_error(e, "loadCodeAssist"))?;

    // Try to extract the project id and onboarding metadata.
    let project_id = extract_project_id(&code_assist);
    let tier_id = pick_onboard_tier(&code_assist);
    let allowed_tiers = code_assist.get("allowedTiers").cloned();
    let plan_info = code_assist.get("planInfo").cloned();

    // 2) onboardUser if needed
    let mut project_id = project_id;
    if project_id.is_none() {
        if let Some(tid) = tier_id.as_deref() {
            let mut onboard_body = ag_metadata_body();
            if let Some(obj) = onboard_body.as_object_mut() {
                obj.insert("tierId".to_string(), serde_json::Value::String(tid.to_string()));
            }
            let onboard_url = format!("{}/v1internal:onboardUser", base);
            match send_remote_json::<serde_json::Value>(
                client, &onboard_url, access_token, onboard_body,
            ).await {
                Ok(onboard) => {
                    project_id = extract_project_id(&onboard)
                        .or_else(|| onboard.get("response").and_then(extract_project_id_from_inner));
                    // keep allowedTiers from initial response
                }
                Err(e) => {
                    eprintln!("[quota] onboardUser failed (non-fatal, will retry loadCodeAssist): {:?}", e);
                }
            }
        }

        // Poll loadCodeAssist briefly if onboarding hasn't propagated yet
        let mut polls = 0;
        while project_id.is_none() && polls < 5 {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            if let Ok(retry) = send_remote_json::<serde_json::Value>(
                client, &load_url, access_token, ag_metadata_body(),
            ).await {
                project_id = extract_project_id(&retry);
            }
            polls += 1;
        }
    }

    // 3) fetchAvailableModels
    let models_body = match project_id.as_deref() {
        Some(pid) => ag_project_body(pid),
        None => serde_json::json!({}),
    };
    let models_url = format!("{}/v1internal:fetchAvailableModels", base);
    let models_json: serde_json::Value = send_remote_json(
        client, &models_url, access_token, models_body,
    ).await.map_err(|e| classify_remote_error(e, "fetchAvailableModels"))?;

    // 4) retrieveUserQuota (best-effort, may be denied for free-tier accounts)
    let mut quota_buckets: Option<Vec<serde_json::Value>> = None;
    if let Some(pid) = project_id.as_deref() {
        let quota_url = format!("{}/v1internal:retrieveUserQuota", base);
        match send_remote_json::<serde_json::Value>(
            client, &quota_url, access_token, ag_project_body(pid),
        ).await {
            Ok(v) => {
                if let Some(arr) = v.get("buckets").and_then(|x| x.as_array()) {
                    quota_buckets = Some(arr.clone());
                } else if let Some(arr) = v.as_array() {
                    quota_buckets = Some(arr.clone());
                }
            }
            Err(RemoteFetchError::Forbidden(msg)) => {
                eprintln!(
                    "[quota] retrieveUserQuota denied (bucket fallback unavailable): {}",
                    msg
                );
            }
            Err(e) => {
                eprintln!("[quota] retrieveUserQuota error (continuing without buckets): {:?}", e);
            }
        }
    }

    // Ensure the returned models object is non-empty so parse_full_status has data to consume
    let models_obj_opt = models_json.get("models").and_then(|m| m.as_object());
    if models_obj_opt.map(|o| o.is_empty()).unwrap_or(true) {
        return Err(RemoteFetchError::Other("no models returned".to_string()));
    }

    // Stash allowedTiers next to the models response so plan resolution works
    let mut out = models_json.clone();
    if let Some(obj) = out.as_object_mut() {
        if let Some(tiers) = allowed_tiers {
            obj.entry("allowedTiers".to_string()).or_insert(tiers);
        }
        if let Some(tier) = code_assist.get("currentTier").cloned() {
            obj.entry("currentTier".to_string()).or_insert(tier);
        }
        if let Some(pt) = code_assist.get("paidTier").cloned() {
            obj.entry("paidTier".to_string()).or_insert(pt);
        }
        if let Some(pi) = plan_info.clone() {
            obj.entry("planInfo".to_string()).or_insert(pi);
        }
    }

    Ok((out, quota_buckets, plan_info))
}

async fn send_remote_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    access_token: &str,
    body: serde_json::Value,
) -> Result<T, RemoteFetchError> {
    let res = client
        .post(url)
        .bearer_auth(access_token)
        .header("User-Agent", AG_REMOTE_USER_AGENT)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| RemoteFetchError::Other(format!("connection error: {}", e)))?;

    let status = res.status();
    if !status.is_success() {
        let txt = res.text().await.unwrap_or_default();
        let snippet: String = txt.chars().take(400).collect();
        return if status == 401 {
            Err(RemoteFetchError::Unauthorized)
        } else if status == 403 {
            Err(RemoteFetchError::Forbidden(snippet))
        } else {
            Err(RemoteFetchError::Other(format!("HTTP {}: {}", status, snippet)))
        };
    }

    res.json::<T>().await.map_err(|e| RemoteFetchError::Other(format!("json parse error: {}", e)))
}

fn classify_remote_error(e: RemoteFetchError, _label: &str) -> RemoteFetchError {
    e
}

/// Tolerates the wrapper variations CodexBar observed for project ids:
///   `{"cloudaicompanionProject": {"id": "abc"}}`   (object form)
///   `{"cloudaicompanionProject": "abc"}`            (string form)
///   `{"cloudaicompanionProject": {"projectId": "abc"}}`
fn extract_project_id(value: &serde_json::Value) -> Option<String> {
    let v = value.get("cloudaicompanionProject")?;
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    if let Some(obj) = v.as_object() {
        if let Some(s) = obj.get("id").and_then(|x| x.as_str()) {
            return Some(s.to_string());
        }
        if let Some(s) = obj.get("projectId").and_then(|x| x.as_str()) {
            return Some(s.to_string());
        }
        if let Some(s) = obj.get("projectID").and_then(|x| x.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

fn extract_project_id_from_inner(value: &serde_json::Value) -> Option<String> {
    extract_project_id(value)
}

/// Pick a tier id suitable for onboardUser:
///   - first allowedTiers entry with isDefault=true
///   - else first allowedTiers entry with a non-empty id
///   - else paidTier.id
///   - else currentTier.id
fn pick_onboard_tier(value: &serde_json::Value) -> Option<String> {
    if let Some(arr) = value.get("allowedTiers").and_then(|v| v.as_array()) {
        for t in arr {
            if t.get("isDefault").and_then(|x| x.as_bool()) == Some(true) {
                if let Some(id) = t.get("id").and_then(|x| x.as_str()) {
                    return Some(id.to_string());
                }
            }
        }
        for t in arr {
            if let Some(id) = t.get("id").and_then(|x| x.as_str()) {
                return Some(id.to_string());
            }
        }
    }
    if let Some(id) = value.get("paidTier").and_then(|t| t.get("id")).and_then(|x| x.as_str()) {
        return Some(id.to_string());
    }
    if let Some(id) = value.get("currentTier").and_then(|t| t.get("id")).and_then(|x| x.as_str()) {
        return Some(id.to_string());
    }
    None
}

pub(crate) async fn fetch_full_status_internal() -> Result<FullStatus, String> {
    let (mut pid, mut token, mut port) = {
        let state = get_state().lock().unwrap();
        (
            state.cached_pid,
            state.cached_token.clone(),
            state.cached_port,
        )
    };

    let mut raw_data = None;
    let mut raw_quota_summary = None;

    if let (Some(_p), Some(t), Some(po)) = (pid, &token, port) {
        if let Ok(data) = query_server(po, t, "/exa.language_server_pb.LanguageServerService/GetUserStatus").await {
            raw_data = Some(data);
            raw_quota_summary = query_server(po, t, "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary").await.ok();
        }
    }

    if raw_data.is_none() {
        if let Some((p, t)) = scan_processes() {
            if let Some(po) = scan_port(p) {
                if let Ok(data) = query_server(po, &t, "/exa.language_server_pb.LanguageServerService/GetUserStatus").await {
                    pid = Some(p);
                    token = Some(t);
                    port = Some(po);

                    {
                        let mut state = get_state().lock().unwrap();
                        state.cached_pid = pid;
                        state.cached_token = token.clone();
                        state.cached_port = port;
                    }

                    raw_data = Some(data);
                    raw_quota_summary = query_server(po, token.as_deref().unwrap(), "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary").await.ok();
                }
            }
        }
    }

    let raw = raw_data.ok_or_else(|| "Could not fetch data from server".to_string())?;
    let mut new_status = parse_full_status(raw, raw_quota_summary.unwrap_or(serde_json::Value::Null))?;

    let chosen_model = {
        let state = get_state().lock().unwrap();
        state.monitored_model.clone()
    };

    if let Some(ref model) = chosen_model {
        if new_status.quotas.iter().any(|q| &q.model == model) {
            new_status.recently_used_model = Some(model.clone());
        }
    }

    Ok(new_status)
}
