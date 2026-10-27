//! Disconnect and connection listing. Never exposes a gateway secret.
use std::path::Path;

use super::journal::load_journal;
use super::retire::{forget_binding, journal_path};
use super::service::{ConnectEnv, GatewayStore};
use super::settings_patch::revert_profile_patch;
use crate::codex::router::CodexRouterManager;

const ONCE_SUFFIX: &str = ":launch-once";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConnection {
    pub profile_id: String,
    pub binding_id: String,
    pub mode: String,
    pub connected: bool,
    /// No live binding remains, but a settings patch is still recorded and must be undone.
    pub cleanup_pending: bool,
    /// The patched settings.json points at a router address that is no longer the current one.
    /// Reconnect to rewrite it; QuotaShift never edits the user's settings on its own.
    pub gateway_moved: bool,
}

pub async fn disconnect(env: &ConnectEnv<'_>, binding_id: &str) -> Result<(), String> {
    let journal_file = journal_path(env.journal_dir, binding_id)?;
    let forgotten = forget_binding(env, binding_id).await;
    let reverted = if journal_file.is_file() {
        load_journal(&journal_file).and_then(|journal| {
            revert_profile_patch(&journal.profile_path, &journal)?;
            let _ = std::fs::remove_file(&journal_file);
            Ok(())
        })
    } else {
        Ok(())
    };
    reverted.and(forgotten)
}

/// Stops tracking a leftover patch: removes the journal only and leaves settings.json
/// untouched. The binding is revoked and forgotten if it still exists.
pub async fn dismiss_cleanup(env: &ConnectEnv<'_>, journal_id: &str) -> Result<(), String> {
    let journal_file = journal_path(env.journal_dir, journal_id)?;
    let forgotten = forget_binding(env, journal_id).await;
    if journal_file.is_file() {
        std::fs::remove_file(&journal_file)
            .map_err(|e| format!("Failed to remove the cleanup record: {e}"))?;
    }
    forgotten
}

pub async fn binding_active(manager: &CodexRouterManager, binding_id: &str) -> bool {
    manager
        .client_bindings
        .read()
        .await
        .get(binding_id)
        .is_some_and(|b| !b.revoked)
}

/// The router address a persistent binding's settings.json was patched with.
fn patched_base_url(journal_dir: &Path, binding_id: &str) -> Option<String> {
    let journal = journal_path(journal_dir, binding_id)
        .ok()
        .filter(|path| path.is_file())
        .and_then(|path| load_journal(&path).ok())?;
    let value = journal.patched_values.get("env.ANTHROPIC_BASE_URL")?;
    value.as_str().map(str::to_string)
}

/// True when the persistent binding's settings.json holds a router address other than the
/// running router's. Launch-once bindings have no journal and are never moved.
pub fn binding_moved(journal_dir: &Path, binding_id: &str, base_url: Option<&str>) -> bool {
    base_url.is_some_and(|current| {
        patched_base_url(journal_dir, binding_id).is_some_and(|patched| patched != current)
    })
}

/// Every non-revoked binding known to the store or the router. `base_url` is the running
/// router's address (None = stopped). `connected` means the router is running, the binding
/// authenticates, and the patched settings still point at the router's current address.
pub async fn list_connections(
    manager: &CodexRouterManager,
    store: &dyn GatewayStore,
    journal_dir: &Path,
    base_url: Option<&str>,
) -> Vec<ClaudeConnection> {
    let mut seen = std::collections::HashSet::new();
    let mut all = store.list().unwrap_or_default();
    all.extend(manager.client_bindings.read().await.values().cloned());
    let mut out = Vec::new();
    for binding in all.into_iter().filter(|b| !b.revoked) {
        if !seen.insert(binding.id.0.clone()) {
            continue;
        }
        let once = binding.profile_id.strip_suffix(ONCE_SUFFIX);
        let moved = once.is_none() && binding_moved(journal_dir, &binding.id.0, base_url);
        out.push(ClaudeConnection {
            profile_id: once.unwrap_or(&binding.profile_id).to_string(),
            mode: if once.is_some() {
                "launch-once"
            } else {
                "persistent-profile"
            }
            .into(),
            connected: base_url.is_some() && !moved && binding_active(manager, &binding.id.0).await,
            cleanup_pending: false,
            gateway_moved: moved,
            binding_id: binding.id.0,
        });
    }
    out.extend(pending_cleanups(journal_dir, &seen));
    out.sort_by(|a, b| a.binding_id.cmp(&b.binding_id));
    out
}

/// Journals whose binding is gone: Disconnect with the journal id retries the revert.
fn pending_cleanups(
    journal_dir: &Path,
    live: &std::collections::HashSet<String>,
) -> Vec<ClaudeConnection> {
    let Ok(entries) = std::fs::read_dir(journal_dir) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for path in entries.flatten().map(|e| e.path()) {
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if path.extension().and_then(|e| e.to_str()) != Some("json") || live.contains(id) {
            continue;
        }
        let Ok(journal) = load_journal(&path) else {
            continue;
        };
        rows.push(ClaudeConnection {
            profile_id: journal.profile_id,
            binding_id: id.to_string(),
            mode: "persistent-profile".into(),
            connected: false,
            cleanup_pending: true,
            gateway_moved: false,
        });
    }
    rows
}
