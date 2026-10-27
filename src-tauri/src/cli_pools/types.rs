use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CliProvider {
    Agy,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum QuotaWindowKind {
    #[serde(rename = "5h")]
    FiveHour,
    #[serde(rename = "weekly")]
    Weekly,
    #[serde(rename = "monthly")]
    Monthly,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRotationPoolV1 {
    pub id: String,
    pub provider: CliProvider,
    pub name: String,
    pub account_ids: Vec<String>,
    pub enabled: bool,
    pub auto_switch: bool,
    pub trigger_windows: Vec<QuotaWindowKind>,
    pub fallback_latest_enabled: bool,
    pub switch_when_idle_only: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRotationBindingsV1 {
    pub agy_active_pool_id: Option<String>,
    pub codex_active_pool_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRotationPreferencesV1 {
    pub enabled: bool,
    pub continuation_prompt: String,
    pub required_fresh_samples: u8,
    pub min_sample_separation_secs: u64,
    pub graceful_wait_secs: u64,
    pub auto_restart_after_app_start: bool,
}

impl Default for CliRotationPreferencesV1 {
    fn default() -> Self {
        Self {
            enabled: false,
            continuation_prompt: "continue remaining works".to_string(),
            required_fresh_samples: 2,
            min_sample_separation_secs: 5,
            graceful_wait_secs: 15,
            auto_restart_after_app_start: false,
        }
    }
}
