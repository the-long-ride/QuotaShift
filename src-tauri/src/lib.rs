use std::process::Command;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex, OnceLock,
};
use std::time::Instant;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

mod secrets;
mod credential_store;
mod types;
mod process;
mod oauth;
mod session;
mod quota;
mod dwm;
mod parser;
mod codex_sync;
mod keep_alive;
mod antigravity_keep_alive;
mod antigravity_remote;
mod antigravity_token;
mod antigravity_quota;
mod antigravity_usage;
mod antigravity_exact;
mod antigravity_worker;

use types::{FullStatus, CodexMonitoredInfo, AppState};

static STATE: OnceLock<Mutex<AppState>> = OnceLock::new();
static PANEL_CLOCK: OnceLock<Instant> = OnceLock::new();
static PANEL_FOCUS_GUARD_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
const PANEL_FOCUS_GUARD_MS: u64 = 250;

pub(crate) fn get_state() -> &'static Mutex<AppState> {
    STATE.get_or_init(|| {
        Mutex::new(AppState {
            last_status: None,
            monitored_model: None,
            monitored_codex: None,
            poll_interval_secs: 30,
        })
    })
}

pub(crate) fn run_cmd(cmd: Command) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        return cmd;
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd
    }
}



#[tauri::command]
fn get_quota_status() -> Option<FullStatus> {
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
async fn force_refresh(app_handle: tauri::AppHandle) -> Option<FullStatus> {
    let _ = poll_and_update_tray(&app_handle).await;
    let state = get_state().lock().unwrap();
    let mut status = state.last_status.clone()?;
    status.online = true;
    Some(status)
}

#[tauri::command]
fn set_monitored_model(model: String, app_handle: tauri::AppHandle) {
    {
        let mut state = get_state().lock().unwrap();
        state.monitored_model = Some(model);
        state.monitored_codex = None;
    }
    update_tray_only(&app_handle);
}

#[tauri::command]
fn set_monitored_codex(info: Option<CodexMonitoredInfo>, app_handle: tauri::AppHandle) {
    {
        let mut state = get_state().lock().unwrap();
        state.monitored_codex = info;
        if state.monitored_codex.is_some() {
            state.monitored_model = None;
        }
    }
    update_tray_only(&app_handle);
}

fn update_tray_only(app_handle: &tauri::AppHandle) {
    let (status_opt, monitored_codex) = {
        let state = get_state().lock().unwrap();
        (state.last_status.clone(), state.monitored_codex.clone())
    };

    let mut status = status_opt.unwrap_or(FullStatus {
        credits: None,
        quotas: Vec::new(),
        plan_tier: None,
        recently_used_model: None,
        monitored_codex: monitored_codex.clone(),
        email: None,
        online: false,
        source: None,
        accuracy: None,
    });
    status.monitored_codex = monitored_codex;

    let tooltip = format_tooltip(&status);
    if let Some(tray) = app_handle.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

#[tauri::command]
fn set_poll_interval(seconds: u64) {
    let mut state = get_state().lock().unwrap();
    state.poll_interval_secs = seconds;
}

#[tauri::command]
fn is_debug() -> bool {
    cfg!(debug_assertions)
}

#[tauri::command]
async fn execute_update(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("User-Agent", "QuotaShift")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to download update: status {}", res.status()));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;

    let file_name = if cfg!(target_os = "windows") {
        "update_setup.exe"
    } else {
        "update.deb"
    };

    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(file_name);

    std::fs::write(&temp_file_path, bytes).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&temp_file_path)
            .args(["/UPDATE", "/P", "/R"])
            .spawn()
            .map_err(|e| e.to_string())?;
        let manager = app_handle.state::<antigravity_worker::AntigravityWorkerManager>();
        let _ = manager.stop_all();
        app_handle.exit(0);
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&temp_file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
        app_handle.exit(0);
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = app_handle;
        return Err("Unsupported OS for auto update".to_string());
    }

    Ok(())
}

