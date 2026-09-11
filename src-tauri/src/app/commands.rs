use tauri::Manager;

use crate::types::{CodexMonitoredInfo, FullStatus};
use crate::window_manager::{poll_and_update_tray, show_main_dashboard, update_tray_only};
use crate::{antigravity_keep_alive, codex_sync, get_state, keep_alive, logger, quota, session};

#[tauri::command]
pub fn get_quota_status() -> Option<FullStatus> {
    let state = get_state().lock().unwrap();
    let mut status = match &state.last_status {
        Some(s) => {
            let mut s_clone = s.clone();
            s_clone.online = true;
            s_clone
        }
        None => FullStatus {
            credits: None,
            quotas: Vec::new(),
            plan_tier: None,
            recently_used_model: None,
            monitored_codex: None,
            email: None,
            online: false,
            source: None,
            accuracy: None,
        },
    };
    status.monitored_codex = state.monitored_codex.clone();
    Some(status)
}

#[tauri::command]
pub async fn force_refresh(app_handle: tauri::AppHandle) -> Option<FullStatus> {
    let _ = poll_and_update_tray(&app_handle).await;
    let state = get_state().lock().unwrap();
    let mut status = state.last_status.clone()?;
    status.online = true;
    if status.monitored_codex.is_none() {
        status.monitored_codex = state.monitored_codex.clone();
    }
    Some(status)
}

#[tauri::command]
pub fn set_monitored_model(model: String, app_handle: tauri::AppHandle) {
    {
        let mut state = get_state().lock().unwrap();
        state.monitored_model = Some(model);
        state.monitored_codex = None;
    }
    update_tray_only(&app_handle);
}

#[tauri::command]
pub fn set_monitored_codex(info: Option<CodexMonitoredInfo>, app_handle: tauri::AppHandle) {
    {
        let mut state = get_state().lock().unwrap();
        state.monitored_codex = info;
        if state.monitored_codex.is_some() {
            state.monitored_model = None;
        }
    }
    update_tray_only(&app_handle);
}

#[tauri::command]
pub fn set_poll_interval(seconds: u64) {
    let mut state = get_state().lock().unwrap();
    state.poll_interval_secs = seconds;
}

#[tauri::command]
pub fn is_debug() -> bool {
    cfg!(debug_assertions)
}

#[tauri::command]
pub fn export_backup_file(content: String) -> Result<String, String> {
    let home =
        session::get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let downloads = home.join("Downloads");
    if !downloads.exists() {
        std::fs::create_dir_all(&downloads)
            .map_err(|e| format!("Failed to create Downloads folder: {}", e))?;
    }
    let file_path = downloads.join("quotashift_backup.json");
    std::fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write backup file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn sync_codex_config(api_key: Option<String>, base_url: Option<String>, model: Option<String>) -> Result<(), String> {
    if let (Some(k), Some(u)) = (api_key.as_deref(), base_url.as_deref()) {
        if !k.trim().is_empty() && !u.trim().is_empty() { return codex_sync::sync_codex_config(k, u, model.as_deref()); }
    }
    Ok(())
}

#[tauri::command]
pub fn sync_codex_provider_config(base_url: Option<String>, model: Option<String>) -> Result<(), String> {
    if let Some(u) = base_url.as_deref() {
        if !u.trim().is_empty() { return codex_sync::sync_codex_provider_config(u, model.as_deref()); }
    }
    Ok(())
}

#[tauri::command]
pub fn get_codex_sync_status() -> Result<serde_json::Value, String> {
    codex_sync::get_codex_sync_status()
}

#[tauri::command]
pub fn restore_codex_config() -> Result<(), String> {
    codex_sync::restore_codex_config()
}
pub mod oauth;
pub use oauth::*;

#[tauri::command]
pub async fn read_codex_auth() -> Result<Option<String>, String> {
    session::read_codex_auth().await
}

#[tauri::command]
pub async fn write_codex_auth(content: String) -> Result<(), String> {
    session::write_codex_auth(content).await
}

#[tauri::command]
pub async fn kill_codex_processes() -> Result<crate::codex::process::CodexProcessKillResult, String> {
    crate::codex::process::kill_codex_processes().await
}

#[tauri::command]
pub async fn read_antigravity_session() -> Result<serde_json::Value, String> {
    session::read_antigravity_session().await
}

#[tauri::command]
pub async fn write_antigravity_session(
    token: String,
    refresh_token: Option<String>,
    profile_url: Option<String>,
    email: Option<String>,
    id_token: Option<String>,
) -> Result<(), String> {
    session::write_antigravity_session(token, refresh_token, profile_url, email, id_token).await
}

#[tauri::command]
pub async fn delete_antigravity_session() -> Result<(), String> {
    session::delete_antigravity_session().await
}

#[tauri::command]
pub async fn quit_antigravity_ide() -> Result<(), String> {
    session::quit_antigravity_ide().await
}

#[tauri::command]
pub async fn open_antigravity_ide() -> Result<(), String> {
    session::open_antigravity_ide().await
}

#[tauri::command]
pub async fn refresh_antigravity_token(
    refresh_token: String,
    auth_method: Option<String>,
) -> Result<serde_json::Value, String> {
    quota::refresh_antigravity_token(refresh_token, auth_method).await
}

#[tauri::command]
pub fn start_keep_alive(interval_mins: u64, app_handle: tauri::AppHandle) -> Result<(), String> {
    keep_alive::set_interval(interval_mins);
    keep_alive::start();
    antigravity_keep_alive::set_interval(interval_mins);
    antigravity_keep_alive::start();

    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let _ = antigravity_keep_alive::maintain_registered_antigravity_accounts(&app_handle).await;
    });
    Ok(())
}

