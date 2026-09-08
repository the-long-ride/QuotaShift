use std::process::Command;
use std::sync::{
    atomic::{AtomicI64, AtomicU64, Ordering},
    Mutex, OnceLock,
};
use std::time::Instant;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

mod antigravity_exact;
mod antigravity_keep_alive;
mod antigravity_quota;
mod antigravity_remote;
mod antigravity_token;
mod antigravity_usage;
mod antigravity_worker;
mod codex_models;
mod codex_router;
mod codex_sync;
mod credential_store;
mod dwm;
mod keep_alive;
pub mod logger;
mod oauth;
mod parser;
mod process;
mod quota;
mod secrets;
mod session;
mod types;

use types::{AppState, CodexMonitoredInfo, FullStatus};

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
        return Err(format!(
            "Failed to download update: status {}",
            res.status()
        ));
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

    let router = app_handle.state::<codex_router::CodexRouterManager>();
    router
        .stop_listener()
        .await
        .map_err(|error| format!("Failed to stop Codex router before update: {error}"))?;

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

// Codex config sync commands
#[tauri::command]
fn sync_codex_config(
    api_key: String,
    base_url: String,
    model: Option<String>,
) -> Result<(), String> {
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
async fn fetch_chatgpt_usage(
    access_token: String,
    account_id: String,
) -> Result<serde_json::Value, String> {
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
async fn switch_antigravity_account(
    token: String,
    refresh_token: Option<String>,
    profile_url: Option<String>,
    email: Option<String>,
) -> Result<session::AntigravitySwitchResult, String> {
    session::switch_antigravity_account(token, refresh_token, profile_url, email).await
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
        let gemini = status
            .quotas
            .iter()
            .find(|q| q.model.contains("Gemini") || q.model.to_lowercase().contains("google"));
        let claude_openai = status.quotas.iter().find(|q| {
            q.model.contains("Claude")
                || q.model.contains("OpenAI")
                || q.model.to_lowercase().contains("gpt")
        });

        let mut lines = vec!["Antigravity".to_string()];

        match gemini {
            Some(q) => {
                let fh = q
                    .five_hour_percent
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "?".to_string());
                let wk = q
                    .weekly_percent
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "?".to_string());
                lines.push(format!("Google Gemini: {}%/{}%", fh, wk));
            }
            None => {
                lines.push("Google Gemini: —".to_string());
            }
        }

        match claude_openai {
            Some(q) => {
                let fh = q
                    .five_hour_percent
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "?".to_string());
                let wk = q
                    .weekly_percent
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "?".to_string());
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

static LAST_SHOWN_TIMESTAMP_MS: AtomicI64 = AtomicI64::new(0);

#[tauri::command]
fn log_from_frontend(level: String, tag: String, message: String) {
    logger::write_log(&level, &format!("frontend:{}", tag), &message);
}

#[tauri::command]
fn open_devtools(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        logger::log_info("window", "open_devtools command executed");
        window.open_devtools();
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
fn get_log_file_path() -> Result<String, String> {
    logger::get_log_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine log file path".to_string())
}

#[tauri::command]
fn open_logs_folder() -> Result<(), String> {
    if let Some(dir) = logger::get_log_dir() {
        logger::log_info("window", &format!("Opening logs folder: {:?}", dir));
        #[cfg(target_os = "windows")]
        let _ = std::process::Command::new("explorer")
            .arg(dir.to_string_lossy().to_string())
            .spawn();
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open")
            .arg(dir.to_string_lossy().to_string())
            .spawn();
        #[cfg(target_os = "linux")]
        let _ = std::process::Command::new("xdg-open")
            .arg(dir.to_string_lossy().to_string())
            .spawn();
        Ok(())
    } else {
        Err("Could not determine log directory".to_string())
    }
}

pub fn show_main_dashboard(app: &AppHandle, source: &str) {
    logger::log_info(
        "window",
        &format!("show_main_dashboard requested by '{}'", source),
    );
    if let Some(window) = app.get_webview_window("main") {
        position_window(&window);
        arm_panel_focus_guard();
        match window.show() {
            Ok(_) => logger::log_info("window", "window.show() succeeded"),
            Err(e) => logger::log_error("window", &format!("window.show() failed: {}", e)),
        }
        match window.set_focus() {
            Ok(_) => logger::log_info("window", "window.set_focus() succeeded"),
            Err(e) => logger::log_error("window", &format!("window.set_focus() failed: {}", e)),
        }
        match window.emit("window-shown", true) {
            Ok(_) => logger::log_info("window", "window.emit('window-shown') succeeded"),
            Err(e) => logger::log_error(
                "window",
                &format!("window.emit('window-shown') failed: {}", e),
            ),
        }
        LAST_SHOWN_TIMESTAMP_MS.store(chrono::Utc::now().timestamp_millis(), Ordering::SeqCst);
        logger::log_info(
            "window",
            &format!(
                "Window state after show: is_visible={:?}, is_focused={:?}",
                window.is_visible(),
                window.is_focused()
            ),
        );
    } else {
        logger::log_error(
            "window",
            "show_main_dashboard: WebviewWindow 'main' not found!",
        );
    }
}

pub fn toggle_main_dashboard(app: &AppHandle, source: &str) {
    logger::log_info(
        "window",
        &format!("toggle_main_dashboard requested by '{}'", source),
    );
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        logger::log_info(
            "window",
            &format!("Current window visibility: {}", is_visible),
        );
        if is_visible {
            logger::log_info("window", "Window is visible -> hiding window");
            match window.hide() {
                Ok(_) => logger::log_info("window", "window.hide() succeeded"),
                Err(e) => logger::log_error("window", &format!("window.hide() failed: {}", e)),
            }
        } else {
            show_main_dashboard(app, source);
        }
    } else {
        logger::log_error(
            "window",
            "toggle_main_dashboard: WebviewWindow 'main' not found!",
        );
    }
}

fn position_window(window: &tauri::WebviewWindow) {
    logger::log_info("window", "position_window: calculating window position...");
    let primary_res = window.primary_monitor();
    let current_res = window.current_monitor();
    let cursor_pos = window.cursor_position();

    logger::log_info(
        "window",
        &format!(
            "position_window query: primary_monitor={:?}, current_monitor={:?}, cursor_position={:?}",
            primary_res.as_ref().map(|r| r.as_ref().map(|m| (m.name(), m.size(), m.position(), m.scale_factor()))),
            current_res.as_ref().map(|r| r.as_ref().map(|m| (m.name(), m.size(), m.position(), m.scale_factor()))),
            cursor_pos
        ),
    );

    let monitor = match primary_res {
        Ok(Some(m)) => {
            logger::log_info("window", "Using primary monitor for positioning");
            Some(m)
        }
        Ok(None) => {
            logger::log_warn(
                "window",
                "primary_monitor returned None, falling back to current_monitor",
            );
            current_res.ok().flatten()
        }
        Err(e) => {
            logger::log_error(
                "window",
                &format!("Failed to retrieve primary_monitor: {}, falling back", e),
            );
            current_res.ok().flatten()
        }
    };

    if let Some(monitor) = monitor {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let scale_factor = monitor.scale_factor();

        let win_w = (680.0 * scale_factor) as i32;
        let win_h = (760.0 * scale_factor) as i32;
        let padding = (12.0 * scale_factor) as i32;
        let taskbar_h = (48.0 * scale_factor) as i32;

        let x = monitor_pos.x + monitor_size.width as i32 - win_w - padding;
        let y = monitor_pos.y + monitor_size.height as i32 - win_h - taskbar_h - padding;

        logger::log_info(
            "window",
            &format!(
                "Calculated position: x={}, y={} (monitor_pos=({},{}), monitor_size={}x{}, win_size={}x{}, scale={})",
                x, y, monitor_pos.x, monitor_pos.y, monitor_size.width, monitor_size.height, win_w, win_h, scale_factor
            ),
        );

        match window.set_position(tauri::PhysicalPosition::new(x, y)) {
            Ok(_) => logger::log_info(
                "window",
                &format!("window.set_position({}, {}) succeeded", x, y),
            ),
            Err(e) => logger::log_error(
                "window",
                &format!("window.set_position({}, {}) failed: {}", x, y, e),
            ),
        }
    } else {
        logger::log_error(
            "window",
            "position_window: No monitor available to position window!",
        );
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

#[allow(dead_code)]
fn show_panel(window: &tauri::WebviewWindow) {
    show_main_dashboard(&window.app_handle(), "show_panel");
}

pub fn setup_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    logger::log_info("tray", "setup_tray: Initializing tray icon and menu...");

    let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
    let devtools = MenuItem::with_id(app, "devtools", "Open DevTools (Debug)", true, None::<&str>)?;
    let logs = MenuItem::with_id(app, "logs", "Open Logs Folder", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &devtools, &logs, &quit])?;

    let icon_bytes = include_bytes!("../icons/32x32.png");
    let tray_icon = match tauri::image::Image::from_bytes(icon_bytes) {
        Ok(img) => {
            logger::log_info(
                "tray",
                "setup_tray: Successfully loaded tray icon image (32x32.png)",
            );
            img
        }
        Err(e) => {
            logger::log_error(
                "tray",
                &format!("setup_tray: Failed to load tray icon image: {}", e),
            );
            return Err(e.into());
        }
    };

    let tray_build_res =
        TrayIconBuilder::with_id("main")
            .tooltip("QuotaShift")
            .icon(tray_icon)
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| {
                let id = event.id.as_ref();
                logger::log_info("tray", &format!("Tray menu item clicked: '{}'", id));
                match id {
                    "show" => {
                        show_main_dashboard(app, "tray_menu_show");
                    }
                    "devtools" => {
                        if let Some(window) = app.get_webview_window("main") {
                            logger::log_info("window", "Opening devtools via tray menu");
                            window.open_devtools();
                            show_main_dashboard(app, "tray_menu_devtools");
                        } else {
                            logger::log_error(
                                "window",
                                "Cannot open devtools: 'main' window not found",
                            );
                        }
                    }
                    "logs" => {
                        if let Some(dir) = logger::get_log_dir() {
                            logger::log_info("tray", &format!("Opening logs directory: {:?}", dir));
                            #[cfg(target_os = "windows")]
                            let _ = std::process::Command::new("explorer")
                                .arg(dir.to_string_lossy().to_string())
                                .spawn();
                            #[cfg(target_os = "macos")]
                            let _ = std::process::Command::new("open")
                                .arg(dir.to_string_lossy().to_string())
                                .spawn();
                            #[cfg(target_os = "linux")]
                            let _ = std::process::Command::new("xdg-open")
                                .arg(dir.to_string_lossy().to_string())
                                .spawn();
                        }
                    }

                    "quit" => {
                        logger::log_info("tray", "Quit requested from tray menu");
                        let router = app.state::<codex_router::CodexRouterManager>();
                        match tauri::async_runtime::block_on(router.stop_listener()) {
                            Ok(_) => {
                                let manager = app.state::<antigravity_worker::AntigravityWorkerManager>();
                                let _ = manager.stop_all();
                                app.exit(0);
                            }
                            Err(error) => {
                                // stop_listener already calls restore internally; if it fails, try directly
                                logger::log_error(
                                    "codex_router",
                                    &format!("Codex router stop_listener failed: {error} — forcing restore and exit"),
                                );
                                restore_router_config_on_exit("tray_quit_fallback");
                                let manager = app.state::<antigravity_worker::AntigravityWorkerManager>();
                                let _ = manager.stop_all();
                                app.exit(0);
                            }
                        }
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                logger::log_info("tray", &format!("TrayIconEvent: {:?}", event));
                match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Down,
                        ..
                    } => {
                        logger::log_info(
                            "tray",
                            "TrayIconEvent: Left click (Down) -> arming panel focus guard",
                        );
                        arm_panel_focus_guard();
                    }
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        logger::log_info(
                        "tray",
                        "TrayIconEvent: Left click (MouseButtonState::Up) -> toggling dashboard",
                    );
                        toggle_main_dashboard(tray.app_handle(), "tray_left_click_up");
                    }
                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => {
                        logger::log_info(
                            "tray",
                            "TrayIconEvent: Left DoubleClick -> showing dashboard",
                        );
                        show_main_dashboard(tray.app_handle(), "tray_double_click");
                    }
                    _ => {}
                }
            })
            .build(app);

    match &tray_build_res {
        Ok(_) => logger::log_info("tray", "setup_tray: Tray created successfully"),
        Err(e) => logger::log_error("tray", &format!("setup_tray: Failed to create tray: {}", e)),
    }

    tray_build_res.map(|_| ())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            logger::log_info(
                "single_instance",
                &format!("Single instance event: argv={:?}, cwd={:?}", argv, cwd),
            );
            show_main_dashboard(app, "single_instance_launch");
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(antigravity_worker::AntigravityWorkerManager::default())
        .manage(codex_router::CodexRouterManager::default())
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
            codex_models::fetch_chatgpt_models,
            refresh_chatgpt_token,
            reset_oauth_session,
            start_antigravity_google_oauth,
            exchange_antigravity_google_token,
            reset_google_oauth_session,
            read_codex_auth,
            write_codex_auth,
            read_antigravity_session,
            write_antigravity_session,
            switch_antigravity_account,
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
codex_router::start_codex_router,
codex_router::stop_codex_router,
codex_router::configure_codex_router,
codex_router::get_codex_router_status,
            start_keep_alive,
            stop_keep_alive,
            get_keep_alive_status,
            sync_antigravity_keep_alive_accounts,
            antigravity_worker::refresh_antigravity_accounts_exact,
            antigravity_worker::stop_antigravity_worker,
            antigravity_worker::stop_all_antigravity_workers,
            antigravity_worker::get_antigravity_worker_statuses,
            log_from_frontend,
            open_devtools,
            get_log_file_path,
            open_logs_folder,
        ])
        .setup(|app| {
            logger::log_info("app", "QuotaShift setup starting...");

match codex_sync::recover_stale_codex_router_config() {
    Ok(true) => logger::log_warn(
        "codex_router",
        "Recovered stale Codex provider config left by a previous router session",
    ),
    Ok(false) => {}
    Err(error) => logger::log_error(
        "codex_router",
        &format!("Failed stale Codex router config recovery: {error}"),
    ),
}
            if let Err(e) = setup_tray(app.handle()) {
                logger::log_error("tray", &format!("setup_tray failed during setup: {}", e));
            }
            antigravity_worker::cleanup_stale_owned_workers();

            // Pre-fetch Codex OAuth client_id from openai/codex GitHub raw
            crate::oauth::spawn_codex_client_id_prefetch();

            // Pre-fetch Antigravity consumer Google OAuth client_id + secret
            crate::credential_store::spawn_ag_consumer_credentials_prefetch();

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                logger::log_info("poll", "Starting background tray polling loop");
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

            let main_window = match app.get_webview_window("main") {
                Some(w) => {
                    logger::log_info("app", "Obtained 'main' WebviewWindow successfully");
                    w
                }
                None => {
                    logger::log_error("app", "CRITICAL: 'main' WebviewWindow NOT found in setup!");
                    panic!("'main' WebviewWindow not found");
                }
            };

            let win_icon_bytes = include_bytes!("../icons/128x128.png");
            if let Ok(win_icon) = tauri::image::Image::from_bytes(win_icon_bytes) {
                let _ = main_window.set_icon(win_icon);
            }

            let w_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Focused(focused) => {
                        let now = chrono::Utc::now().timestamp_millis();
                        let last_shown = LAST_SHOWN_TIMESTAMP_MS.load(Ordering::SeqCst);
                        let elapsed = now - last_shown;
                        logger::log_info(
                            "window",
                            &format!(
                                "WindowEvent::Focused({}): elapsed since last show: {}ms",
                                focused, elapsed
                            ),
                        );
                        if !focused {
                            if !should_hide_panel_on_focus_loss() {
                                logger::log_warn(
                                    "window",
                                    &format!(
                                        "Focus guard active (elapsed: {}ms) -> IGNORING transient blur event!",
                                        elapsed
                                    ),
                                );
                            } else {
                                logger::log_info("window", "Focused(false) received -> hiding window");
                                match w_clone.hide() {
                                    Ok(_) => logger::log_info("window", "w_clone.hide() succeeded"),
                                    Err(e) => logger::log_error("window", &format!("w_clone.hide() failed: {}", e)),
                                }
                            }
                        }
                    }
                    tauri::WindowEvent::Moved(pos) => {
                        logger::log_info("window", &format!("WindowEvent::Moved to {:?}", pos));
                    }
                    tauri::WindowEvent::Resized(size) => {
                        logger::log_info("window", &format!("WindowEvent::Resized to {:?}", size));
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        logger::log_info("window", "WindowEvent::CloseRequested -> preventing close, hiding instead");
                        api.prevent_close();
                        let _ = w_clone.hide();
                    }
                    tauri::WindowEvent::Destroyed => {
                        logger::log_warn("window", "WindowEvent::Destroyed");
                    }
                    _ => {}
                }
            });

            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                if let Some(border_window) = app.get_webview_window("main") {
                    if let Ok(handle) = border_window.window_handle() {
                        if let RawWindowHandle::Win32(h) = handle.as_raw() {
                            logger::log_info("window", "Removing Windows DWM border");
                            dwm::remove_border(h.hwnd.get() as *mut std::ffi::c_void);
                        }
                    }
                }
            }

            logger::log_info("app", "QuotaShift setup finished successfully");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                restore_router_config_on_exit("RunEvent::Exit");
            }
        });
}

/// Best-effort synchronous restore of `config.toml` when the app is exiting.
/// Called from both the tray quit path and the RunEvent exit hook.
pub(crate) fn restore_router_config_on_exit(source: &str) {
    match codex_sync::restore_codex_router_config() {
        Ok(()) => logger::log_info(
            "codex_router",
            &format!("[{source}] Codex provider config restored on exit"),
        ),
        Err(error) => logger::log_warn(
            "codex_router",
            &format!("[{source}] Failed to restore Codex provider config on exit: {error}"),
        ),
    }
}
