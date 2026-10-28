use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use super::telemetry_store::{PersistedTelemetryStore, RouterTelemetryReport};

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterUsageSnapshot {
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cached_tokens: u64,
    pub total_reasoning_tokens: u64,
    pub cache_hit_requests: u64,
}

/// Thread-safe numeric telemetry counters only; never retains request/response payloads.
pub struct RouterUsageTelemetry {
    total_input_tokens: AtomicU64,
    total_output_tokens: AtomicU64,
    total_cached_tokens: AtomicU64,
    total_reasoning_tokens: AtomicU64,
    cache_hit_requests: AtomicU64,
    store: Mutex<PersistedTelemetryStore>,
}

impl Default for RouterUsageTelemetry {
    fn default() -> Self {
        let initial = PersistedTelemetryStore::load_default();
        Self {
            total_input_tokens: AtomicU64::new(initial.total_input_tokens),
            total_output_tokens: AtomicU64::new(initial.total_output_tokens),
            total_cached_tokens: AtomicU64::new(initial.total_cached_tokens),
            total_reasoning_tokens: AtomicU64::new(initial.total_reasoning_tokens),
            cache_hit_requests: AtomicU64::new(initial.cache_hit_requests),
            store: Mutex::new(initial),
        }
    }
}

impl RouterUsageTelemetry {
    pub fn record(&self, usage: &NormalizedUsage) {
        self.record_for_model(None, usage);
    }

    pub fn record_for_model(&self, model: Option<&str>, usage: &NormalizedUsage) {
        if let Some(v) = usage.input_tokens {
            self.total_input_tokens.fetch_add(v, Ordering::Relaxed);
        }
        if let Some(v) = usage.output_tokens {
            self.total_output_tokens.fetch_add(v, Ordering::Relaxed);
        }
        if let Some(v) = usage.cached_tokens {
            self.total_cached_tokens.fetch_add(v, Ordering::Relaxed);
            if v > 0 {
                self.cache_hit_requests.fetch_add(1, Ordering::Relaxed);
            }
        }
        if let Some(v) = usage.reasoning_tokens {
            self.total_reasoning_tokens.fetch_add(v, Ordering::Relaxed);
        }
        if let Ok(mut guard) = self.store.lock() {
            guard.record(model, usage);
        }
    }

    pub fn snapshot(&self) -> RouterUsageSnapshot {
        RouterUsageSnapshot {
            total_input_tokens: self.total_input_tokens.load(Ordering::Relaxed),
            total_output_tokens: self.total_output_tokens.load(Ordering::Relaxed),
            total_cached_tokens: self.total_cached_tokens.load(Ordering::Relaxed),
            total_reasoning_tokens: self.total_reasoning_tokens.load(Ordering::Relaxed),
            cache_hit_requests: self.cache_hit_requests.load(Ordering::Relaxed),
        }
    }

    pub fn report(&self) -> RouterTelemetryReport {
        self.store
            .lock()
            .map(|guard| guard.to_report())
            .unwrap_or_default()
    }
}

pub fn normalize_usage_event(event: &serde_json::Value) -> NormalizedUsage {
    let empty_map = serde_json::Map::new();
    let target = event
        .pointer("/response/usage")
        .and_then(serde_json::Value::as_object)
        .or_else(|| event.get("usage").and_then(serde_json::Value::as_object))
        .or_else(|| event.as_object())
        .unwrap_or(&empty_map);

    let input_tokens = target
        .get("input_tokens")
        .and_then(serde_json::Value::as_u64);
    let output_tokens = target
        .get("output_tokens")
        .and_then(serde_json::Value::as_u64);

    let cached_tokens = target
        .get("input_tokens_details")
        .and_then(serde_json::Value::as_object)
        .and_then(|details| details.get("cached_tokens"))
        .and_then(serde_json::Value::as_u64);

    let reasoning_tokens = target
        .get("output_tokens_details")
        .and_then(serde_json::Value::as_object)
        .and_then(|details| details.get("reasoning_tokens"))
        .and_then(serde_json::Value::as_u64);

    NormalizedUsage {
        input_tokens,
        output_tokens,
        cached_tokens,
        reasoning_tokens,
    }
}