#[tauri::command]
pub fn stop_keep_alive() -> Result<(), String> {
    keep_alive::stop();
    antigravity_keep_alive::stop();
    Ok(())
}

#[tauri::command]
pub fn get_keep_alive_status() -> Result<serde_json::Value, String> {
    let mut status = keep_alive::get_status();
    if let Some(object) = status.as_object_mut() {
        object.insert(
            "antigravityAccounts".to_string(),
            antigravity_keep_alive::get_status(),
        );
        object.insert(
            "antigravityAccountCount".to_string(),
            serde_json::json!(antigravity_keep_alive::registered_count()),
        );
    }
    Ok(status)
}

#[tauri::command]
pub fn sync_antigravity_keep_alive_accounts(
    app_handle: tauri::AppHandle,
    accounts: Vec<antigravity_keep_alive::AntigravityKeepAliveAccount>,
) -> Result<(), String> {
    let changed = antigravity_keep_alive::sync_antigravity_accounts(accounts);
    if antigravity_keep_alive::is_running() && !changed.is_empty() {
        let app_handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = antigravity_keep_alive::maintain_accounts(&app_handle, changed).await;
        });
    }
    Ok(())
}

#[tauri::command]
pub fn log_from_frontend(level: String, tag: String, message: String) {
    logger::write_log(&level, &format!("frontend:{}", tag), &message);
}

#[tauri::command]
pub fn open_devtools(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        logger::log_info("window", "open_devtools command executed");
        window.open_devtools();
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
pub fn get_log_file_path() -> Result<String, String> {
    logger::get_log_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine log file path".to_string())
}

#[tauri::command]
pub fn open_path_in_file_manager(path: String) -> Result<(), String> {
    crate::system::explorer::show_path_in_file_manager(&path)
}

#[tauri::command]
pub fn open_logs_folder() -> Result<(), String> {
    let dir = logger::get_log_dir().ok_or_else(|| "Could not determine log directory".to_string())?;
    logger::log_info("window", &format!("Opening logs folder: {:?}", dir));
    crate::system::explorer::show_path_in_file_manager(&dir.to_string_lossy())
}

#[tauri::command]
pub fn show_dashboard(app_handle: tauri::AppHandle) {
    show_main_dashboard(&app_handle, "overlay_click");
}

#[tauri::command]
pub fn set_overlay_visible(app_handle: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        if visible {
            let _ = window.show();
        } else {
            let _ = window.hide();
        }
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}
