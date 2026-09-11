use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::types::{AntigravityModelFamily, AntigravityModelQuota};

pub mod window;
pub use window::*;

pub mod normalize;
pub use normalize::*;

#[derive(Debug, Clone, Default)]
struct LaneAggregate {
    selected_fraction: Option<f64>,
    selected_reset: Option<String>,
    contributors: usize,
    all_disabled: bool,
}

impl LaneAggregate {
    fn consider(&mut self, bucket: &NormalizedQuotaBucket) {
        self.contributors += 1;
        if self.contributors == 1 {
            self.all_disabled = bucket.disabled;
        } else {
            self.all_disabled &= bucket.disabled;
        }

        let replace = match self.selected_fraction {
            None => true,
            Some(existing) if bucket.remaining_fraction < existing => true,
            Some(existing) if (bucket.remaining_fraction - existing).abs() < f64::EPSILON => {
                reset_is_earlier(bucket.reset_time.as_deref(), self.selected_reset.as_deref())
            }
            _ => false,
        };

        if replace {
            self.selected_fraction = Some(bucket.remaining_fraction);
            self.selected_reset = bucket.reset_time.clone();
        }
    }

    fn percent(&self) -> Option<u32> {
        self.selected_fraction
            .map(|fraction| (fraction.clamp(0.0, 1.0) * 100.0).round() as u32)
    }

    fn disabled(&self) -> Option<bool> {
        (self.contributors > 0).then_some(self.all_disabled)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct AntigravityQuotaAggregation {
    pub quotas: Vec<AntigravityModelQuota>,
    pub diagnostics: Vec<String>,
}

fn aggregate_lane<'a>(buckets: impl Iterator<Item = &'a NormalizedQuotaBucket>) -> LaneAggregate {
    let mut aggregate = LaneAggregate::default();
    for bucket in buckets {
        aggregate.consider(bucket);
    }
    aggregate
}

fn family_name(family: QuotaFamily) -> (&'static str, &'static str, AntigravityModelFamily) {
    match family {
        QuotaFamily::Gemini => (
            "gemini_pool",
            "Gemini Models",
            AntigravityModelFamily::Gemini,
        ),
        QuotaFamily::ClaudeGpt => (
            "claude_gpt_pool",
            "Claude & OpenAI Models",
            AntigravityModelFamily::Claude,
        ),
    }
}

fn build_pool(
    family: QuotaFamily,
    five_hour: LaneAggregate,
    weekly: LaneAggregate,
) -> AntigravityModelQuota {
    let (model_id, display_name, public_family) = family_name(family);
    let alias_fraction = five_hour
        .selected_fraction
        .or(weekly.selected_fraction)
        .unwrap_or(0.0);
    let alias_reset = five_hour
        .selected_reset
        .clone()
        .or_else(|| weekly.selected_reset.clone());
    let five_hour_percent = five_hour.percent();
    let five_hour_disabled = five_hour.disabled();
    let weekly_percent = weekly.percent();
    let weekly_disabled = weekly.disabled();

    AntigravityModelQuota {
        model_id: model_id.to_string(),
        display_name: display_name.to_string(),
        family: public_family,
        remaining_fraction: alias_fraction,
        remaining_percent: (alias_fraction * 100.0).round() as u32,
        reset_at: alias_reset,
        five_hour_percent,
        five_hour_reset: five_hour.selected_reset,
        five_hour_disabled,
        weekly_percent,
        weekly_reset: weekly.selected_reset,
        weekly_disabled,
    }
}

pub(crate) fn aggregate_antigravity_quotas(
    available_models: Option<&Value>,
    user_quota: Option<&Value>,
    observed_at: DateTime<Utc>,
) -> AntigravityQuotaAggregation {
    let mut diagnostics = Vec::new();
    let available = available_models
        .map(|value| normalize_available_models(value, &observed_at, &mut diagnostics))
        .unwrap_or_default();
    let user = user_quota
        .map(|value| normalize_user_quota(value, &observed_at, &mut diagnostics))
        .unwrap_or_default();

    let mut quotas = Vec::new();
    for family in [QuotaFamily::Gemini, QuotaFamily::ClaudeGpt] {
        let family_present = available.iter().any(|bucket| bucket.family == family)
            || user.iter().any(|bucket| bucket.family == family);
        if !family_present {
            continue;
        }

        let mut five_hour =
            aggregate_lane(user.iter().filter(|bucket| {
                bucket.family == family && bucket.window == QuotaWindow::FiveHour
            }));
        let weekly = aggregate_lane(
            user.iter()
                .filter(|bucket| bucket.family == family && bucket.window == QuotaWindow::Weekly),
        );

        let unknown: Vec<_> = user
            .iter()
            .filter(|bucket| bucket.family == family && bucket.window == QuotaWindow::Unknown)
            .collect();
        if !unknown.is_empty() {
            if five_hour.contributors == 0 {
                five_hour = aggregate_lane(unknown.iter().copied());
            }
            diagnostics.push(format!(
                "{} had {} unlabeled retrieveUserQuota bucket(s); applied only to the current/five-hour lane",
                family_name(family).1,
                unknown.len()
            ));
        }

        if five_hour.contributors == 0 {
            five_hour = aggregate_lane(available.iter().filter(|bucket| {
                bucket.family == family && bucket.source == QuotaSource::AvailableModels
            }));
            if five_hour.contributors > 0 {
                diagnostics.push(format!(
                    "{} five-hour lane filled from fetchAvailableModels",
                    family_name(family).1
                ));
            }
        }

        if weekly.contributors == 0 {
            let unknown_count = user
                .iter()
                .filter(|bucket| bucket.family == family && bucket.window == QuotaWindow::Unknown)
                .count();
            diagnostics.push(if unknown_count > 0 {
                format!(
                    "{} weekly unavailable: {} quota bucket(s) had unrecognized window metadata",
                    family_name(family).1,
                    unknown_count
                )
            } else {
                format!(
                    "{} weekly unavailable: no weekly bucket returned",
                    family_name(family).1
                )
            });
        }

        quotas.push(build_pool(family, five_hour, weekly));
    }

    AntigravityQuotaAggregation {
        quotas,
        diagnostics,
    }
}

#[cfg(test)]
mod tests;
