use axum::Router;
use std::collections::HashSet;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tokio::sync::{oneshot, Mutex as AsyncMutex, Notify};

use super::selection::RouterRuntimeState;
use super::surface::router_surface;
use super::types::CodexRouterConfig;
use super::{CodexRouterManager, CodexRouterStatus, ListenerRuntime};

pub async fn wait_for_health(client: &reqwest::Client, health_url: &str) -> bool {
    for _ in 0..20 {
        if let Ok(response) = client.get(health_url).send().await {
            if response.status() == reqwest::StatusCode::OK {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    false
}

pub async fn drain_in_flight(
    in_flight: &Arc<AtomicU64>,
    in_flight_notify: &Arc<Notify>,
    max_duration: Duration,
) {
    let deadline = Instant::now() + max_duration;
    while in_flight.load(Ordering::SeqCst) > 0 {
        let now = Instant::now();
        if now >= deadline {
            break;
        }
        let remaining = deadline.saturating_duration_since(now);
        let _ = tokio::time::timeout(remaining, in_flight_notify.notified()).await;
    }
}

pub async fn reconcile_model_incompatibilities(
    selection_state: &Arc<AsyncMutex<RouterRuntimeState>>,
    previous: &CodexRouterConfig,
    config: &CodexRouterConfig,
) {
    let refreshed_accounts: HashSet<String> = config
        .accounts
        .iter()
        .filter_map(|account| {
            let previous_generation = previous
                .accounts
                .iter()
                .find(|prior| prior.id == account.id)
                .and_then(|prior| prior.model_catalog_fetched_at);
            account
                .model_catalog_fetched_at
                .filter(|generation| Some(*generation) != previous_generation)
                .map(|_| account.id.clone())
        })
        .collect();

    let routing_fingerprint = |snapshot: &CodexRouterConfig, account_id: &str, model: &str| {
        let mut pools: Vec<(String, String, Vec<String>)> = snapshot
            .pools
            .iter()
            .filter(|pool| {
                pool.model == model && pool.account_ids.iter().any(|id| id == account_id)
            })
            .map(|pool| {
                (
                    pool.id.clone(),
                    pool.model_selection_mode.clone(),
                    pool.account_ids.clone(),
                )
            })
            .collect();
        pools.sort_by(|left, right| left.0.cmp(&right.0));
        pools
    };

    selection_state
        .lock()
        .await
        .model_incompatible
        .retain(|(account_id, model)| {
            !refreshed_accounts.contains(account_id)
                && routing_fingerprint(previous, account_id, model)
                    == routing_fingerprint(config, account_id, model)
        });
}

impl CodexRouterManager {
    pub async fn start_listener(&self) -> Result<CodexRouterStatus, String> {
        self.start_listener_on(None).await
    }

    /// Binds loopback on `port`, or on an OS-assigned port when `None`.
    pub async fn start_listener_on(&self, port: Option<u16>) -> Result<CodexRouterStatus, String> {
        self.start_listener_with(port, None).await
    }

    /// Like `start_listener_on`, but `secret` keeps an existing router key.
    pub async fn start_listener_with(
        &self,
        port: Option<u16>,
        secret: Option<Arc<str>>,
    ) -> Result<CodexRouterStatus, String> {
        self.start_listener_flagged(port, secret, port.is_some())
            .await
    }

    /// `fixed_port` records whether `port` is an explicit user choice (see `has_fixed_port`).
    pub(crate) async fn start_listener_flagged(
        &self,
        port: Option<u16>,
        secret: Option<Arc<str>>,
        fixed_port: bool,
    ) -> Result<CodexRouterStatus, String> {
        // Load persisted bindings before taking the listener lock and before the server accepts
        // requests: no startup 401 window, and a stalled store cannot block status/stop.
        self.restore_persisted_bindings().await;
        let mut runtime_guard = self.listener.lock().await;
        if runtime_guard.is_some() {
            drop(runtime_guard);
            return Ok(self.status().await);
        }

        let listener =
            tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port.unwrap_or(0)))
                .await
                .map_err(|error| match port {
                    Some(port) => format!("Port {port} is unavailable: {error}"),
                    None => format!("Failed to bind Codex router loopback listener: {error}"),
                })?;
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
        let router_secret: Arc<str> =
            secret.unwrap_or_else(|| Arc::from(crate::codex_sync::generate_router_secret()));
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

        crate::logger::log_info("router_server", &format!("Router listening on {base_url}"));
        *runtime_guard = Some(ListenerRuntime {
            base_url: base_url.clone(),
            port: address.port(),
            started_at: Instant::now(),
            shutdown: shutdown_tx,
            task,
            secret: router_secret,
            fixed_port,
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
            crate::logger::log_info("router_server", "Router stopped");
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
}
