pub mod auth_guard;
pub mod forward;
pub mod listener;
pub mod routes;
pub mod selection;
pub mod types;

pub use forward::*;
pub use listener::*;
pub use types::*;
#[allow(unused_imports)]
pub(crate) use auth_guard::*;
#[allow(unused_imports)]
pub(crate) use routes::*;
pub(crate) use selection::*;

use axum::Router;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::time::Duration;
use tokio::{
    sync::{oneshot, Mutex as AsyncMutex, Notify},
    task::JoinHandle,
};

#[allow(unused_imports)]
use crate::codex_sync::ROUTER_AUTH_HEADER;

pub const FAILURE_BACKOFF_SECS: u64 = 60;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterStatus {
    pub running: bool,
    pub base_url: Option<String>,
    pub last_routed_account_id: Option<String>,
    pub last_routed_model: Option<String>,
    pub routed_request_count: u64,
    pub client_coverage: HashMap<String, String>,
}

struct ListenerRuntime {
    base_url: String,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
    #[allow(dead_code)]
    secret: Arc<str>,
}

pub struct CodexRouterManager {
    listener: AsyncMutex<Option<ListenerRuntime>>,
    config: Arc<AsyncMutex<Option<CodexRouterConfig>>>,
    selection_state: Arc<AsyncMutex<RouterRuntimeState>>,
    in_flight: Arc<AtomicU64>,
    in_flight_notify: Arc<Notify>,
    client: reqwest::Client,
    upstreams: RouterUpstreams,
    last_routed_account_id: Arc<AsyncMutex<Option<String>>>,
    last_routed_model: Arc<AsyncMutex<Option<String>>>,
    routed_request_count: Arc<AtomicU64>,
    manage_provider_config: bool,
}

impl Default for CodexRouterManager {
    fn default() -> Self {
        Self::new(RouterUpstreams::default(), true)
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
            selection_state: Arc::new(AsyncMutex::new(RouterRuntimeState::default())),
            in_flight: Arc::new(AtomicU64::new(0)),
            in_flight_notify: Arc::new(Notify::new()),
            client: reqwest::Client::new(),
            upstreams,
            last_routed_account_id: Arc::new(AsyncMutex::new(None)),
            last_routed_model: Arc::new(AsyncMutex::new(None)),
            routed_request_count: Arc::new(AtomicU64::new(0)),
            manage_provider_config,
        }
    }

    fn app_state(&self, router_secret: Arc<str>, expected_host: Arc<str>) -> RouterAppState {
        RouterAppState {
            config: self.config.clone(),
            selection_state: self.selection_state.clone(),
            in_flight: self.in_flight.clone(),
            in_flight_notify: self.in_flight_notify.clone(),
            client: self.client.clone(),
            upstreams: self.upstreams.clone(),
            last_routed_account_id: self.last_routed_account_id.clone(),
            last_routed_model: self.last_routed_model.clone(),
            routed_request_count: self.routed_request_count.clone(),
            router_secret,
            expected_host,
        }
    }

    #[cfg(test)]
    pub(crate) async fn listener_secret_for_test(&self) -> String {
        self.listener
            .lock()
            .await
            .as_ref()
            .map(|runtime| runtime.secret.to_string())
            .expect("router listener secret")
    }

    pub async fn start_listener(&self) -> Result<CodexRouterStatus, String> {
        let mut runtime_guard = self.listener.lock().await;
        if runtime_guard.is_some() {
            drop(runtime_guard);
            return Ok(self.status().await);
        }

        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|error| format!("Failed to bind Codex router loopback listener: {error}"))?;
        let address = listener
            .local_addr()
            .map_err(|error| format!("Failed to inspect Codex router listener: {error}"))?;
        if address.ip() != std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST) {
            return Err(format!(
                "Refusing non-loopback Codex router listener: {address}"
            ));
        }

        let base_url = format!("http://127.0.0.1:{}", address.port());
        let expected_host: Arc<str> = Arc::from(format!("127.0.0.1:{}", address.port()));
        let router_secret: Arc<str> = Arc::from(crate::codex_sync::generate_router_secret());
        let app = Router::new()
            .fallback(router_surface)
            .with_state(self.app_state(router_secret.clone(), expected_host));
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        let mut shutdown_tx = Some(shutdown_tx);
        let task = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        let health_url = format!("{base_url}/health");
        let healthy = wait_for_health(&self.client, &health_url).await;

        if !healthy {
            if let Some(shutdown) = shutdown_tx.take() {
                let _ = shutdown.send(());
            }
            let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
            return Err("Codex router listener failed its loopback health check".to_string());
        }

        if self.manage_provider_config {
            if let Err(error) = crate::codex_sync::begin_codex_router_config_with_secret(
                &base_url,
                router_secret.as_ref(),
            ) {
                if let Some(shutdown) = shutdown_tx.take() {
                    let _ = shutdown.send(());
                }
                let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
                return Err(format!(
                    "Failed to enable Codex router provider config: {error}"
                ));
            }
        }

        *runtime_guard = Some(ListenerRuntime {
            base_url: base_url.clone(),
            shutdown: shutdown_tx,
            task,
            secret: router_secret,
        });
        drop(runtime_guard);
        Ok(self.status().await)
    }

    pub async fn stop_listener(&self) -> Result<CodexRouterStatus, String> {
        let runtime = self.listener.lock().await.take();
        let mut task = None;
        if let Some(mut runtime) = runtime {
            if let Some(shutdown) = runtime.shutdown.take() {
                let _ = shutdown.send(());
            }
            task = Some(runtime.task);
        }

        drain_in_flight(
            &self.in_flight,
            &self.in_flight_notify,
            Duration::from_secs(10),
        )
        .await;

        let restore_result = if self.manage_provider_config {
            crate::codex_sync::restore_codex_router_config()
        } else {
            Ok(())
        };

        if let Some(mut task) = task {
            if tokio::time::timeout(Duration::from_secs(2), &mut task)
                .await
                .is_err()
            {
                task.abort();
                let _ = task.await;
            }
        }

        restore_result
            .map_err(|error| format!("Failed to restore Codex provider config: {error}"))?;
        Ok(self.status().await)
    }

    pub async fn configure(&self, config: CodexRouterConfig) {
        let mut config_guard = self.config.lock().await;
        if let Some(previous) = config_guard.as_ref() {
            reconcile_model_incompatibilities(&self.selection_state, previous, &config).await;
        }
        *config_guard = Some(config);
    }

    pub async fn status(&self) -> CodexRouterStatus {
        let base_url = self
            .listener
            .lock()
            .await
            .as_ref()
            .map(|runtime| runtime.base_url.clone());
        CodexRouterStatus {
            running: base_url.is_some(),
            base_url,
            last_routed_account_id: self.last_routed_account_id.lock().await.clone(),
            last_routed_model: self.last_routed_model.lock().await.clone(),
            routed_request_count: self.routed_request_count.load(Ordering::SeqCst),
            client_coverage: HashMap::from([(
                "sharedProvider".to_string(),
                "configured".to_string(),
            )]),
        }
    }
}

#[tauri::command]
pub async fn start_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    manager.start_listener().await
}

#[tauri::command]
pub async fn stop_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    manager.stop_listener().await
}

#[tauri::command]
pub async fn configure_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
    config: CodexRouterConfig,
) -> Result<CodexRouterStatus, String> {
    manager.configure(config).await;
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn get_codex_router_status(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    Ok(manager.status().await)
}

#[cfg(test)]
mod tests;
