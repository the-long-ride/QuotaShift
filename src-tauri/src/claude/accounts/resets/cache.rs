use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::client::FetchResetsError;
use super::parse::{prune_expired_grants, ClaudeResetCredits, ClaudeResetCreditsOutcome};
use super::CachedResetCredits;
use crate::system::retry_after::{effective_retry_after, record_429_backoff};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ClaudeResetDiskCache {
    #[serde(default)]
    pub(crate) provider_circuit_until: Option<i64>,
    #[serde(default)]
    pub(crate) entries: HashMap<String, CachedResetCredits>,
}

fn is_valid_credits(credits: &ClaudeResetCredits) -> bool {
    credits.status == "available" || credits.status == "none"
}

pub(crate) fn build_cached_outcome(
    entry: &CachedResetCredits,
    circuit_until: Option<i64>,
    now: DateTime<Utc>,
    desktop_fallback: Option<ClaudeResetCredits>,
) -> ClaudeResetCreditsOutcome {
    let now_ts = now.timestamp();
    let in_429 = entry.retry_after_at.is_some_and(|u| u > now_ts)
        || circuit_until.is_some_and(|u| u > now_ts);
    let credits = if in_429 {
        if let Some(fallback) = desktop_fallback {
            fallback
        } else {
            let until = effective_retry_after(entry.retry_after_at, circuit_until, now_ts);
            let reason = entry.credits.reason.as_deref().unwrap_or("circuit_breaker");
            entry
                .last_valid
                .as_ref()
                .map(|valid| valid.with_stale(now, reason, until))
                .unwrap_or_else(|| {
                    let mut c = entry.credits.clone();
                    c.retry_after_at = until;
                    c
                })
        }
    } else {
        prune_expired_grants(&entry.credits, now)
    };
    ClaudeResetCreditsOutcome {
        credits,
        five_hour: entry.five_hour.clone(),
        seven_day: entry.seven_day.clone(),
    }
}

pub(crate) fn record_remote_outcome(
    store: &mut ClaudeResetDiskCache,
    key: &str,
    current_mtime: Option<u64>,
    now: DateTime<Utc>,
    remote: Result<ClaudeResetCreditsOutcome, FetchResetsError>,
    desktop_fallback: Option<ClaudeResetCredits>,
) -> ClaudeResetCreditsOutcome {
    let prev = store.entries.get(key).cloned();
    let prev_valid = prev.as_ref().and_then(|e| {
        e.last_valid
            .clone()
            .or_else(|| is_valid_credits(&e.credits).then(|| e.credits.clone()))
    });

    let (credits, five_hour, seven_day, retry_after_at, consecutive_429s, last_valid) = match remote
    {
        Ok(outcome) => {
            let result = outcome.credits;
            let chosen = if result.status == "ineligible" || result.status == "unavailable" {
                desktop_fallback.unwrap_or(result)
            } else {
                result
            };
            let valid = if is_valid_credits(&chosen) {
                Some(chosen.clone())
            } else {
                prev_valid
            };
            (chosen, outcome.five_hour, outcome.seven_day, None, 0, valid)
        }
        Err(err) => {
            let is_429 = err.status == Some(429);
            let (streak, until) = if is_429 {
                let (next_streak, acct_until, circ_until) = record_429_backoff(
                    prev.as_ref().map_or(0, |e| e.consecutive_429s),
                    err.retry_after.as_deref(),
                    now,
                );
                store.provider_circuit_until = Some(circ_until);
                (next_streak, Some(acct_until))
            } else {
                (prev.as_ref().map_or(0, |e| e.consecutive_429s), None)
            };
            let chosen = if let Some(fallback) = desktop_fallback {
                fallback
            } else if let Some(ref valid) = prev_valid {
                valid.with_stale(now, &err.reason, until)
            } else {
                let mut u = ClaudeResetCredits::unavailable(&err.reason, now);
                u.retry_after_at = until;
                u
            };
            let valid = if is_valid_credits(&chosen) && !chosen.stale {
                Some(chosen.clone())
            } else {
                prev_valid
            };
            let fh = prev.as_ref().and_then(|e| e.five_hour.clone());
            let sd = prev.as_ref().and_then(|e| e.seven_day.clone());
            (chosen, fh, sd, until, streak, valid)
        }
    };

    store.entries.insert(
        key.to_string(),
        CachedResetCredits {
            credits: credits.clone(),
            credentials_mtime: current_mtime,
            last_valid,
            retry_after_at,
            consecutive_429s,
            five_hour: five_hour.clone(),
            seven_day: seven_day.clone(),
        },
    );
    ClaudeResetCreditsOutcome {
        credits,
        five_hour,
        seven_day,
    }
}
