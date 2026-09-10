use std::collections::BTreeSet;
use std::fs;
use std::process::Command;
use std::time::{Duration, Instant};

use super::profile::*;
use crate::antigravity_exact::parse_exact_status;
use crate::process::{
    descendant_process_ids, extract_csrf_token, query_server, query_server_https, scan_ports,
    scan_process_records, ProcessRecord,
};
use crate::types::{ExactAntigravityAccountRequest, FullStatus};

pub const WORKER_START_TIMEOUT: Duration = Duration::from_secs(50);
pub const WORKER_POLL_INTERVAL: Duration = Duration::from_millis(650);

pub fn launch_worker(
    request: &ExactAntigravityAccountRequest,
) -> Result<ManagedAntigravityWorker, String> {
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
            return Err(format!(
                "Failed to launch isolated Antigravity worker: {error}"
            ));
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

pub fn record_contains_owner(record: &ProcessRecord, worker: &ManagedAntigravityWorker) -> bool {
    let command = record.command_line.to_lowercase();
    let profile = worker.profile_dir.to_string_lossy().to_lowercase();
    command.contains(&profile) || command.contains(&worker.ownership_nonce.to_lowercase())
}

pub fn owned_process_ids(
    worker: &ManagedAntigravityWorker,
    records: &[ProcessRecord],
) -> BTreeSet<u32> {
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

pub fn stop_owned_worker(worker: &ManagedAntigravityWorker) -> Result<(), String> {
    if !marker_matches(worker) {
        return Err(
            "Refusing to stop a process without a matching QuotaShift worker marker".to_string(),
        );
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
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .output();
        }
    }
    Ok(())
}

pub async fn query_exact_server(
    port: u16,
    token: &str,
    expected_email: &str,
) -> Result<FullStatus, String> {
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

pub async fn discover_and_query(
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
            if !lower_name.contains("language_server") && !lower_command.contains("language_server")
            {
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

pub async fn query_existing_worker(
    worker: &ManagedAntigravityWorker,
    expected_email: &str,
) -> Result<FullStatus, String> {
    let port = worker
        .port
        .ok_or_else(|| "Persistent worker has no known port".to_string())?;
    query_exact_server(
        port,
        worker.csrf_token.as_deref().unwrap_or(""),
        expected_email,
    )
    .await
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
                let _ = Command::new("kill")
                    .args(["-TERM", &pid.to_string()])
                    .output();
            }
        }
        let _ = remove_owned_profile(&profile_dir);
    }
}
