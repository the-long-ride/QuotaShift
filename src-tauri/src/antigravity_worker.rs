use crate::antigravity_exact::parse_exact_status;
use crate::process::{
    descendant_process_ids, extract_csrf_token, query_server, query_server_https, scan_ports,
    scan_process_records, ProcessRecord,
};
use crate::types::{
    AntigravityExactState, AntigravityWorkerProgress, AntigravityWorkerStatus,
    ExactAntigravityAccountRequest, ExactAntigravityAccountResult, FullStatus,
};
use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const WORKER_SCHEMA_VERSION: u32 = 1;
const WORKER_MARKER_FILE: &str = "worker-marker.json";
const PROFILE_WRITER: &str = include_str!("python/write_worker_vscdb.py");
const WORKER_START_TIMEOUT: Duration = Duration::from_secs(50);
const WORKER_POLL_INTERVAL: Duration = Duration::from_millis(650);
const MAX_PERSISTENT_RESTARTS: usize = 3;
const RESTART_WINDOW: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerMarker {
    schema_version: u32,
    account_id: String,
    ownership_nonce: String,
    created_at: String,
}

#[derive(Debug, Clone)]
struct ManagedAntigravityWorker {
    account_id: String,
    profile_dir: PathBuf,
    ownership_nonce: String,
    root_pid: u32,
    language_server_pid: Option<u32>,
    port: Option<u16>,
    csrf_token: Option<String>,
    started_at: String,
}

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

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn sanitize_account_id(account_id: &str) -> String {
    let value: String = account_id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') { ch } else { '_' })
        .collect();
    if value.is_empty() { "account".to_string() } else { value }
}

fn worker_root_dir() -> Result<PathBuf, String> {
    let home = crate::session::get_home_dir()
        .ok_or_else(|| "Could not locate the user home directory".to_string())?;
    Ok(home.join(".quotashift").join("antigravity-workers"))
}

fn worker_profile_dir(account_id: &str) -> Result<PathBuf, String> {
    Ok(worker_root_dir()?.join(sanitize_account_id(account_id)))
}

fn generate_nonce() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn marker_path(profile_dir: &Path) -> PathBuf {
    profile_dir.join(WORKER_MARKER_FILE)
}

