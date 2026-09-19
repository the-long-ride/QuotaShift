use crate::claude_monitor::ClaudeRateLimitWindow;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAccount {
    pub id: String,
    pub config_dir: String,
    pub profile_name: String,
    pub subscription_type: Option<String>,
    pub rate_limit_tier: Option<String>,
    pub expires_at: Option<i64>,
    pub expired: Option<bool>,
    pub email: Option<String>,
    pub organization_name: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAccountUsageStatus {
    pub account: ClaudeAccount,
    pub five_hour: Option<ClaudeRateLimitWindow>,
    pub seven_day: Option<ClaudeRateLimitWindow>,
    pub usage_fresh: bool,
    pub usage_fetched_at: Option<i64>,
    #[serde(default)]
    pub active: bool,
    pub suspended: bool,
    pub suspended_process_count: usize,
    pub error: Option<String>,
}