#[tauri::command]
fn export_backup_file(content: String) -> Result<String, String> {
    let home = session::get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let downloads = home.join("Downloads");
    
    if !downloads.exists() {
        std::fs::create_dir_all(&downloads).map_err(|e| format!("Failed to create Downloads folder: {}", e))?;
    }
    
    let file_path = downloads.join("quotashift_backup.json");
    std::fs::write(&file_path, content).map_err(|e| format!("Failed to write backup file: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}


// Codex config sync commands
#[tauri::command]
fn sync_codex_config(api_key: String, base_url: String, model: Option<String>) -> Result<(), String> {
    codex_sync::sync_codex_config(&api_key, &base_url, model.as_deref())
}

#[tauri::command]
fn sync_codex_provider_config(base_url: String, model: Option<String>) -> Result<(), String> {
    codex_sync::sync_codex_provider_config(&base_url, model.as_deref())
}

#[tauri::command]
fn get_codex_sync_status() -> Result<serde_json::Value, String> {
    codex_sync::get_codex_sync_status()
}

#[tauri::command]
fn restore_codex_config() -> Result<(), String> {
    codex_sync::restore_codex_config()
}

// Delegate oauth commands to oauth module
#[tauri::command]
async fn start_oauth_flow(app_handle: tauri::AppHandle) -> Result<String, String> {
    oauth::start_oauth_flow(&app_handle).await
}

#[tauri::command]
async fn exchange_oauth_token(code: String) -> Result<serde_json::Value, String> {
    oauth::exchange_oauth_token(code).await
}

#[tauri::command]
async fn fetch_chatgpt_workspaces(access_token: String) -> Result<serde_json::Value, String> {
    oauth::fetch_chatgpt_workspaces(access_token).await
}

#[tauri::command]
async fn fetch_chatgpt_usage(access_token: String, account_id: String) -> Result<serde_json::Value, String> {
    oauth::fetch_chatgpt_usage(access_token, Some(account_id)).await
}

#[tauri::command]
async fn refresh_chatgpt_token(refresh_token: String) -> Result<serde_json::Value, String> {
    oauth::refresh_chatgpt_token(refresh_token).await
}

#[tauri::command]
async fn reset_oauth_session() -> Result<(), String> {
    oauth::reset_oauth_session().await
}

#[tauri::command]
async fn start_antigravity_google_oauth(app_handle: tauri::AppHandle) -> Result<String, String> {
    oauth::start_antigravity_google_oauth(&app_handle).await
}

#[tauri::command]
async fn exchange_antigravity_google_token(code: String) -> Result<serde_json::Value, String> {
    oauth::exchange_antigravity_google_token(code).await
}

#[tauri::command]
async fn reset_google_oauth_session() -> Result<(), String> {
    oauth::reset_google_oauth_session().await
}

// Delegate session commands to session module
#[tauri::command]
async fn read_codex_auth() -> Result<Option<String>, String> {
    session::read_codex_auth().await
}

#[tauri::command]
async fn write_codex_auth(content: String) -> Result<(), String> {
    session::write_codex_auth(content).await
}

#[tauri::command]
async fn read_antigravity_session() -> Result<serde_json::Value, String> {
    session::read_antigravity_session().await
}

#[tauri::command]
async fn write_antigravity_session(
    token: String,
    refresh_token: Option<String>,
    profile_url: Option<String>,
    email: Option<String>,
) -> Result<(), String> {
    session::write_antigravity_session(token, refresh_token, profile_url, email).await
}

#[tauri::command]
async fn delete_antigravity_session() -> Result<(), String> {
    session::delete_antigravity_session().await
}

#[tauri::command]
async fn quit_antigravity_ide() -> Result<(), String> {
    session::quit_antigravity_ide().await
}

#[tauri::command]
async fn open_antigravity_ide() -> Result<(), String> {
    session::open_antigravity_ide().await
}

// Delegate quota commands to quota module
#[tauri::command]
async fn refresh_antigravity_token(
    refresh_token: String,
    auth_method: Option<String>,
) -> Result<serde_json::Value, String> {
    quota::refresh_antigravity_token(refresh_token, auth_method).await
}


// Keep-alive commands
#[tauri::command]
fn start_keep_alive(interval_mins: u64, app_handle: tauri::AppHandle) -> Result<(), String> {
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
fn stop_keep_alive() -> Result<(), String> {
    keep_alive::stop();
    antigravity_keep_alive::stop();
    Ok(())
}

#[tauri::command]
fn get_keep_alive_status() -> Result<serde_json::Value, String> {
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
fn sync_antigravity_keep_alive_accounts(
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



fn format_tooltip(status: &FullStatus) -> String {
    if let Some(codex) = &status.monitored_codex {
        let mut line = format!("Codex\n{}", codex.label);
        if let Some(p) = codex.primary_percent {
            line.push_str(&format!(": {}%", p));
            if let Some(s) = codex.secondary_percent {
                line.push_str(&format!("/{}%", s));
            }
        } else {
            line.push_str(": —");
        }
        line
    } else {
        let gemini = status.quotas.iter().find(|q| q.model.contains("Gemini") || q.model.to_lowercase().contains("google"));
        let claude_openai = status.quotas.iter().find(|q| q.model.contains("Claude") || q.model.contains("OpenAI") || q.model.to_lowercase().contains("gpt"));
        
        let mut lines = vec!["Antigravity".to_string()];
        
        match gemini {
            Some(q) => {
                let fh = q.five_hour_percent.map(|v| v.to_string()).unwrap_or_else(|| "?".to_string());
                let wk = q.weekly_percent.map(|v| v.to_string()).unwrap_or_else(|| "?".to_string());
                lines.push(format!("Google Gemini: {}%/{}%", fh, wk));
            }
            None => {
                lines.push("Google Gemini: —".to_string());
            }
        }
        
        match claude_openai {
            Some(q) => {
                let fh = q.five_hour_percent.map(|v| v.to_string()).unwrap_or_else(|| "?".to_string());
                let wk = q.weekly_percent.map(|v| v.to_string()).unwrap_or_else(|| "?".to_string());
                lines.push(format!("Claude & OpenAI: {}%/{}%", fh, wk));
            }
            None => {
                lines.push("Claude & OpenAI: —".to_string());
            }
        }
        
        lines.join("\n")
    }
}

async fn poll_and_update_tray(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let res = quota::fetch_full_status_internal().await;
    match res {
        Ok(status) => {
            {
                let mut state = get_state().lock().unwrap();
                state.last_status = Some(status.clone());
            }
            let _ = app_handle.emit("status-updated", &status);
            let tooltip = format_tooltip(&status);
            if let Some(tray) = app_handle.tray_by_id("main") {
                let _ = tray.set_tooltip(Some(tooltip));
            }
            Ok(())
        }
        Err(_) => {
            let monitored_codex = {
                let state = get_state().lock().unwrap();
                state.monitored_codex.clone()
            };
            let status = FullStatus {
                credits: None,
                quotas: Vec::new(),
                plan_tier: None,
                recently_used_model: None,
                monitored_codex,
                email: None,
                online: false,
                source: None,
                accuracy: None,
            };
            let _ = app_handle.emit("status-updated", &status);
            if let Some(tray) = app_handle.tray_by_id("main") {
                let _ = tray.set_tooltip(Some(
                    "QuotaShift: offline\n⚠️ Language server not reachable.".to_string(),
                ));
            }
            Err("Offline".to_string())
        }
    }
}

fn position_window(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let scale_factor = monitor.scale_factor();

        let win_w = (680.0 * scale_factor) as i32;
        let win_h = (760.0 * scale_factor) as i32;
        let padding = (12.0 * scale_factor) as i32;
        let taskbar_h = (48.0 * scale_factor) as i32;

        let x = monitor_pos.x + monitor_size.width as i32 - win_w - padding;
        let y = monitor_pos.y + monitor_size.height as i32 - win_h - taskbar_h - padding;

        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

fn panel_clock_ms() -> u64 {
    PANEL_CLOCK
        .get_or_init(Instant::now)
        .elapsed()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

fn arm_panel_focus_guard() {
    PANEL_FOCUS_GUARD_UNTIL_MS.store(
        panel_clock_ms().saturating_add(PANEL_FOCUS_GUARD_MS),
        Ordering::Relaxed,
    );
}

fn should_hide_panel_on_focus_loss() -> bool {
    panel_clock_ms() >= PANEL_FOCUS_GUARD_UNTIL_MS.load(Ordering::Relaxed)
}

fn show_panel(window: &tauri::WebviewWindow) {
    position_window(window);
    arm_panel_focus_guard();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("window-shown", true);
}

pub fn setup_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon_bytes = include_bytes!("../icons/32x32.png");
    let tray_icon = tauri::image::Image::from_bytes(icon_bytes).expect("Failed to load tray icon");

    let _tray = TrayIconBuilder::with_id("main")
        .tooltip("QuotaShift")
        .icon(tray_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    show_panel(&window);
                }
            }
            "quit" => {
                let manager = app.state::<antigravity_worker::AntigravityWorkerManager>();
                let _ = manager.stop_all();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Down,
                    ..
                } => {
                    // Windows can emit Focused(false) while the tray click is
                    // still in progress. Guard that transient blur so the
                    // visibility toggle on mouse-up sees the real panel state.
                    arm_panel_focus_guard();
                }
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            show_panel(&window);
                        }
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                show_panel(&window);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(antigravity_worker::AntigravityWorkerManager::default())
        .invoke_handler(tauri::generate_handler![
            get_quota_status,
            force_refresh,
            set_monitored_model,
            set_monitored_codex,
            set_poll_interval,
            is_debug,
            execute_update,
            start_oauth_flow,
            exchange_oauth_token,
            fetch_chatgpt_workspaces,
            fetch_chatgpt_usage,
            refresh_chatgpt_token,
            reset_oauth_session,
            start_antigravity_google_oauth,
            exchange_antigravity_google_token,
            reset_google_oauth_session,
            read_codex_auth,
            write_codex_auth,
            read_antigravity_session,
            write_antigravity_session,
            delete_antigravity_session,
            quit_antigravity_ide,
            open_antigravity_ide,
            export_backup_file,
            antigravity_usage::fetch_antigravity_account_usage,
            refresh_antigravity_token,
            sync_codex_config,
            sync_codex_provider_config,
            get_codex_sync_status,
            restore_codex_config,
            start_keep_alive,
            stop_keep_alive,
            get_keep_alive_status,
            sync_antigravity_keep_alive_accounts,
            antigravity_worker::refresh_antigravity_accounts_exact,
            antigravity_worker::stop_antigravity_worker,
            antigravity_worker::stop_all_antigravity_workers,
            antigravity_worker::get_antigravity_worker_statuses,
        ])
        .setup(|app| {
            let _ = setup_tray(app.handle());
            antigravity_worker::cleanup_stale_owned_workers();

            // Pre-fetch Codex OAuth client_id from openai/codex GitHub raw
            // (cached to ~/.quotashift/codex_client_id.txt so future starts work offline).
            crate::oauth::spawn_codex_client_id_prefetch();

            // Pre-fetch Antigravity consumer Google OAuth client_id + secret
            // from skainguyen1412/antigravity-usage GitHub raw. Cached to
            // ~/.quotashift/ag_client_id.txt and ag_client_secret.txt so future
            // starts work even when GitHub is unreachable.
            crate::credential_store::spawn_ag_consumer_credentials_prefetch();

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let _ = poll_and_update_tray(&app_handle).await;
                    let interval = {
                        let state = get_state().lock().unwrap();
                        state.poll_interval_secs
                    };
                    tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
                }
            });

            // Existing local-session/Codex maintenance.
            tauri::async_runtime::spawn(keep_alive::run_background());

            // Maintain every monitored Antigravity account independently.
            let keep_alive_app = app.handle().clone();
            tauri::async_runtime::spawn(antigravity_keep_alive::run_background(keep_alive_app));

            let main_window = app.get_webview_window("main").unwrap();
            
            let win_icon_bytes = include_bytes!("../icons/128x128.png");
            if let Ok(win_icon) = tauri::image::Image::from_bytes(win_icon_bytes) {
                let _ = main_window.set_icon(win_icon);
            }

            let w_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    if should_hide_panel_on_focus_loss() {
                        let _ = w_clone.hide();
                    }
                }
            });

            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                let border_window = app.get_webview_window("main").unwrap();
                if let Ok(handle) = border_window.window_handle() {
                    if let RawWindowHandle::Win32(h) = handle.as_raw() {
                        dwm::remove_border(h.hwnd.get() as *mut std::ffi::c_void);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}