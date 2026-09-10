use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::process::*;
use super::profile::*;
use crate::types::{
    AntigravityExactState, AntigravityWorkerProgress, AntigravityWorkerStatus,
    ExactAntigravityAccountRequest, ExactAntigravityAccountResult,
};

pub const MAX_PERSISTENT_RESTARTS: usize = 3;
pub const RESTART_WINDOW: Duration = Duration::from_secs(600);

pub fn emit_worker_progress(
    statuses: &Mutex<HashMap<String, AntigravityWorkerStatus>>,
    app: &AppHandle,
    account_id: &str,
    phase: AntigravityExactState,
    message: impl Into<String>,
    running: bool,
    started_at: Option<String>,
    last_error: Option<String>,
) {
    let message = message.into();
    let progress = AntigravityWorkerProgress {
        account_id: account_id.to_string(),
        phase: phase.clone(),
        message,
        timestamp: now_string(),
    };
    let status = AntigravityWorkerStatus {
        account_id: account_id.to_string(),
        phase,
        running,
        started_at,
        last_error,
    };
    if let Ok(mut lock) = statuses.lock() {
        lock.insert(account_id.to_string(), status);
    }
    let _ = app.emit("antigravity-worker-progress", progress);
}

pub fn allow_persistent_restart(
    restart_history: &Mutex<HashMap<String, Vec<Instant>>>,
    account_id: &str,
) -> bool {
    let now = Instant::now();
    let mut history = match restart_history.lock() {
        Ok(history) => history,
        Err(_) => return false,
    };
    let attempts = history.entry(account_id.to_string()).or_default();
    attempts.retain(|attempt| now.duration_since(*attempt) <= RESTART_WINDOW);
    if attempts.len() >= MAX_PERSISTENT_RESTARTS {
        return false;
    }
    attempts.push(now);
    true
}

pub async fn refresh_worker_account(
    workers: &Mutex<HashMap<String, ManagedAntigravityWorker>>,
    statuses: &Mutex<HashMap<String, AntigravityWorkerStatus>>,
    restart_history: &Mutex<HashMap<String, Vec<Instant>>>,
    app: &AppHandle,
    request: &ExactAntigravityAccountRequest,
    persistent: bool,
) -> ExactAntigravityAccountResult {
    emit_worker_progress(
        statuses,
        app,
        &request.account_id,
        AntigravityExactState::PreparingProfile,
        "Preparing isolated Antigravity profile",
        false,
        None,
        None,
    );

    if persistent {
        let existing = workers
            .lock()
            .ok()
            .and_then(|map| map.get(&request.account_id).cloned());
        if let Some(worker) = existing {
            emit_worker_progress(
                statuses,
                app,
                &request.account_id,
                AntigravityExactState::ReadingExactQuota,
                "Reading exact quota from persistent worker",
                true,
                Some(worker.started_at.clone()),
                None,
            );
            if let Ok(status) = query_existing_worker(&worker, &request.email).await {
                emit_worker_progress(
                    statuses,
                    app,
                    &request.account_id,
                    AntigravityExactState::Exact,
                    "Exact quota refreshed",
                    true,
                    Some(worker.started_at),
                    None,
                );
                return ExactAntigravityAccountResult {
                    account_id: request.account_id.clone(),
                    state: AntigravityExactState::Exact,
                    status: Some(status),
                    error: None,
                    fetched_at: now_string(),
                };
            }
            let _ = stop_owned_worker(&worker);
            if let Ok(mut map) = workers.lock() {
                map.remove(&request.account_id);
            }
        }
        if !allow_persistent_restart(restart_history, &request.account_id) {
            let error = "Persistent worker restart limit reached; try again later or disable persistent monitoring".to_string();
            emit_worker_progress(
                statuses,
                app,
                &request.account_id,
                AntigravityExactState::Error,
                &error,
                false,
                None,
                Some(error.clone()),
            );
            return ExactAntigravityAccountResult {
                account_id: request.account_id.clone(),
                state: AntigravityExactState::Error,
                status: None,
                error: Some(error),
                fetched_at: now_string(),
            };
        }
    }

    emit_worker_progress(
        statuses,
        app,
        &request.account_id,
        AntigravityExactState::StartingWorker,
        "Starting isolated Antigravity worker",
        false,
        None,
        None,
    );
    let mut worker = match launch_worker(request) {
        Ok(worker) => worker,
        Err(error) => {
            emit_worker_progress(
                statuses,
                app,
                &request.account_id,
                AntigravityExactState::Error,
                &error,
                false,
                None,
                Some(error.clone()),
            );
            return ExactAntigravityAccountResult {
                account_id: request.account_id.clone(),
                state: AntigravityExactState::Error,
                status: None,
                error: Some(error),
                fetched_at: now_string(),
            };
        }
    };

    emit_worker_progress(
        statuses,
        app,
        &request.account_id,
        AntigravityExactState::WaitingForLanguageServer,
        "Waiting for the isolated language server",
        true,
        Some(worker.started_at.clone()),
        None,
    );
    let query_result = discover_and_query(&mut worker, &request.email).await;
    match query_result {
        Ok(status) => {
            if persistent {
                if let Ok(mut map) = workers.lock() {
                    map.insert(request.account_id.clone(), worker.clone());
                }
            } else {
                emit_worker_progress(
                    statuses,
                    app,
                    &request.account_id,
                    AntigravityExactState::Stopping,
                    "Stopping temporary exact-quota worker",
                    true,
                    Some(worker.started_at.clone()),
                    None,
                );
                let _ = stop_owned_worker(&worker);
                let _ = remove_owned_profile(&worker.profile_dir);
            }
            emit_worker_progress(
                statuses,
                app,
                &request.account_id,
                AntigravityExactState::Exact,
                "Exact quota refreshed",
                persistent,
                Some(worker.started_at),
                None,
            );
            ExactAntigravityAccountResult {
                account_id: request.account_id.clone(),
                state: AntigravityExactState::Exact,
                status: Some(status),
                error: None,
                fetched_at: now_string(),
            }
        }
        Err(error) => {
            let _ = stop_owned_worker(&worker);
            let _ = remove_owned_profile(&worker.profile_dir);
            emit_worker_progress(
                statuses,
                app,
                &request.account_id,
                AntigravityExactState::Error,
                &error,
                false,
                Some(worker.started_at),
                Some(error.clone()),
            );
            ExactAntigravityAccountResult {
                account_id: request.account_id.clone(),
                state: AntigravityExactState::Error,
                status: None,
                error: Some(error),
                fetched_at: now_string(),
            }
        }
    }
}
