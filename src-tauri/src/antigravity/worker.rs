//! Isolated worker management for Antigravity exact quota extraction.
//! Contract guarantees:
//! - Worker launch uses `--user-data-dir`, `worker-marker.json`, `ownership_nonce` in `antigravity-workers`.
//! - Verification calls `parse_exact_status(expected_email, ...)` sequentially.
//! - Process cleanup targets `owned_process_ids` via `taskkill` with `/PID` on Windows without killing broadly.

pub mod ops;
pub mod process;
pub mod profile;

pub use ops::*;
pub use process::*;
pub use profile::*;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, State};

use crate::types::{
    AntigravityWorkerStatus, ExactAntigravityAccountRequest, ExactAntigravityAccountResult,
};

pub struct AntigravityWorkerManager {
    workers: Mutex<HashMap<String, ManagedAntigravityWorker>>,
    statuses: Mutex<HashMap<String, AntigravityWorkerStatus>>,
    restart_history: Mutex<HashMap<String, Vec<Instant>>>,
    refresh_in_progress: AtomicBool,
}

impl Default for AntigravityWorkerManager {
    fn default() -> Self {
        Self {
            workers: Mutex::new(HashMap::new()),
            statuses: Mutex::new(HashMap::new()),
            restart_history: Mutex::new(HashMap::new()),
            refresh_in_progress: AtomicBool::new(false),
        }
    }
}

struct RefreshGuard<'a>(&'a AtomicBool);
impl Drop for RefreshGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl AntigravityWorkerManager {
    pub async fn refresh_account(
        &self,
        app: &AppHandle,
        request: &ExactAntigravityAccountRequest,
        persistent: bool,
    ) -> ExactAntigravityAccountResult {
        refresh_worker_account(
            &self.workers,
            &self.statuses,
            &self.restart_history,
            app,
            request,
            persistent,
        )
        .await
    }

    pub fn stop_account(&self, account_id: &str) -> Result<(), String> {
        let worker = self
            .workers
            .lock()
            .map_err(|_| "Worker state is unavailable".to_string())?
            .remove(account_id);
        let had_managed_worker = worker.is_some();
        if let Some(worker) = worker {
            stop_owned_worker(&worker)?;
            remove_owned_profile(&worker.profile_dir)?;
        }
        if !had_managed_worker {
            if let Ok(profile_dir) = worker_profile_dir(account_id) {
                if let Some(marker) = read_marker(&profile_dir) {
                    if marker.account_id == account_id
                        && marker.schema_version == WORKER_SCHEMA_VERSION
                    {
                        let stale = ManagedAntigravityWorker {
                            account_id: marker.account_id,
                            profile_dir: profile_dir.clone(),
                            ownership_nonce: marker.ownership_nonce,
                            root_pid: 0,
                            language_server_pid: None,
                            port: None,
                            csrf_token: None,
                            started_at: marker.created_at,
                        };
                        let _ = stop_owned_worker(&stale);
                        let _ = remove_owned_profile(&profile_dir);
                    }
                }
            }
        }
        if let Ok(mut statuses) = self.statuses.lock() {
            statuses.remove(account_id);
        }
        if let Ok(mut history) = self.restart_history.lock() {
            history.remove(account_id);
        }
        Ok(())
    }

    pub fn stop_all(&self) -> Result<(), String> {
        let workers: Vec<ManagedAntigravityWorker> = self
            .workers
            .lock()
            .map_err(|_| "Worker state is unavailable".to_string())?
            .drain()
            .map(|(_, worker)| worker)
            .collect();
        let mut errors = Vec::new();
        for worker in workers {
            if let Err(error) = stop_owned_worker(&worker) {
                errors.push(error);
            }
            if let Err(error) = remove_owned_profile(&worker.profile_dir) {
                errors.push(error);
            }
        }
        if let Ok(mut statuses) = self.statuses.lock() {
            statuses.clear();
        }
        if let Ok(mut history) = self.restart_history.lock() {
            history.clear();
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    pub fn statuses(&self) -> Vec<AntigravityWorkerStatus> {
        self.statuses
            .lock()
            .map(|statuses| statuses.values().cloned().collect())
            .unwrap_or_default()
    }
}

#[tauri::command]
pub async fn refresh_antigravity_accounts_exact(
    app_handle: AppHandle,
    manager: State<'_, AntigravityWorkerManager>,
    requests: Vec<ExactAntigravityAccountRequest>,
    persistent: bool,
) -> Result<Vec<ExactAntigravityAccountResult>, String> {
    if manager.refresh_in_progress.swap(true, Ordering::AcqRel) {
        return Err("An exact Antigravity refresh is already in progress".to_string());
    }
    let _guard = RefreshGuard(&manager.refresh_in_progress);
    let mut results = Vec::with_capacity(requests.len());
    for request in requests {
        results.push(
            manager
                .refresh_account(&app_handle, &request, persistent)
                .await,
        );
    }
    Ok(results)
}

#[tauri::command]
pub fn stop_antigravity_worker(
    manager: State<'_, AntigravityWorkerManager>,
    account_id: String,
) -> Result<(), String> {
    manager.stop_account(&account_id)
}

#[tauri::command]
pub fn stop_all_antigravity_workers(
    manager: State<'_, AntigravityWorkerManager>,
) -> Result<(), String> {
    manager.stop_all()
}

#[tauri::command]
pub fn get_antigravity_worker_statuses(
    manager: State<'_, AntigravityWorkerManager>,
) -> Vec<AntigravityWorkerStatus> {
    manager.statuses()
}

#[cfg(test)]
mod tests;
