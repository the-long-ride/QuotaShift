#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CreditInfo {
    pub balance: f64,
    #[serde(rename = "creditType")]
    pub credit_type: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct QuotaData {
    pub model: String,
    pub percent: u32,
    #[serde(rename = "refreshTime")]
    pub refresh_time: String,
    #[serde(rename = "fiveHourPercent")]
    pub five_hour_percent: u32,
    #[serde(rename = "fiveHourReset")]
    pub five_hour_reset: String,
    #[serde(rename = "fiveHourDisabled")]
    pub five_hour_disabled: bool,
    #[serde(rename = "weeklyPercent")]
    pub weekly_percent: u32,
    #[serde(rename = "weeklyReset")]
    pub weekly_reset: String,
    #[serde(rename = "weeklyDisabled")]
    pub weekly_disabled: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CodexMonitoredInfo {
    #[serde(rename = "accountId")]
    pub account_id: String,
    pub label: String,
    #[serde(rename = "primaryPercent")]
    pub primary_percent: Option<u32>,
    #[serde(rename = "primaryLabel")]
    pub primary_label: String,
    #[serde(rename = "secondaryPercent")]
    pub secondary_percent: Option<u32>,
    #[serde(rename = "secondaryLabel")]
    pub secondary_label: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FullStatus {
    pub credits: Option<CreditInfo>,
    pub quotas: Vec<QuotaData>,
    #[serde(rename = "planTier")]
    pub plan_tier: Option<String>,
    #[serde(rename = "recentlyUsedModel")]
    pub recently_used_model: Option<String>,
    #[serde(rename = "monitoredCodex")]
    pub monitored_codex: Option<CodexMonitoredInfo>,
    pub email: Option<String>,
}

pub struct AppState {
    pub cached_pid: Option<u32>,
    pub cached_token: Option<String>,
    pub cached_port: Option<u16>,
    pub last_status: Option<FullStatus>,
    pub monitored_model: Option<String>,
    pub monitored_codex: Option<CodexMonitoredInfo>,
    pub poll_interval_secs: u64,
}
