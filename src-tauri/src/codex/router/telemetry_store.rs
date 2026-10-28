use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use super::usage_metrics::NormalizedUsage;

const MAX_HOURLY_BUCKETS: usize = 90 * 24;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageTotals {
    pub model: String,
    pub requests: u64,
    pub cache_hit_requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
}

impl ModelUsageTotals {
    pub fn add(&mut self, usage: &NormalizedUsage) {
        self.requests = self.requests.saturating_add(1);
        let input = usage.input_tokens.unwrap_or(0);
        let output = usage.output_tokens.unwrap_or(0);
        let cached = usage.cached_tokens.unwrap_or(0);
        let reasoning = usage.reasoning_tokens.unwrap_or(0);
        self.input_tokens = self.input_tokens.saturating_add(input);
        self.output_tokens = self.output_tokens.saturating_add(output);
        self.cached_tokens = self.cached_tokens.saturating_add(cached);
        self.reasoning_tokens = self.reasoning_tokens.saturating_add(reasoning);
        if cached > 0 {
            self.cache_hit_requests = self.cache_hit_requests.saturating_add(1);
        }
    }

    pub fn total_tokens(&self) -> u64 {
        self.input_tokens.saturating_add(self.output_tokens)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryBucket {
    pub timestamp: i64,
    pub requests: u64,
    pub cache_hit_requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    #[serde(default)]
    pub by_model: BTreeMap<String, ModelUsageTotals>,
}

impl TelemetryBucket {
    pub fn record(&mut self, model_name: &str, usage: &NormalizedUsage) {
        self.requests = self.requests.saturating_add(1);
        let input = usage.input_tokens.unwrap_or(0);
        let output = usage.output_tokens.unwrap_or(0);
        let cached = usage.cached_tokens.unwrap_or(0);
        let reasoning = usage.reasoning_tokens.unwrap_or(0);
        self.input_tokens = self.input_tokens.saturating_add(input);
        self.output_tokens = self.output_tokens.saturating_add(output);
        self.cached_tokens = self.cached_tokens.saturating_add(cached);
        self.reasoning_tokens = self.reasoning_tokens.saturating_add(reasoning);
        if cached > 0 {
            self.cache_hit_requests = self.cache_hit_requests.saturating_add(1);
        }
        let entry = self
            .by_model
            .entry(model_name.to_string())
            .or_insert_with(|| ModelUsageTotals {
                model: model_name.to_string(),
                ..Default::default()
            });
        entry.add(usage);
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTelemetryStore {
    pub total_requests: u64,
    pub cache_hit_requests: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cached_tokens: u64,
    pub total_reasoning_tokens: u64,
    #[serde(default)]
    pub hourly_buckets: BTreeMap<i64, TelemetryBucket>,
    #[serde(default)]
    pub by_model: BTreeMap<String, ModelUsageTotals>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterTelemetryReport {
    pub generated_at: i64,
    pub total_requests: u64,
    pub cache_hit_requests: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cached_tokens: u64,
    pub total_reasoning_tokens: u64,
    pub hourly_buckets: Vec<TelemetryBucket>,
    pub by_model: Vec<ModelUsageTotals>,
}

fn current_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn hour_bucket_ts(unix_secs: i64) -> i64 {
    unix_secs - unix_secs.rem_euclid(3600)
}

fn telemetry_file_path() -> Option<PathBuf> {
    if cfg!(test) {
        return None;
    }
    let dir = dirs::data_local_dir()?.join("QuotaShift");
    Some(dir.join("router-usage-telemetry-v1.json"))
}

impl PersistedTelemetryStore {
    pub fn load_default() -> Self {
        let Some(path) = telemetry_file_path() else {
            return Self::default();
        };
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save_default(&self) {
        let Some(path) = telemetry_file_path() else {
            return;
        };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(self) {
            let _ = std::fs::write(path, json);
        }
    }

    pub fn record_at(&mut self, unix_secs: i64, model: Option<&str>, usage: &NormalizedUsage) {
        let model_name = model
            .map(str::trim)
            .filter(|m| !m.is_empty())
            .unwrap_or("default");
        let input = usage.input_tokens.unwrap_or(0);
        let output = usage.output_tokens.unwrap_or(0);
        let cached = usage.cached_tokens.unwrap_or(0);
        let reasoning = usage.reasoning_tokens.unwrap_or(0);

        self.total_requests = self.total_requests.saturating_add(1);
        self.total_input_tokens = self.total_input_tokens.saturating_add(input);
        self.total_output_tokens = self.total_output_tokens.saturating_add(output);
        self.total_cached_tokens = self.total_cached_tokens.saturating_add(cached);
        self.total_reasoning_tokens = self.total_reasoning_tokens.saturating_add(reasoning);
        if cached > 0 {
            self.cache_hit_requests = self.cache_hit_requests.saturating_add(1);
        }

        let bucket_ts = hour_bucket_ts(unix_secs);
        let bucket = self
            .hourly_buckets
            .entry(bucket_ts)
            .or_insert_with(|| TelemetryBucket {
                timestamp: bucket_ts,
                ..Default::default()
            });
        bucket.record(model_name, usage);

        while self.hourly_buckets.len() > MAX_HOURLY_BUCKETS {
            if let Some(&oldest_key) = self.hourly_buckets.keys().next() {
                self.hourly_buckets.remove(&oldest_key);
            } else {
                break;
            }
        }

        let model_entry = self
            .by_model
            .entry(model_name.to_string())
            .or_insert_with(|| ModelUsageTotals {
                model: model_name.to_string(),
                ..Default::default()
            });
        model_entry.add(usage);
    }

    pub fn record(&mut self, model: Option<&str>, usage: &NormalizedUsage) {
        self.record_at(current_unix_secs(), model, usage);
        self.save_default();
    }

    pub fn to_report(&self) -> RouterTelemetryReport {
        let mut by_model: Vec<ModelUsageTotals> = self.by_model.values().cloned().collect();
        by_model.sort_by(|a, b| {
            b.total_tokens()
                .cmp(&a.total_tokens())
                .then_with(|| a.model.cmp(&b.model))
        });
        RouterTelemetryReport {
            generated_at: current_unix_secs(),
            total_requests: self.total_requests,
            cache_hit_requests: self.cache_hit_requests,
            total_input_tokens: self.total_input_tokens,
            total_output_tokens: self.total_output_tokens,
            total_cached_tokens: self.total_cached_tokens,
            total_reasoning_tokens: self.total_reasoning_tokens,
            hourly_buckets: self.hourly_buckets.values().cloned().collect(),
            by_model,
        }
    }
}
