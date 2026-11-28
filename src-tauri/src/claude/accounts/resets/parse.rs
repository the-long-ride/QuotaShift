use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::claude::monitor::ClaudeRateLimitWindow;

/// One request per account per 3 hours.
pub const CACHE_TTL_SECS: i64 = 3 * 60 * 60;
/// A forced refresh (overlay "Refresh") is honoured only after this many seconds.
pub const FORCE_COOLDOWN_SECS: i64 = 60;

/// Token-free reset summary sent to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeResetCredits {
    /// `available`, `none`, `ineligible` or `unavailable`.
    pub status: String,
    pub count: Option<u32>,
    pub grants: Vec<ClaudeResetGrant>,
    pub nearest_expires_at: Option<String>,
    pub reason: Option<String>,
    pub fetched_at: i64,
    #[serde(default)]
    pub stale: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_after_at: Option<i64>,
}

/// One active grant and its remaining reset count, without provider grant identifiers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeResetGrant {
    pub resets_left: u32,
    pub expires_at: Option<String>,
}

/// Reset credits plus piggybacked 5h/7d rate-limit windows from `/api/oauth/usage`.
#[derive(Debug, Clone, PartialEq)]
pub struct ClaudeResetCreditsOutcome {
    pub credits: ClaudeResetCredits,
    pub five_hour: Option<ClaudeRateLimitWindow>,
    pub seven_day: Option<ClaudeRateLimitWindow>,
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
            stale: false,
            retry_after_at: None,
        }
    }

    pub fn with_stale(
        &self,
        now: DateTime<Utc>,
        reason: &str,
        retry_after_at: Option<i64>,
    ) -> Self {
        let mut pruned = prune_expired_grants(self, now);
        pruned.stale = true;
        pruned.reason = Some(reason.to_string());
        pruned.retry_after_at = retry_after_at;
        pruned
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

pub fn has_expired_grant(credits: &ClaudeResetCredits, now: DateTime<Utc>) -> bool {
    credits.grants.iter().any(|grant| {
        grant
            .expires_at
            .as_deref()
            .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
            .is_some_and(|dt| dt.with_timezone(&Utc) <= now)
    })
}

pub fn prune_expired_grants(
    credits: &ClaudeResetCredits,
    now: DateTime<Utc>,
) -> ClaudeResetCredits {
    if credits.status != "available" && credits.status != "none" {
        return credits.clone();
    }
    let mut count: u32 = 0;
    let mut nearest: Option<(DateTime<Utc>, String)> = None;
    let mut live = Vec::with_capacity(credits.grants.len());
    for grant in &credits.grants {
        if grant.resets_left == 0 {
            continue;
        }
        if let Some(raw) = &grant.expires_at {
            if let Ok(ends) = DateTime::parse_from_rfc3339(raw) {
                let utc = ends.with_timezone(&Utc);
                if utc <= now {
                    continue;
                }
                if nearest.as_ref().map_or(true, |(cur, _)| utc < *cur) {
                    nearest = Some((utc, raw.clone()));
                }
            }
        }
        count = count.saturating_add(grant.resets_left);
        live.push(grant.clone());
    }
    let final_count = if credits.grants.is_empty() {
        credits.count.unwrap_or(0)
    } else {
        count
    };
    ClaudeResetCredits {
        status: if final_count == 0 {
            "none"
        } else {
            "available"
        }
        .to_string(),
        count: Some(final_count),
        grants: live,
        nearest_expires_at: nearest.map(|(_, raw)| raw),
        reason: credits.reason.clone(),
        fetched_at: credits.fetched_at,
        stale: credits.stale,
        retry_after_at: credits.retry_after_at,
    }
}

pub fn parse_usage_window(value: Option<&Value>) -> Option<ClaudeRateLimitWindow> {
    let obj = value?.as_object()?;
    let used_percentage = obj
        .get("utilization")
        .or_else(|| obj.get("used_percentage"))
        .and_then(Value::as_f64);
    let resets_at = obj.get("resets_at").and_then(|v| {
        v.as_i64().or_else(|| {
            v.as_str()
                .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
                .map(|dt| dt.timestamp())
        })
    });
    if used_percentage.is_none() && resets_at.is_none() {
        return None;
    }
    Some(ClaudeRateLimitWindow {
        used_percentage,
        resets_at,
    })
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
    if let Some(start) = grant.get("starts_at").and_then(Value::as_str) {
        let starts = DateTime::parse_from_rfc3339(start)
            .ok()?
            .with_timezone(&Utc);
        if starts > now {
            return None;
        }
    }
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
            stale: false,
            retry_after_at: None,
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
        stale: false,
        retry_after_at: None,
    }
}

pub fn parse_reset_credits_outcome(body: &Value, now: DateTime<Utc>) -> ClaudeResetCreditsOutcome {
    ClaudeResetCreditsOutcome {
        credits: parse_reset_credits(body, now),
        five_hour: parse_usage_window(body.get("five_hour")),
        seven_day: parse_usage_window(body.get("seven_day")),
    }
}
