use super::types::CodexRouterConfig;
use super::{CodexRouterManager, CodexRouterStatus};

#[tauri::command]
pub async fn start_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
    port: Option<u16>,
) -> Result<CodexRouterStatus, String> {
    super::validate_router_port(port)?;
    manager.start_listener_preferring(port).await
}

#[tauri::command]
pub async fn stop_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    manager.stop_listener().await
}

#[tauri::command]
pub async fn configure_codex_router(
    app: tauri::AppHandle,
    manager: tauri::State<'_, CodexRouterManager>,
    config: CodexRouterConfig,
) -> Result<CodexRouterStatus, String> {
    // SIWC credentials are never supplied from React. Validate opaque native
    // registrations and account-specific model entitlements before publication.
    super::siwc_config::verify_native_siwc_pools(&app, &config).await?;
    *manager
        .native_app
        .write()
        .map_err(|_| "Router app binding poisoned")? = Some(app);
    manager.try_configure(config).await?;
    crate::claude::connect::commands::sync_active_claude_journals(&manager).await;
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn get_codex_router_status(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn get_codex_router_telemetry(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<super::telemetry_store::RouterTelemetryReport, String> {
    Ok(manager.usage_telemetry.report())
}

use super::ClientBinding;
use std::sync::atomic::Ordering;
use std::time::Duration;

impl CodexRouterManager {
    pub(crate) async fn restore_persisted_bindings(&self) {
        if self.bindings_restored.load(Ordering::Acquire) {
            return;
        }
        let timeout = Duration::from_millis(if cfg!(test) { 100 } else { 5000 });
        let load = tokio::task::spawn_blocking(self.binding_loader);
        let loaded = match tokio::time::timeout(timeout, load).await {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => Err(format!("binding load worker: {error}")),
            Err(_) => Err("timed out".to_string()),
        };
        match loaded {
            Ok(bindings) => {
                let mut map = self.client_bindings.write().await;
                for binding in bindings.into_iter().filter(|b| !b.revoked) {
                    map.entry(binding.id.0.clone()).or_insert(binding);
                }
                self.bindings_restored.store(true, Ordering::Release);
            }
            Err(error) => crate::logger::log_warn(
                "router_server",
                &format!("Persisted Claude gateway bindings not loaded: {error}"),
            ),
        }
    }
    pub async fn register_client_binding(&self, binding: ClientBinding) {
        self.client_bindings
            .write()
            .await
            .insert(binding.id.0.clone(), binding);
    }
    pub async fn revoke_client_binding(&self, binding_id: &str) {
        if let Some(binding) = self.client_bindings.write().await.get_mut(binding_id) {
            binding.revoke();
        }
    }

    pub fn connect_codex_cli_at(&self, dir: &std::path::Path) -> Result<(), String> {
        let guard = self
            .listener
            .try_lock()
            .map_err(|_| "Codex router listener is busy".to_string())?;
        let Some(runtime) = guard.as_ref() else {
            return Err("Codex router listener is not running".to_string());
        };
        crate::codex_sync::connect_codex_cli_at(dir, &runtime.base_url, &runtime.secret)
    }

    pub fn connect_codex_cli(&self) -> Result<(), String> {
        self.connect_codex_cli_at(&crate::codex_sync::codex_dir()?)
    }

    pub fn disconnect_codex_cli_at(&self, dir: &std::path::Path) -> Result<(), String> {
        crate::codex_sync::disconnect_codex_cli_at(dir)
    }

    pub fn disconnect_codex_cli(&self) -> Result<(), String> {
        self.disconnect_codex_cli_at(&crate::codex_sync::codex_dir()?)
    }
}

#[tauri::command]
pub async fn connect_codex_cli(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<(), String> {
    manager.connect_codex_cli()
}

#[tauri::command]
pub async fn disconnect_codex_cli(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<(), String> {
    manager.disconnect_codex_cli()
}
