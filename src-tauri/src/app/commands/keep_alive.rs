use crate::{antigravity_keep_alive, codex_keep_alive, keep_alive};

#[tauri::command]
pub fn start_keep_alive(interval_mins: u64, app_handle: tauri::AppHandle) -> Result<(), String> {
    keep_alive::set_interval(interval_mins);
    keep_alive::start();
    antigravity_keep_alive::set_interval(interval_mins);
    antigravity_keep_alive::start();
    codex_keep_alive::set_interval(interval_mins);
    codex_keep_alive::start();

    let app_handle_ag = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let _ =
            antigravity_keep_alive::maintain_registered_antigravity_accounts(&app_handle_ag).await;
    });

    let app_handle_cx = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let _ = codex_keep_alive::maintain_registered_codex_accounts(&app_handle_cx).await;
    });

    Ok(())
}

#[tauri::command]
pub fn stop_keep_alive() -> Result<(), String> {
    keep_alive::stop();
    antigravity_keep_alive::stop();
    codex_keep_alive::stop();
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
        object.insert("codexAccounts".to_string(), codex_keep_alive::get_status());
        object.insert(
            "codexAccountCount".to_string(),
            serde_json::json!(codex_keep_alive::registered_count()),
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
pub fn sync_codex_keep_alive_accounts(
    app_handle: tauri::AppHandle,
    accounts: Vec<codex_keep_alive::CodexKeepAliveAccount>,
) -> Result<(), String> {
    let changed = codex_keep_alive::sync_codex_accounts(accounts);
    if codex_keep_alive::is_running() && !changed.is_empty() {
        let app_handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let _ = codex_keep_alive::maintain_accounts(&app_handle, changed).await;
        });
    }
    Ok(())
}
