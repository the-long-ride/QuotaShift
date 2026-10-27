use std::sync::atomic::{AtomicU64, Ordering};

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
#[derive(Default)]
pub struct RouterUsageTelemetry {
    total_input_tokens: AtomicU64,
    total_output_tokens: AtomicU64,
    total_cached_tokens: AtomicU64,
    total_reasoning_tokens: AtomicU64,
    cache_hit_requests: AtomicU64,
}

impl RouterUsageTelemetry {
    pub fn record(&self, usage: &NormalizedUsage) {
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
