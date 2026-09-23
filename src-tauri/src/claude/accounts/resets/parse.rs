use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;

/// One request per account per 30 minutes.
pub const CACHE_TTL_SECS: i64 = 30 * 60;
/// A forced refresh (overlay "Refresh") is honoured only after this many seconds.
pub const FORCE_COOLDOWN_SECS: i64 = 60;

/// Token-free reset summary sent to the frontend.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeResetCredits {
    /// `available`, `none`, `ineligible` or `unavailable`.
    pub status: String,
    pub count: Option<u32>,
    pub grants: Vec<ClaudeResetGrant>,
    pub nearest_expires_at: Option<String>,
    pub reason: Option<String>,
    pub fetched_at: i64,
}

/// One active grant and its remaining reset count, without provider grant identifiers.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeResetGrant {
    pub resets_left: u32,
    pub expires_at: Option<String>,
}

impl ClaudeResetCredits {
    pub fn unavailable(reason: &str, now: DateTime<Utc>) -> Self {
        Self {
            status: "unavailable".to_string(),
            count: None,
            grants: Vec::new(),
            nearest_expires_at: None,
            reason: Some(reason.to_string()),
            fetched_at: now.timestamp(),
        }
    }
}

pub fn should_reuse(cached_fetched_at: i64, now: i64, force: bool) -> bool {
    let age = now - cached_fetched_at;
    if age < 0 {
        return false;
    }
    if force {
        age < FORCE_COOLDOWN_SECS
    } else {
        age < CACHE_TTL_SECS
    }
}

/// A live grant: not paused, `resets_left > 0`, and `ends_at` absent or in the future.
/// Returns its reset count and parsed expiry, or `None` when it should be ignored.
fn live_grant(grant: &Value, now: DateTime<Utc>) -> Option<(u32, Option<(DateTime<Utc>, String)>)> {
    let left = grant.get("resets_left").and_then(Value::as_u64)?;
    if left == 0 || grant.get("paused").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let expiry = match grant.get("ends_at").and_then(Value::as_str) {
        Some(raw) => {
            let ends = DateTime::parse_from_rfc3339(raw).ok()?.with_timezone(&Utc);
            if ends <= now {
                return None;
            }
            Some((ends, raw.to_string()))
        }
        None => None,
    };
    Some((u32::try_from(left).unwrap_or(u32::MAX), expiry))
}

pub fn parse_reset_credits(body: &Value, now: DateTime<Utc>) -> ClaudeResetCredits {
    let Some(ember) = body.get("cedar_ember").filter(|value| value.is_object()) else {
        return ClaudeResetCredits::unavailable("no_reset_data", now);
    };
    if ember.get("eligible").and_then(Value::as_bool) != Some(true) {
        let reason = ember
            .get("ineligible_reason")
            .and_then(Value::as_str)
            .unwrap_or("ineligible");
        return ClaudeResetCredits {
            status: "ineligible".to_string(),
            count: None,
            grants: Vec::new(),
            nearest_expires_at: None,
            reason: Some(reason.to_string()),
            fetched_at: now.timestamp(),
        };
    }

    let mut count: u32 = 0;
    let mut nearest: Option<(DateTime<Utc>, String)> = None;
    let mut active_grants = Vec::new();
    let grants = ember.get("grants").and_then(Value::as_array);
    for (left, expiry) in grants
        .into_iter()
        .flatten()
        .filter_map(|g| live_grant(g, now))
    {
        count = count.saturating_add(left);
        if let Some((ends, raw)) = &expiry {
            if nearest.as_ref().map_or(true, |(current, _)| ends < current) {
                nearest = Some((ends.clone(), raw.clone()));
            }
        }
        active_grants.push(ClaudeResetGrant {
            resets_left: left,
            expires_at: expiry.map(|(_, raw)| raw),
        });
    }

    ClaudeResetCredits {
        status: if count == 0 { "none" } else { "available" }.to_string(),
        count: Some(count),
        grants: active_grants,
        nearest_expires_at: nearest.map(|(_, raw)| raw),
        reason: None,
        fetched_at: now.timestamp(),
    }
}
