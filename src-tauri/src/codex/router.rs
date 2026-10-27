#[path = "router/routing/account_budget.rs"]
pub mod account_budget;
#[path = "router/routing/affinity.rs"]
pub mod affinity;
pub mod anthropic;
#[path = "router/transport/auth_guard.rs"]
pub mod auth_guard;
#[path = "router/routing/candidate_ranking.rs"]
pub mod candidate_ranking;
#[path = "router/transport/client_auth.rs"]
pub mod client_auth;
#[path = "router/transport/client_binding.rs"]
pub mod client_binding;
pub mod commands;
#[path = "router/transport/encode.rs"]
pub mod encode;
pub mod forward;
pub mod listener;
pub mod messages_entry;
#[path = "router/routing/pool_registry.rs"]
pub mod pool_registry;
#[path = "router/transport/precommit.rs"]
pub mod precommit;
#[path = "router/transport/response_utils.rs"]
pub mod response_utils;
#[path = "router/transport/responses_transport.rs"]
pub mod responses_transport;
#[path = "router/routing/route_context.rs"]
pub mod route_context;
#[path = "router/routing/route_errors.rs"]
pub mod route_errors;
pub mod routes;
#[path = "router/routing/selection.rs"]
pub mod selection;
pub mod server_controls;
#[path = "router/siwc_bridge/siwc_config.rs"]
pub mod siwc_config;
#[path = "router/siwc_bridge/siwc_forward.rs"]
pub mod siwc_forward;
#[path = "router/siwc_bridge/siwc_request.rs"]
pub mod siwc_request;
#[path = "router/siwc_bridge/siwc_stream.rs"]
pub mod siwc_stream;
pub mod surface;
pub mod telemetry_store;
pub mod types;
pub mod usage_metrics;

#[cfg(test)]
#[path = "router/router_tests/messages_entry_tests.rs"]
mod messages_entry_tests;
#[cfg(test)]
#[path = "router/precommit_tests/precommit_failure_tests.rs"]
mod precommit_failure_tests;
#[cfg(test)]
#[path = "router/precommit_tests/precommit_tests.rs"]
mod precommit_tests;
#[cfg(test)]
#[path = "router/precommit_tests/precommit_unit_tests.rs"]
mod precommit_unit_tests;
#[cfg(test)]
#[path = "router/router_tests/responses_tests.rs"]
pub mod responses_tests;

pub use account_budget::*;
pub use affinity::*;
#[allow(unused_imports)]
pub(crate) use auth_guard::*;
pub use candidate_ranking::*;
pub use client_binding::*;
pub use commands::*;
pub use forward::*;
pub use listener::*;
pub use pool_registry::*;
pub use response_utils::*;
pub use responses_transport::*;
pub use route_context::*;
#[allow(unused_imports)]
pub(crate) use routes::*;
pub(crate) use selection::*;
pub use server_controls::*;
pub use siwc_request::*;
pub use telemetry_store::*;
pub use types::*;
pub use usage_metrics::*;

#[allow(unused_imports)]
pub(crate) use axum::Router;
#[allow(unused_imports)]
pub(crate) use std::time::Duration;

use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use tokio::sync::{oneshot, Mutex as AsyncMutex, Notify};
use tokio::task::JoinHandle;

#[allow(unused_imports)]
use crate::codex_sync::ROUTER_AUTH_HEADER;

pub const FAILURE_BACKOFF_SECS: u64 = 60;

/// Source of persisted Claude gateway bindings, read when the listener starts.
pub(crate) type BindingLoader = fn() -> Result<Vec<ClientBinding>, String>;

fn default_binding_loader() -> BindingLoader {
    if cfg!(test) {
        || Ok(Vec::new())
    } else {
        crate::storage::secure_storage::load_gateway_bindings
    }
}

pub(crate) struct ListenerRuntime {
    pub(crate) base_url: String,
    pub(crate) port: u16,
    pub(crate) started_at: std::time::Instant,
    pub(crate) shutdown: Option<oneshot::Sender<()>>,
    pub(crate) task: JoinHandle<()>,
    pub(crate) secret: Arc<str>,
    /// Bound to a port the user asked for: not random, not a fallback.
    pub(crate) fixed_port: bool,
}

pub struct CodexRouterManager {
    pub(crate) listener: AsyncMutex<Option<ListenerRuntime>>,
    pub(crate) config: Arc<AsyncMutex<Option<CodexRouterConfig>>>,
    pub(crate) registry: Arc<tokio::sync::RwLock<Arc<PoolRegistrySnapshot>>>,
    pub(crate) client_bindings: Arc<tokio::sync::RwLock<HashMap<String, ClientBinding>>>,
    pub(crate) budgets: Arc<AccountBudgetRegistry>,
    pub(crate) affinity: Arc<tokio::sync::Mutex<AffinityRegistry>>,
    pub(crate) selection_state: Arc<AsyncMutex<RouterRuntimeState>>,
    pub(crate) in_flight: Arc<AtomicU64>,
    pub(crate) in_flight_notify: Arc<Notify>,
    pub(crate) client: reqwest::Client,
    pub(crate) native_app: Arc<std::sync::RwLock<Option<tauri::AppHandle>>>,
    pub(crate) upstreams: RouterUpstreams,
    pub(crate) last_routed_account_id: Arc<AsyncMutex<Option<String>>>,
    pub(crate) last_routed_model: Arc<AsyncMutex<Option<String>>>,
    pub(crate) routed_request_count: Arc<AtomicU64>,
    pub(crate) usage_telemetry: Arc<RouterUsageTelemetry>,
    pub(crate) manage_provider_config: bool,
    pub(crate) binding_loader: BindingLoader,
    pub(crate) bindings_restored: std::sync::atomic::AtomicBool,
}

