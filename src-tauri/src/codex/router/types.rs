use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use tokio::sync::{Mutex as AsyncMutex, Notify};

pub const OAUTH_UPSTREAM_BASE: &str = "https://chatgpt.com/backend-api/codex";
pub const API_UPSTREAM_BASE: &str = "https://api.openai.com/v1";

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterQuotaWindow {
    pub remaining_percent: f64,
    pub duration_minutes: Option<f64>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum CodexRouterAuth {
    OAuth {
        access_token: String,
        #[allow(dead_code)]
        refresh_token: Option<String>,
        chatgpt_account_id: String,
    },
    ApiKey {
        api_key: String,
    },
    Siwc {
        registration_id: String,
    },
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterAccount {
    pub id: String,
    pub auth: CodexRouterAuth,
    pub available_model_ids: Option<Vec<String>>,
    pub quota_windows: Vec<RouterQuotaWindow>,
    pub usage_fetched_at: Option<i64>,
    pub model_catalog_fetched_at: Option<i64>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterPool {
    pub id: String,
    pub model: String,
    pub account_ids: Vec<String>,
    pub model_selection_mode: String,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterConfig {
    pub accounts: Vec<CodexRouterAccount>,
    pub pools: Vec<CodexRouterPool>,
    #[serde(default)]
    pub pools_v2: Option<Vec<super::pool_registry::CodexModelPoolV2>>,
    pub applied_account_id: Option<String>,
    pub active_pool_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RouterRouteDecision {
    Health,
    Forward,
    MethodNotAllowed,
    NotFound,
}

#[derive(Clone)]
pub struct RouterUpstreams {
    pub oauth_base: String,
    pub api_base: String,
}

impl Default for RouterUpstreams {
    fn default() -> Self {
        Self {
            oauth_base: OAUTH_UPSTREAM_BASE.to_string(),
            api_base: API_UPSTREAM_BASE.to_string(),
        }
    }
}

pub struct InFlightGuard {
    count: Arc<AtomicU64>,
    notify: Arc<Notify>,
}

impl InFlightGuard {
    pub fn new(count: Arc<AtomicU64>, notify: Arc<Notify>) -> Self {
        count.fetch_add(1, Ordering::SeqCst);
        Self { count, notify }
    }
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        if self.count.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.notify.notify_waiters();
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RetryableFailure {
    Backoff,
    ModelIncompatible,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterStatus {
    pub running: bool,
    pub base_url: Option<String>,
    pub port: Option<u16>,
    pub uptime_secs: Option<u64>,
    pub in_flight_requests: u64,
    pub last_routed_account_id: Option<String>,
    pub last_routed_model: Option<String>,
    pub routed_request_count: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cached_tokens: u64,
    pub total_reasoning_tokens: u64,
    pub cache_hit_requests: u64,
    pub client_coverage: std::collections::HashMap<String, String>,
}

#[derive(Clone)]
pub struct RouterAppState {
    pub config: Arc<AsyncMutex<Option<CodexRouterConfig>>>,
    pub registry: Arc<tokio::sync::RwLock<Arc<super::pool_registry::PoolRegistrySnapshot>>>,
    pub client_bindings: Arc<
        tokio::sync::RwLock<
            std::collections::HashMap<String, super::client_binding::ClientBinding>,
        >,
    >,
    pub budgets: Arc<super::account_budget::AccountBudgetRegistry>,
    pub affinity: Arc<tokio::sync::Mutex<super::affinity::AffinityRegistry>>,
    pub selection_state: Arc<AsyncMutex<super::selection::RouterRuntimeState>>,
    pub in_flight: Arc<AtomicU64>,
    pub in_flight_notify: Arc<Notify>,
    pub client: reqwest::Client,
    pub native_app: Arc<std::sync::RwLock<Option<tauri::AppHandle>>>,
    pub upstreams: RouterUpstreams,
    pub last_routed_account_id: Arc<AsyncMutex<Option<String>>>,
    pub last_routed_model: Arc<AsyncMutex<Option<String>>>,
    pub routed_request_count: Arc<AtomicU64>,
    pub usage_telemetry: Arc<super::usage_metrics::RouterUsageTelemetry>,
    pub router_secret: Arc<str>,
    pub expected_host: Arc<str>,
}
