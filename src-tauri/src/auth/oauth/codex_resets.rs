use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[path = "codex_resets_policy.rs"]
mod policy;

pub use policy::{has_expired_codex_grant, is_sharp_usage_drop, prune_expired_codex_credits};

use crate::system::retry_after::{load_json_cache, quotashift_cache_path, save_json_cache};
use policy::{apply_codex_fetch_err, apply_codex_fetch_ok, cached_result, should_fetch_codex};

const CODEX_RESET_CREDITS_URL: &str =
    "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const CODEX_RESET_CACHE_FILE: &str = "codex-reset-cache.json";
/// Standard cache lifetime per account (3 hours).
pub const CODEX_RESET_CACHE_TTL_SECS: i64 = 3 * 60 * 60;
/// Minimum interval before honoring a manual forced refresh (5 minutes).
pub const CODEX_RESET_FORCE_COOLDOWN_SECS: i64 = 5 * 60;
/// Short retry delay for transient 5xx/network errors.
pub const CODEX_RESET_ERROR_TTL_SECS: i64 = 90;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodexResetResult {
    pub data: Option<Value>,
    pub stale: bool,
    pub rate_limited: bool,
    pub retry_after_at: Option<i64>,
    pub fetched_at: Option<i64>,
    pub reason: Option<String>,
}

impl CodexResetResult {
    /// Returns a `rate_limit.reset_credits` JSON object annotated with stale/retry metadata.
    pub fn into_rate_limit_value(&self) -> Option<Value> {
        let mut value = self.data.clone()?;
        if let Some(obj) = value.as_object_mut() {
            obj.insert("stale".to_string(), Value::Bool(self.stale));
            if let Some(ts) = self.fetched_at {
                obj.insert("fetched_at".to_string(), Value::from(ts));
            }
            if let Some(until) = self.retry_after_at {
                obj.insert("retry_after_at".to_string(), Value::from(until));
            }
            if let Some(reason) = &self.reason {
                obj.insert("stale_reason".to_string(), Value::String(reason.clone()));
            }
        }
        Some(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CodexCachedEntry {
    pub(crate) data: Option<Value>,
    pub(crate) fetched_at: i64,
    pub(crate) last_used_pct: Option<f64>,
    pub(crate) retry_after_at: Option<i64>,
    #[serde(default)]
    pub(crate) error_cooldown_until: Option<i64>,
    pub(crate) consecutive_429s: u32,
    pub(crate) last_error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct CodexResetDiskCache {
    #[serde(default)]
    pub(crate) provider_circuit_until: Option<i64>,
    #[serde(default)]
    pub(crate) entries: HashMap<String, CodexCachedEntry>,
}

fn cache() -> &'static Mutex<Option<CodexResetDiskCache>> {
    static CACHE: OnceLock<Mutex<Option<CodexResetDiskCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn hash_account_key(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    digest.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

pub(crate) fn cache_key(account_id: Option<&str>, access_token: &str) -> String {
    let raw = crate::oauth::distinct_codex_account_id(account_id)
        .map(str::to_string)
        .or_else(|| jwt_account_key(access_token));
    match raw {
        Some(value) => hash_account_key(&value),
        None => "default".to_string(),
    }
}

fn jwt_account_key(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .ok()?;
    let claims: Value = serde_json::from_slice(&decoded).ok()?;
    claims
        .pointer("/https:~1~1api.openai.com~1auth/chatgpt_account_id")
        .or_else(|| claims.get("sub"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

async fn fetch_raw(
    access_token: &str,
    account_id: Option<&str>,
) -> Result<Value, (Option<u16>, Option<String>, String)> {
    let client = crate::http_client::shared_client();
    let mut req = client
        .get(CODEX_RESET_CREDITS_URL)
        .bearer_auth(access_token)
        .header("Originator", "Codex Desktop")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .header("Accept", "application/json");
    if let Some(aid) = account_id.filter(|a| !a.is_empty()) {
        req = req.header("ChatGPT-Account-Id", aid);
    }
    let res = req.send().await.map_err(|e| (None, None, e.to_string()))?;
    let status = res.status();
    if !status.is_success() {
        let retry = res
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let msg = format!("Failed to fetch rate-limit reset credits ({status})");
        return Err((Some(status.as_u16()), retry, msg));
    }
    res.json::<Value>()
        .await
        .map_err(|e| (Some(status.as_u16()), None, e.to_string()))
}

pub async fn fetch_chatgpt_rate_limit_reset_credits(
    access_token: String,
    account_id: Option<String>,
) -> Result<Value, String> {
    fetch_raw(&access_token, account_id.as_deref())
        .await
        .map_err(|(_, _, msg)| msg)
}

pub async fn get_or_fetch_codex_reset_credits(
    access_token: String,
    account_id: Option<String>,
    current_used_pct: Option<f64>,
    force: bool,
) -> CodexResetResult {
    let key = cache_key(account_id.as_deref(), &access_token);
    let now = Utc::now();
    let now_ts = now.timestamp();
    let disk_path = quotashift_cache_path(CODEX_RESET_CACHE_FILE);
    {
        let mut guard = cache().lock().unwrap_or_else(|p| p.into_inner());
        let store = guard.get_or_insert_with(|| {
            disk_path
                .as_deref()
                .map(load_json_cache)
                .unwrap_or_default()
        });
        if !should_fetch_codex(
            store.entries.get(&key),
            store.provider_circuit_until,
            current_used_pct,
            now_ts,
            force,
        ) {
            if let Some(entry) = store.entries.get_mut(&key) {
                if current_used_pct.is_some()
                    && !is_sharp_usage_drop(entry.last_used_pct, current_used_pct)
                {
                    entry.last_used_pct = current_used_pct;
                }
            }
            return cached_result(
                store.entries.get(&key),
                store.provider_circuit_until,
                now_ts,
            );
        }
    }

    let outcome = fetch_raw(&access_token, account_id.as_deref()).await;
    let mut guard = cache().lock().unwrap_or_else(|p| p.into_inner());
    let store = guard.get_or_insert_with(CodexResetDiskCache::default);
    let result = match outcome {
        Ok(json) => apply_codex_fetch_ok(store, &key, json, current_used_pct, now_ts),
        Err((status, retry, _)) => {
            crate::log_eprintln!(
                "[codex_resets] fetch error account={} status={:?}",
                key,
                status
            );
            apply_codex_fetch_err(store, &key, status, retry.as_deref(), now)
        }
    };
    if let Some(path) = disk_path.as_deref() {
        save_json_cache(path, store);
    }
    result
}

#[cfg(test)]
#[path = "codex_resets_test.rs"]
mod tests;