impl Default for CodexRouterManager {
    fn default() -> Self {
        Self::new(RouterUpstreams::default(), false)
    }
}

impl CodexRouterManager {
    #[cfg(test)]
    pub(crate) fn with_upstreams(upstreams: RouterUpstreams) -> Self {
        Self::new(upstreams, false)
    }
    pub fn new(upstreams: RouterUpstreams, manage_provider_config: bool) -> Self {
        Self {
            listener: AsyncMutex::new(None),
            config: Arc::new(AsyncMutex::new(None)),
            registry: Arc::new(tokio::sync::RwLock::new(Arc::default())),
            budgets: Arc::new(AccountBudgetRegistry::new()),
            client_bindings: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            affinity: Arc::new(tokio::sync::Mutex::new(AffinityRegistry::new())),
            selection_state: Arc::new(AsyncMutex::new(RouterRuntimeState::default())),
            in_flight: Arc::new(AtomicU64::new(0)),
            in_flight_notify: Arc::new(Notify::new()),
            client: reqwest::Client::new(),
            native_app: Arc::new(std::sync::RwLock::new(None)),
            upstreams,
            last_routed_account_id: Arc::new(AsyncMutex::new(None)),
            last_routed_model: Arc::new(AsyncMutex::new(None)),
            routed_request_count: Arc::new(AtomicU64::new(0)),
            usage_telemetry: Arc::new(RouterUsageTelemetry::default()),
            manage_provider_config,
            binding_loader: default_binding_loader(),
            bindings_restored: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub(crate) fn app_state(
        &self,
        router_secret: Arc<str>,
        expected_host: Arc<str>,
    ) -> RouterAppState {
        RouterAppState {
            config: self.config.clone(),
            registry: self.registry.clone(),
            client_bindings: self.client_bindings.clone(),
            budgets: self.budgets.clone(),
            affinity: self.affinity.clone(),
            selection_state: self.selection_state.clone(),
            in_flight: self.in_flight.clone(),
            in_flight_notify: self.in_flight_notify.clone(),
            client: self.client.clone(),
            native_app: self.native_app.clone(),
            upstreams: self.upstreams.clone(),
            last_routed_account_id: self.last_routed_account_id.clone(),
            last_routed_model: self.last_routed_model.clone(),
            routed_request_count: self.routed_request_count.clone(),
            usage_telemetry: self.usage_telemetry.clone(),
            router_secret,
            expected_host,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_binding_loader(mut self, loader: BindingLoader) -> Self {
        self.binding_loader = loader;
        self
    }

    pub async fn try_configure(&self, config: CodexRouterConfig) -> Result<(), String> {
        let routes = build_routes_from_config(&config)?;
        // Lock order: account config first, registry second. Readers take them in the same
        // order so they can never pair accounts from one revision with a different route map.
        let mut config_guard = self.config.lock().await;
        if let Some(previous) = config_guard.as_ref() {
            reconcile_model_incompatibilities(&self.selection_state, previous, &config).await;
        }
        let mut registry_guard = self.registry.write().await;
        let next_revision = registry_guard.revision + 1;
        *registry_guard = Arc::new(PoolRegistrySnapshot {
            revision: next_revision,
            routes,
        });
        *config_guard = Some(config);
        Ok(())
    }

    pub async fn configure(&self, config: CodexRouterConfig) {
        let _ = self.try_configure(config).await;
    }
    pub async fn status(&self) -> CodexRouterStatus {
        let (base_url, port, uptime_secs) =
            self.listener
                .lock()
                .await
                .as_ref()
                .map_or((None, None, None), |rt| {
                    (
                        Some(rt.base_url.clone()),
                        Some(rt.port),
                        Some(rt.started_at.elapsed().as_secs()),
                    )
                });
        let usage = self.usage_telemetry.snapshot();
        CodexRouterStatus {
            running: base_url.is_some(),
            base_url,
            port,
            uptime_secs,
            in_flight_requests: self.in_flight.load(Ordering::SeqCst),
            last_routed_account_id: self.last_routed_account_id.lock().await.clone(),
            last_routed_model: self.last_routed_model.lock().await.clone(),
            routed_request_count: self.routed_request_count.load(Ordering::SeqCst),
            total_input_tokens: usage.total_input_tokens,
            total_output_tokens: usage.total_output_tokens,
            total_cached_tokens: usage.total_cached_tokens,
            total_reasoning_tokens: usage.total_reasoning_tokens,
            cache_hit_requests: usage.cache_hit_requests,
            client_coverage: HashMap::from([(
                "sharedProvider".to_string(),
                "configured".to_string(),
            )]),
        }
    }
}

#[cfg(test)]
#[path = "router/router_tests/tests.rs"]
mod tests;