fn read_marker(profile_dir: &Path) -> Option<WorkerMarker> {
    let content = fs::read_to_string(marker_path(profile_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

fn marker_matches(worker: &ManagedAntigravityWorker) -> bool {
    read_marker(&worker.profile_dir)
        .map(|marker| {
            marker.schema_version == WORKER_SCHEMA_VERSION
                && marker.account_id == worker.account_id
                && marker.ownership_nonce == worker.ownership_nonce
        })
        .unwrap_or(false)
}

fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Invalid worker file path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, content).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

fn remove_owned_profile(profile_dir: &Path) -> Result<(), String> {
    if !profile_dir.exists() {
        return Ok(());
    }
    let marker = read_marker(profile_dir)
        .ok_or_else(|| format!("Refusing to delete an unmarked worker profile: {}", profile_dir.display()))?;
    if marker.schema_version != WORKER_SCHEMA_VERSION {
        return Err("Refusing to delete a worker profile with an unsupported marker".to_string());
    }
    fs::remove_dir_all(profile_dir).map_err(|error| error.to_string())
}

fn prepare_profile(request: &ExactAntigravityAccountRequest) -> Result<(PathBuf, String), String> {
    let profile_dir = worker_profile_dir(&request.account_id)?;
    if profile_dir.exists() {
        remove_owned_profile(&profile_dir)?;
    }
    let global_storage = profile_dir.join("User").join("globalStorage");
    let workspace = profile_dir.join("quotashift-empty-workspace");
    fs::create_dir_all(&global_storage).map_err(|error| error.to_string())?;
    fs::create_dir_all(&workspace).map_err(|error| error.to_string())?;

    let ownership_nonce = generate_nonce();
    let marker = WorkerMarker {
        schema_version: WORKER_SCHEMA_VERSION,
        account_id: request.account_id.clone(),
        ownership_nonce: ownership_nonce.clone(),
        created_at: now_string(),
    };
    let marker_bytes = serde_json::to_vec_pretty(&marker).map_err(|error| error.to_string())?;
    atomic_write(&marker_path(&profile_dir), &marker_bytes)?;

    let db_path = global_storage.join("state.vscdb");
    let refresh_token = request.refresh_token.as_deref().unwrap_or("");
    let profile_url = request.profile_url.as_deref().unwrap_or("");
    let auth_method = request.auth_method.as_deref().unwrap_or("");
    let db_path_text = db_path.to_string_lossy().to_string();
    let output = crate::run_cmd(Command::new("python"))
        .args([
            "-c",
            PROFILE_WRITER,
            &db_path_text,
            &request.access_token,
            profile_url,
            refresh_token,
            &request.email,
            auth_method,
        ])
        .output()
        .map_err(|error| format!("Failed to run isolated profile writer: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Failed to prepare isolated Antigravity profile: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.contains("SUCCESS") {
        return Err(format!("Isolated profile writer did not confirm success: {}", stdout.trim()));
    }
    Ok((profile_dir, ownership_nonce))
}

fn launch_worker(request: &ExactAntigravityAccountRequest) -> Result<ManagedAntigravityWorker, String> {
    let (profile_dir, ownership_nonce) = prepare_profile(request)?;
    let executable = crate::session::find_antigravity_executable()?;
    let workspace = profile_dir.join("quotashift-empty-workspace");
    let profile_text = profile_dir.to_string_lossy().to_string();
    let workspace_text = workspace.to_string_lossy().to_string();
    let child = match crate::run_cmd(Command::new(executable))
        .args([
            "--user-data-dir",
            &profile_text,
            "--new-window",
            "--start-minimized",
            "--skip-welcome",
            "--skip-release-notes",
            "--disable-workspace-trust",
            "--disable-updates",
            &workspace_text,
        ])
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            let _ = remove_owned_profile(&profile_dir);
            return Err(format!("Failed to launch isolated Antigravity worker: {error}"));
        }
    };
    Ok(ManagedAntigravityWorker {
        account_id: request.account_id.clone(),
        profile_dir,
        ownership_nonce,
        root_pid: child.id(),
        language_server_pid: None,
        port: None,
        csrf_token: None,
        started_at: now_string(),
    })
}

fn record_contains_owner(record: &ProcessRecord, worker: &ManagedAntigravityWorker) -> bool {
    let command = record.command_line.to_lowercase();
    let profile = worker.profile_dir.to_string_lossy().to_lowercase();
    command.contains(&profile) || command.contains(&worker.ownership_nonce.to_lowercase())
}

fn owned_process_ids(worker: &ManagedAntigravityWorker, records: &[ProcessRecord]) -> BTreeSet<u32> {
    let descendants = descendant_process_ids(records, worker.root_pid);
    let mut owned = BTreeSet::new();
    for record in records {
        if record_contains_owner(record, worker)
            || (descendants.contains(&record.pid)
                && records
                    .iter()
                    .find(|candidate| candidate.pid == worker.root_pid)
                    .map(|root| record_contains_owner(root, worker))
                    .unwrap_or(false))
        {
            owned.insert(record.pid);
        }
    }
    owned
}

fn stop_owned_worker(worker: &ManagedAntigravityWorker) -> Result<(), String> {
    if !marker_matches(worker) {
        return Err("Refusing to stop a process without a matching QuotaShift worker marker".to_string());
    }
    let records = scan_process_records();
    let owned = owned_process_ids(worker, &records);
    for pid in owned.iter().rev() {
        #[cfg(target_os = "windows")]
        {
            let _ = crate::run_cmd(Command::new("taskkill"))
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
        }
    }
    Ok(())
}

async fn query_exact_server(port: u16, token: &str, expected_email: &str) -> Result<FullStatus, String> {
    let body = serde_json::json!({
        "ideName": "antigravity",
        "extensionName": "antigravity",
        "locale": "en",
        "ideVersion": "unknown"
    });
    let https_status = query_server_https(
        port,
        token,
        "/exa.language_server_pb.LanguageServerService/GetUserStatus",
        body.clone(),
    )
    .await;
    let (user_status, use_https) = match https_status {
        Ok(value) => (value, true),
        Err(_) => (
            query_server(
                port,
                token,
                "/exa.language_server_pb.LanguageServerService/GetUserStatus",
            )
            .await?,
            false,
        ),
    };
    let quota_summary = if use_https {
        query_server_https(
            port,
            token,
            "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
            body,
        )
        .await?
    } else {
        query_server(
            port,
            token,
            "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
        )
        .await?
    };
    parse_exact_status(expected_email, user_status, quota_summary)
}

async fn discover_and_query(
    worker: &mut ManagedAntigravityWorker,
    expected_email: &str,
) -> Result<FullStatus, String> {
    let deadline = Instant::now() + WORKER_START_TIMEOUT;
    let mut last_error = "Waiting for the isolated Antigravity language server".to_string();
    while Instant::now() < deadline {
        let records = scan_process_records();
        let owned = owned_process_ids(worker, &records);
        for record in records.iter().filter(|record| owned.contains(&record.pid)) {
            let lower_name = record.name.to_lowercase();
            let lower_command = record.command_line.to_lowercase();
            if !lower_name.contains("language_server") && !lower_command.contains("language_server") {
                continue;
            }
            let token = extract_csrf_token(&record.command_line).unwrap_or_default();
            for port in scan_ports(record.pid) {
                match query_exact_server(port, &token, expected_email).await {
                    Ok(status) => {
                        worker.language_server_pid = Some(record.pid);
                        worker.port = Some(port);
                        worker.csrf_token = Some(token);
                        return Ok(status);
                    }
                    Err(error) => last_error = error,
                }
            }
        }
        tokio::time::sleep(WORKER_POLL_INTERVAL).await;
    }
    Err(format!("Timed out waiting for exact quota: {last_error}"))
}

async fn query_existing_worker(
    worker: &ManagedAntigravityWorker,
    expected_email: &str,
) -> Result<FullStatus, String> {
    let port = worker.port.ok_or_else(|| "Persistent worker has no known port".to_string())?;
    query_exact_server(port, worker.csrf_token.as_deref().unwrap_or(""), expected_email).await
}

impl AntigravityWorkerManager {
    fn emit_progress(
        &self,
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
        if let Ok(mut statuses) = self.statuses.lock() {
            statuses.insert(account_id.to_string(), status);
        }
        let _ = app.emit("antigravity-worker-progress", progress);
    }

    fn allow_persistent_restart(&self, account_id: &str) -> bool {
        let now = Instant::now();
        let mut history = match self.restart_history.lock() {
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

    async fn refresh_account(
        &self,
        app: &AppHandle,
        request: &ExactAntigravityAccountRequest,
        persistent: bool,
    ) -> ExactAntigravityAccountResult {
        self.emit_progress(
            app,
            &request.account_id,
            AntigravityExactState::PreparingProfile,
            "Preparing isolated Antigravity profile",
            false,
            None,
            None,
        );

        if persistent {
            let existing = self.workers.lock().ok().and_then(|workers| workers.get(&request.account_id).cloned());
            if let Some(worker) = existing {
                self.emit_progress(
                    app,
                    &request.account_id,
                    AntigravityExactState::ReadingExactQuota,
                    "Reading exact quota from persistent worker",
                    true,
                    Some(worker.started_at.clone()),
                    None,
                );
                if let Ok(status) = query_existing_worker(&worker, &request.email).await {
                    self.emit_progress(
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
                if let Ok(mut workers) = self.workers.lock() {
                    workers.remove(&request.account_id);
                }
            }
            if !self.allow_persistent_restart(&request.account_id) {
                let error = "Persistent worker restart limit reached; try again later or disable persistent monitoring".to_string();
                self.emit_progress(
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

        self.emit_progress(
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
                self.emit_progress(
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

        self.emit_progress(
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
                    if let Ok(mut workers) = self.workers.lock() {
                        workers.insert(request.account_id.clone(), worker.clone());
                    }
                } else {
                    self.emit_progress(
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
                self.emit_progress(
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
                self.emit_progress(
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

    pub fn stop_account(&self, account_id: &str) -> Result<(), String> {
        let worker = self.workers.lock().map_err(|_| "Worker state is unavailable".to_string())?.remove(account_id);
        let had_managed_worker = worker.is_some();
        if let Some(worker) = worker {
            stop_owned_worker(&worker)?;
            remove_owned_profile(&worker.profile_dir)?;
        }
        if !had_managed_worker {
            if let Ok(profile_dir) = worker_profile_dir(account_id) {
                if let Some(marker) = read_marker(&profile_dir) {
                    if marker.account_id == account_id && marker.schema_version == WORKER_SCHEMA_VERSION {
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
        if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
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
        results.push(manager.refresh_account(&app_handle, &request, persistent).await);
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

pub fn cleanup_stale_owned_workers() {
    let root = match worker_root_dir() {
        Ok(root) => root,
        Err(_) => return,
    };
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let records = scan_process_records();
    for entry in entries.flatten() {
        let profile_dir = entry.path();
        let marker = match read_marker(&profile_dir) {
            Some(marker) if marker.schema_version == WORKER_SCHEMA_VERSION => marker,
            _ => continue,
        };
        let worker = ManagedAntigravityWorker {
            account_id: marker.account_id,
            profile_dir: profile_dir.clone(),
            ownership_nonce: marker.ownership_nonce,
            root_pid: 0,
            language_server_pid: None,
            port: None,
            csrf_token: None,
            started_at: marker.created_at,
        };
        for pid in owned_process_ids(&worker, &records).iter().rev() {
            #[cfg(target_os = "windows")]
            {
                let _ = crate::run_cmd(Command::new("taskkill"))
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
            }
        }
        let _ = remove_owned_profile(&profile_dir);
    }
}

#[cfg(test)]
mod tests {
    use super::{sanitize_account_id, worker_profile_dir};

    #[test]
    fn account_ids_cannot_escape_worker_root() {
        assert_eq!(sanitize_account_id("../A B"), "___A_B");
        let path = worker_profile_dir("../A B").unwrap();
        assert!(path.to_string_lossy().contains("antigravity-workers"));
        assert!(!path.to_string_lossy().contains("../"));
    }
}
