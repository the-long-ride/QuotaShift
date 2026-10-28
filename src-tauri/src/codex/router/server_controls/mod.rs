//! Router server controls for the Model Pools panel: fixed port, key rotation and logs.

use super::{CodexRouterManager, CodexRouterStatus};

const ROUTER_LOG_TAGS: [&str; 4] = [
    "[codex_router]",
    "[codex_pool]",
    "[siwc]",
    "[router_server]",
];
const DEFAULT_LOG_LIMIT: usize = 200;
const MAX_LOG_LIMIT: usize = 1000;

pub fn validate_router_port(port: Option<u16>) -> Result<(), String> {
    match port {
        Some(port) if port < 1024 => Err(format!(
            "Port {port} is reserved. Choose a port from 1024 to 65535"
        )),
        _ => Ok(()),
    }
}

/// Router lines from the in-memory session log, oldest first, capped at `limit`.
pub fn filter_router_logs(lines: &[String], limit: Option<usize>) -> Vec<String> {
    let limit = limit.unwrap_or(DEFAULT_LOG_LIMIT).clamp(1, MAX_LOG_LIMIT);
    let matching: Vec<&String> = lines
        .iter()
        .filter(|line| ROUTER_LOG_TAGS.iter().any(|tag| line.contains(tag)))
        .collect();
    let start = matching.len().saturating_sub(limit);
    matching[start..]
        .iter()
        .map(|line| (*line).clone())
        .collect()
}

/// Codex CLI config that currently points at a QuotaShift loopback router.
fn connected_codex_config() -> Option<std::path::PathBuf> {
    let path = crate::codex_sync::codex_dir().ok()?.join("config.toml");
    crate::codex_sync::config_points_at_quotashift_loopback(&path).then_some(path)
}

impl CodexRouterManager {
    /// Starts on the saved `port`, falling back to an OS-assigned port when it is taken.
    pub async fn start_listener_preferring(
        &self,
        port: Option<u16>,
    ) -> Result<CodexRouterStatus, String> {
        match self.start_listener_on(port).await {
            Err(error) if port.is_some() => {
                crate::logger::log_warn(
                    "router_server",
                    &format!("{error}; falling back to a random port"),
                );
                self.start_listener_on(None).await
            }
            result => result,
        }
    }

    /// True when the running listener uses a port the user set explicitly. A random port and a
    /// fallback after the saved port was taken are not stable: the address changes on restart.
    pub async fn has_fixed_port(&self) -> bool {
        self.listener
            .lock()
            .await
            .as_ref()
            .is_some_and(|runtime| runtime.fixed_port)
    }

    /// Base URL and fixed-port flag of the running listener, read under one lock.
    pub async fn endpoint(&self) -> Option<(String, bool)> {
        let guard = self.listener.lock().await;
        let runtime = guard.as_ref()?;
        Some((runtime.base_url.clone(), runtime.fixed_port))
    }

    /// Restarts on `port` (None = OS-assigned). The key is kept unless `rotate_key` is set.
    /// `pin` is the user's intent for the port: `Some(true)` pins it (Apply with a port),
    /// `Some(false)` unpins it (Apply with an empty port), `None` keeps the current state.
    /// A Codex CLI config already pointed at the router is rewritten so it keeps working.
    pub async fn restart_listener(
        &self,
        port: Option<u16>,
        rotate_key: bool,
        pin: Option<bool>,
    ) -> Result<CodexRouterStatus, String> {
        validate_router_port(port)?;
        let (previous_port, previous_secret, previous_fixed) =
            match self.listener.lock().await.as_ref() {
                Some(runtime) => (
                    Some(runtime.port),
                    Some(runtime.secret.clone()),
                    runtime.fixed_port,
                ),
                None => (None, None, false),
            };
        let fixed = match pin {
            Some(pin) => pin && port.is_some(),
            None => previous_fixed,
        };
        let kept_secret = if rotate_key {
            None
        } else {
            previous_secret.clone()
        };
        if let Some(port) = port.filter(|port| Some(*port) != previous_port) {
            // Probe before stopping so a taken port leaves the running router alone.
            std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
                .map_err(|error| format!("Port {port} is unavailable: {error}"))?;
        }
        let codex_config = connected_codex_config();

        self.stop_listener().await?;
        if let Err(error) = self.start_listener_flagged(port, kept_secret, fixed).await {
            crate::logger::log_warn("router_server", &format!("Restart failed: {error}"));
            self.start_listener_flagged(previous_port, previous_secret, previous_fixed)
                .await
                .map_err(|fallback| format!("{error}; previous port also failed: {fallback}"))?;
            return Err(error);
        }

        if !self.manage_provider_config {
            if let Some(path) = codex_config {
                let guard = self.listener.lock().await;
                if let Some(runtime) = guard.as_ref() {
                    crate::codex_sync::write_codex_router_config_at(
                        &path,
                        &runtime.base_url,
                        runtime.secret.as_ref(),
                    )
                    .map_err(|error| {
                        format!("Router restarted but Codex CLI config was not updated: {error}")
                    })?;
                    crate::logger::log_info("router_server", "Updated Codex CLI router config");
                }
            }
        }
        let key_note = if rotate_key {
            "a new key"
        } else {
            "the same key"
        };
        crate::logger::log_info(
            "router_server",
            &format!("Router restarted with {key_note}"),
        );
        Ok(self.status().await)
    }
}

#[tauri::command]
pub async fn restart_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
    port: Option<u16>,
    rotate_key: Option<bool>,
    pin: Option<bool>,
) -> Result<CodexRouterStatus, String> {
    manager
        .restart_listener(port, rotate_key.unwrap_or(false), pin)
        .await
}

/// Returns the loopback router key. The UI asks only on an explicit reveal or copy.
#[tauri::command]
pub async fn get_codex_router_key(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<String, String> {
    manager
        .listener
        .lock()
        .await
        .as_ref()
        .map(|runtime| runtime.secret.to_string())
        .ok_or_else(|| "Codex router is not running".to_string())
}

#[tauri::command]
pub fn clear_codex_router_logs() -> Result<(), String> {
    crate::logger::clear_session_logs();
    Ok(())
}

#[tauri::command]
pub fn get_codex_router_logs(limit: Option<usize>) -> Result<Vec<String>, String> {
    Ok(filter_router_logs(
        &crate::logger::get_session_logs(),
        limit,
    ))
}

#[cfg(test)]
mod tests;
