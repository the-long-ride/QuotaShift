use super::types::QuotaWindowKind;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuotaStatus {
    Exhausted,
    Available,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSample {
    pub account_id: String,
    pub window: QuotaWindowKind,
    pub used_percent: Option<f64>,
    pub remaining_percent: Option<f64>,
    pub reset_at: Option<u64>,
    pub sampled_at: u64,
    pub explicit_quota_exhausted: bool,
    pub is_transient_error: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmedQuotaKey {
    pub account_id: String,
    pub window: QuotaWindowKind,
    pub reset_epoch: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaEvidence {
    pub status: QuotaStatus,
    pub triggered_window: Option<QuotaWindowKind>,
    pub reset_epoch: Option<u64>,
    pub sanitized_reason: String,
    pub samples_count: usize,
    pub last_sample_at: u64,
}

#[derive(Debug, Default, Clone)]
pub struct QuotaDeduplicator {
    processed: HashSet<ConfirmedQuotaKey>,
}

impl QuotaDeduplicator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_and_check(&mut self, key: ConfirmedQuotaKey) -> bool {
        self.processed.insert(key)
    }

    pub fn prune(&mut self, now: u64) {
        self.processed.retain(|k| match k.reset_epoch {
            Some(epoch) => epoch > now,
            None => true,
        });
    }
}

fn is_fresh(sampled_at: u64, now: u64, ttl: u64) -> bool {
    sampled_at <= now && now.saturating_sub(sampled_at) <= ttl
}

fn sample_status(sample: &WindowSample, now: u64) -> QuotaStatus {
    if sample.is_transient_error || sample.reset_at.is_some_and(|reset| reset <= now) {
        return QuotaStatus::Unknown;
    }
    if sample.explicit_quota_exhausted {
        return QuotaStatus::Exhausted;
    }
    if [sample.used_percent, sample.remaining_percent]
        .into_iter()
        .flatten()
        .any(|percent| !percent.is_finite() || !(0.0..=100.0).contains(&percent))
    {
        return QuotaStatus::Unknown;
    }
    let used_exhausted = sample.used_percent.map(|used| used == 100.0);
    let remaining_exhausted = sample.remaining_percent.map(|remaining| remaining == 0.0);
    match (used_exhausted, remaining_exhausted) {
        (Some(true), Some(false)) | (Some(false), Some(true)) | (None, None) => {
            QuotaStatus::Unknown
        }
        (Some(true), _) | (_, Some(true)) => QuotaStatus::Exhausted,
        _ => QuotaStatus::Available,
    }
}

pub fn evaluate_exhaustion(
    account_id: &str,
    trigger_windows: &[QuotaWindowKind],
    samples: &[WindowSample],
    now: u64,
    freshness_ttl_secs: u64,
    min_sample_separation_secs: u64,
    required_samples: usize,
) -> QuotaEvidence {
    let mut last_sample_at = 0;

    let mut all_available = !trigger_windows.is_empty();
    for window in trigger_windows {
        let mut relevant: Vec<_> = samples
            .iter()
            .filter(|sample| {
                sample.account_id == account_id
                    && sample.window == *window
                    && is_fresh(sample.sampled_at, now, freshness_ttl_secs)
            })
            .collect();
        relevant.sort_by_key(|sample| sample.sampled_at);
        let Some(latest) = relevant.last() else {
            all_available = false;
            continue;
        };
        last_sample_at = last_sample_at.max(latest.sampled_at);
        let latest_status = sample_status(latest, now);
        all_available &= latest_status == QuotaStatus::Available;
        if latest_status != QuotaStatus::Exhausted {
            continue;
        }
        // Only consecutive evidence from the current reset epoch can confirm a handoff.
        let mut confirmed_at = latest.sampled_at;
        let mut count = 1;
        for sample in relevant.iter().rev().skip(1) {
            if sample.reset_at != latest.reset_at
                || sample_status(sample, now) != QuotaStatus::Exhausted
            {
                break;
            }
            if confirmed_at.saturating_sub(sample.sampled_at) >= min_sample_separation_secs.max(5) {
                count += 1;
                confirmed_at = sample.sampled_at;
            }
        }
        if latest.explicit_quota_exhausted || count >= required_samples.max(2) {
            return QuotaEvidence {
                status: QuotaStatus::Exhausted,
                triggered_window: Some(*window),
                reset_epoch: latest.reset_at,
                sanitized_reason: format!("Confirmed quota exhaustion for {:?}", window),
                samples_count: count,
                last_sample_at: latest.sampled_at,
            };
        }
    }
    QuotaEvidence {
        status: if all_available {
            QuotaStatus::Available
        } else {
            QuotaStatus::Unknown
        },
        triggered_window: None,
        reset_epoch: None,
        sanitized_reason: if all_available {
            "All monitored quota windows within operating limits"
        } else {
            "Insufficient fresh quota telemetry"
        }
        .to_string(),
        samples_count: samples.len(),
        last_sample_at,
    }
}

#[cfg(test)]
mod tests;
