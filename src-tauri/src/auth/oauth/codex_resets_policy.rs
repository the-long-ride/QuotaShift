use chrono::{DateTime, Utc};
use serde_json::Value;

use super::{
    CodexCachedEntry, CodexResetDiskCache, CodexResetResult, CODEX_RESET_CACHE_TTL_SECS,
    CODEX_RESET_ERROR_TTL_SECS, CODEX_RESET_FORCE_COOLDOWN_SECS,
};
use crate::system::retry_after::{effective_retry_after, record_429_backoff};

pub fn is_sharp_usage_drop(prev_used: Option<f64>, curr_used: Option<f64>) -> bool {
    matches!((prev_used, curr_used), (Some(p), Some(c)) if p >= 80.0 && c <= 20.0)
}

fn is_grant_expired(item: &Value, now: i64) -> bool {
    let status = item
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("available");
    if status != "available" {
        return false;
    }
    item.get("expires_at")
        .and_then(Value::as_str)
        .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
        .is_some_and(|dt| dt.timestamp() <= now)
}

pub fn has_expired_codex_grant(data: &Value, now: i64) -> bool {
    data.get("credits")
        .and_then(Value::as_array)
        .is_some_and(|items| items.iter().any(|item| is_grant_expired(item, now)))
}

pub fn prune_expired_codex_credits(data: &Value, now: i64) -> Value {
    let mut cloned = data.clone();
    let Some(obj) = cloned.as_object_mut() else {
        return cloned;
    };
    let Some(items) = obj.get("credits").and_then(Value::as_array) else {
        return cloned;
    };
    let before = items.len();
    let kept: Vec<Value> = items
        .iter()
        .filter(|item| !is_grant_expired(item, now))
        .cloned()
        .collect();
    if kept.len() != before {
        let avail = kept
            .iter()
            .filter(|i| {
                i.get("status")
                    .and_then(Value::as_str)
                    .unwrap_or("available")
                    == "available"
            })
            .count();
        obj.insert("credits".to_string(), Value::Array(kept));
        obj.insert("available_count".to_string(), Value::from(avail as u64));
    }
    cloned
}

pub(crate) fn should_fetch_codex(
    entry: Option<&CodexCachedEntry>,
    provider_circuit_until: Option<i64>,
    curr_used_pct: Option<f64>,
    now: i64,
    force: bool,
) -> bool {
    if provider_circuit_until.is_some_and(|until| now < until) {
        return false;
    }
    let Some(entry) = entry else {
        return true;
    };
    if entry.retry_after_at.is_some_and(|until| now < until) {
        return false;
    }
    let age = now - entry.fetched_at;
    if age < 0 {
        return true;
    }
    if force {
        return age >= CODEX_RESET_FORCE_COOLDOWN_SECS;
    }
    if entry.error_cooldown_until.is_some_and(|until| now < until) {
        return false;
    }
    if entry.data.is_none() {
        return age >= CODEX_RESET_ERROR_TTL_SECS;
    }
    if is_sharp_usage_drop(entry.last_used_pct, curr_used_pct)
        || entry
            .data
            .as_ref()
            .is_some_and(|d| has_expired_codex_grant(d, now))
    {
        return true;
    }
    age >= CODEX_RESET_CACHE_TTL_SECS
}

pub(crate) fn cached_result(
    entry: Option<&CodexCachedEntry>,
    circuit_until: Option<i64>,
    now: i64,
) -> CodexResetResult {
    let acct_until = entry.and_then(|e| e.retry_after_at).filter(|&u| u > now);
    let circ_until = circuit_until.filter(|&u| u > now);
    let retry_after_at = effective_retry_after(acct_until, circ_until, now);
    let rate_limited = retry_after_at.is_some();
    let data = entry
        .and_then(|e| e.data.as_ref())
        .map(|d| prune_expired_codex_credits(d, now));
    let reason = if acct_until.is_some() {
        entry.and_then(|e| e.last_error.clone())
    } else if circ_until.is_some() {
        Some("circuit_breaker".to_string())
    } else {
        entry.and_then(|e| e.last_error.clone())
    };
    CodexResetResult {
        stale: data.is_some() && (rate_limited || reason.is_some()),
        data,
        rate_limited,
        retry_after_at,
        fetched_at: entry.map(|e| e.fetched_at),
        reason,
    }
}

pub(crate) fn apply_codex_fetch_ok(
    store: &mut CodexResetDiskCache,
    key: &str,
    data: Value,
    curr_used_pct: Option<f64>,
    now: i64,
) -> CodexResetResult {
    let entry = CodexCachedEntry {
        data: Some(data.clone()),
        fetched_at: now,
        last_used_pct: curr_used_pct,
        retry_after_at: None,
        error_cooldown_until: None,
        consecutive_429s: 0,
        last_error: None,
    };
    store.entries.insert(key.to_string(), entry);
    CodexResetResult {
        data: Some(data),
        stale: false,
        rate_limited: false,
        retry_after_at: None,
        fetched_at: Some(now),
        reason: None,
    }
}

pub(crate) fn apply_codex_fetch_err(
    store: &mut CodexResetDiskCache,
    key: &str,
    status: Option<u16>,
    retry_after: Option<&str>,
    now: DateTime<Utc>,
) -> CodexResetResult {
    let now_ts = now.timestamp();
    let prev = store.entries.get(key).cloned();
    let prev_streak = prev.as_ref().map_or(0, |e| e.consecutive_429s);
    let (consecutive, retry_after_at, error_cooldown_until) = if status == Some(429) {
        let (streak, acct_until, circ_until) = record_429_backoff(prev_streak, retry_after, now);
        store.provider_circuit_until = Some(circ_until);
        (streak, Some(acct_until), None)
    } else if matches!(status, Some(400 | 401 | 403 | 404 | 422)) {
        (0, None, Some(now_ts + CODEX_RESET_CACHE_TTL_SECS))
    } else {
        (prev_streak, None, Some(now_ts + CODEX_RESET_ERROR_TTL_SECS))
    };
    let reason = status
        .map(|s| format!("http_{s}"))
        .unwrap_or_else(|| "network_error".to_string());
    let preserved = CodexCachedEntry {
        data: prev.as_ref().and_then(|e| e.data.clone()),
        fetched_at: prev.as_ref().map_or(now_ts, |e| e.fetched_at),
        last_used_pct: prev.as_ref().and_then(|e| e.last_used_pct),
        retry_after_at,
        error_cooldown_until,
        consecutive_429s: consecutive,
        last_error: Some(reason),
    };
    store.entries.insert(key.to_string(), preserved);
    cached_result(store.entries.get(key), store.provider_circuit_until, now_ts)
}
