//! Retiring Claude gateway bindings: revoke in the router and delete from the store.
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::journal::load_journal;
use super::service::ConnectEnv;
use super::settings_patch::revert_profile_patch;

pub(super) fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub(super) fn journal_path(dir: &Path, binding_id: &str) -> Result<PathBuf, String> {
    if !safe_id(binding_id) {
        return Err("Invalid Claude gateway binding reference".into());
    }
    Ok(dir.join(format!("{binding_id}.json")))
}

/// Revokes a binding everywhere. If the store delete fails the binding is persisted as
/// revoked instead, so it cannot come back live after a restart; the error is returned.
pub(super) async fn forget_binding(env: &ConnectEnv<'_>, id: &str) -> Result<(), String> {
    env.manager.revoke_client_binding(id).await;
    let snapshot = env.manager.client_bindings.write().await.remove(id);
    let Err(error) = env.store.delete(id) else {
        return Ok(());
    };
    let stored = snapshot.or_else(|| env.store.list().ok()?.into_iter().find(|b| b.id.0 == id));
    if let Some(mut binding) = stored {
        binding.revoke();
        let _ = env.store.save(&binding);
    }
    Err(format!(
        "Could not remove the stored gateway credential: {error}"
    ))
}

/// Revokes and deletes every binding for `profile_key` except `keep_id`.
pub(super) async fn retire_older(
    env: &ConnectEnv<'_>,
    profile_key: &str,
    keep_id: &str,
) -> Result<(), String> {
    let mut old_ids: HashSet<String> = env
        .store
        .list()
        .unwrap_or_default()
        .iter()
        .filter(|b| b.profile_id == profile_key && b.id.0 != keep_id)
        .map(|b| b.id.0.clone())
        .collect();
    for b in env.manager.client_bindings.read().await.values() {
        if b.profile_id == profile_key && b.id.0 != keep_id {
            old_ids.insert(b.id.0.clone());
        }
    }
    let mut failure = None;
    for id in old_ids {
        if let Err(error) = forget_binding(env, &id).await {
            failure = Some(error);
        }
    }
    failure.map_or(Ok(()), Err)
}

/// Reverts journals recorded for the same settings file and retires the bindings they
/// belonged to (re-connect).
pub(super) async fn revert_previous_journals(
    env: &ConnectEnv<'_>,
    settings_path: &Path,
) -> Result<(), String> {
    let Ok(entries) = std::fs::read_dir(env.journal_dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(journal) = load_journal(&path) else {
            continue;
        };
        if journal.profile_path != settings_path {
            continue;
        }
        revert_profile_patch(settings_path, &journal)
            .map_err(|e| format!("The earlier QuotaShift connection could not be undone: {e}"))?;
        let _ = std::fs::remove_file(&path);
        if let Some(id) = path.file_stem().and_then(|s| s.to_str()) {
            forget_binding(env, id).await?;
        }
    }
    Ok(())
}
