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
    pub five_hour_percent: Option<u32>,
    #[serde(rename = "fiveHourReset")]
    pub five_hour_reset: Option<String>,
    #[serde(rename = "fiveHourDisabled")]
    pub five_hour_disabled: Option<bool>,
    #[serde(rename = "weeklyPercent")]
    pub weekly_percent: Option<u32>,
    #[serde(rename = "weeklyReset")]
    pub weekly_reset: Option<String>,
    #[serde(rename = "weeklyDisabled")]
    pub weekly_disabled: Option<bool>,
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AntigravityQuotaSource {
    AppLocal,
    AgyLocal,
    IdeLocal,
    OauthRemote,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AntigravityQuotaAccuracy {
    ExactGrouped,
    SessionOnly,
    ModelOnly,
    Unavailable,
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
    pub online: bool,
    pub source: Option<AntigravityQuotaSource>,
    pub accuracy: Option<AntigravityQuotaAccuracy>,
}

pub struct AppState {
    pub last_status: Option<FullStatus>,
    pub monitored_model: Option<String>,
    pub monitored_codex: Option<CodexMonitoredInfo>,
    pub poll_interval_secs: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AntigravityModelFamily {
    Gemini,
    Claude,
    OpenAi,
    Other,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityModelQuota {
    pub model_id: String,
    pub display_name: String,
    pub family: AntigravityModelFamily,
    pub remaining_fraction: f64,
    pub remaining_percent: u32,
    pub reset_at: Option<String>,
    pub five_hour_percent: Option<u32>,
    pub five_hour_reset: Option<String>,
    pub five_hour_disabled: Option<bool>,
    pub weekly_percent: Option<u32>,
    pub weekly_reset: Option<String>,
    pub weekly_disabled: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AntigravityUsageSource {
    CloudCode,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AntigravityUsageWarning {
    ProjectUnavailable,
    PlanUnavailable,
    SomeModelsSkipped,
    NoQuotaModelsReturned,
    UnverifiedFullQuotaResponse,
    WeeklyQuotaUnavailable,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityRefreshedTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub auth_method: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityAccountUsage {
    pub plan_tier: Option<String>,
    pub quotas: Vec<AntigravityModelQuota>,
    pub source: AntigravityUsageSource,
    pub fetched_at: String,
    pub warnings: Vec<AntigravityUsageWarning>,
    pub refreshed_tokens: Option<AntigravityRefreshedTokens>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityUsageCommandError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}
