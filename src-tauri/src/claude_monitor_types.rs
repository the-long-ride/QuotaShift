use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeRateLimitWindow {
    pub used_percentage: Option<f64>,
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionSnapshot {
    pub session_id: String,
    pub session_name: Option<String>,
    pub model_id: Option<String>,
    pub model_display_name: Option<String>,
    pub claude_code_version: Option<String>,
    pub current_dir: Option<String>,
    pub project_dir: Option<String>,
    pub captured_at_ms: u64,
    pub total_cost_usd: Option<f64>,
    pub total_duration_ms: Option<u64>,
    pub total_api_duration_ms: Option<u64>,
    pub total_input_tokens: Option<u64>,
    pub total_output_tokens: Option<u64>,
    pub context_window_size: Option<u64>,
    pub context_used_percentage: Option<f64>,
    pub context_remaining_percentage: Option<f64>,
    pub current_input_tokens: Option<u64>,
    pub current_output_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
    pub five_hour: Option<ClaudeRateLimitWindow>,
    pub seven_day: Option<ClaudeRateLimitWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ClaudeMonitorSource {
    StatusLine,
    LocalTranscript,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMonitorStatus {
    pub installed: bool,
    pub settings_path: Option<String>,
    pub source: ClaudeMonitorSource,
    pub session: Option<ClaudeSessionSnapshot>,
    pub local_usage: Option<ClaudeObservedUsage>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeObservedUsageWindow {
    pub request_count: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub processed_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeObservedUsage {
    pub five_hour: ClaudeObservedUsageWindow,
    pub seven_day: ClaudeObservedUsageWindow,
    pub captured_at_ms: u64,
}

#[derive(Debug, Clone, Default)]
pub struct LocalTranscriptScan {
    pub latest_main_session: Option<ClaudeSessionSnapshot>,
    pub observed_usage: Option<ClaudeObservedUsage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LocalUsageFields {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ObservedUsageRecord {
    pub timestamp: DateTime<Utc>,
    pub usage: LocalUsageFields,
}
