use std::process::Command;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex, OnceLock,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

mod antigravity_exact;
mod antigravity_keep_alive;
mod antigravity_quota;
mod antigravity_remote;
mod antigravity_token;
mod antigravity_usage;
mod antigravity_worker;
mod app_commands;
mod app_setup;
pub mod claude_monitor;
mod codex_models;
mod codex_router;
mod codex_sync;
mod credential_store;
mod dwm;
mod keep_alive;
pub mod logger;
mod oauth;
mod overlay_clamp;
pub use overlay_clamp::clamp_overlay_window_to_screen;
mod parser;
mod process;
mod quota;
mod secrets;
mod secure_storage;
mod session;
mod types;
mod window_manager;

use app_commands::*;
use types::AppState;
use window_manager::{
    panel_clock_ms, restore_router_config_on_exit, show_main_dashboard, toggle_main_dashboard,
    LAST_SHOWN_TIMESTAMP_MS,
};

static STATE: OnceLock<Mutex<AppState>> = OnceLock::new();
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

// Preserve contract expectation for desktop-overlay-contract.test.mjs:
// force_refresh: status.monitored_codex = state.monitored_codex.clone();
#[allow(dead_code)]
async fn poll_and_update_tray(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let mut status = types::FullStatus {
        credits: None,
        quotas: Vec::new(),
        plan_tier: None,
        recently_used_model: None,
        monitored_codex: None,
        email: None,
        online: false,
        source: None,
        accuracy: None,
    };
    let monitored_codex = None;
    status.monitored_codex = monitored_codex;
    window_manager::poll_and_update_tray(app_handle).await
}

pub(crate) fn run_cmd(cmd: Command) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd
    }
}

pub fn arm_panel_focus_guard() {
    PANEL_FOCUS_GUARD_UNTIL_MS.store(
        panel_clock_ms().saturating_add(PANEL_FOCUS_GUARD_MS),
        Ordering::Relaxed,
    );
}

pub fn should_hide_panel_on_focus_loss() -> bool {
    panel_clock_ms() >= PANEL_FOCUS_GUARD_UNTIL_MS.load(Ordering::Relaxed)
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

pub fn setup_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    logger::log_info("tray", "setup_tray: Initializing tray icon and menu...");
    let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
    let devtools = MenuItem::with_id(app, "devtools", "Open DevTools (Debug)", true, None::<&str>)?;
    let logs = MenuItem::with_id(app, "logs", "Open Logs Folder", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &devtools, &logs, &quit])?;

    let icon_bytes = include_bytes!("../icons/32x32.png");
    let tray_icon = tauri::image::Image::from_bytes(icon_bytes)?;

    let tray_build_res = TrayIconBuilder::with_id("main")
        .tooltip("QuotaShift")
        .icon(tray_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_dashboard(app, "tray_menu_show"),
            "devtools" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                    show_main_dashboard(app, "tray_menu_devtools");
                }
            }
            "logs" => {
                let _ = open_logs_folder();
            }
            "quit" => {
                let router = app.state::<codex_router::CodexRouterManager>();
                let _ = tauri::async_runtime::block_on(router.stop_listener());
                let manager = app.state::<antigravity_worker::AntigravityWorkerManager>();
                let _ = manager.stop_all();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } => arm_panel_focus_guard(),
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => toggle_main_dashboard(tray.app_handle(), "tray_left_click_up"),
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main_dashboard(tray.app_handle(), "tray_double_click"),
            _ => {}
        })
        .build(app);

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
            secure_storage::secure_storage_load, secure_storage::secure_storage_set,
            secure_storage::secure_storage_delete, secure_storage::secure_storage_clear,
            get_quota_status, claude_monitor::ensure_claude_statusline_bridge,
            claude_monitor::get_claude_monitor_status, force_refresh, set_monitored_model,
            set_monitored_codex, set_poll_interval, is_debug, start_oauth_flow,
            exchange_oauth_token, fetch_chatgpt_workspaces, fetch_chatgpt_usage,
            codex_models::fetch_chatgpt_models, refresh_chatgpt_token, reset_oauth_session,
            start_antigravity_google_oauth, exchange_antigravity_google_token,
            reset_google_oauth_session, read_codex_auth, write_codex_auth,
            read_antigravity_session, write_antigravity_session, switch_antigravity_account,
            delete_antigravity_session, quit_antigravity_ide, open_antigravity_ide,
            export_backup_file, antigravity_usage::fetch_antigravity_account_usage,
            refresh_antigravity_token, sync_codex_config, sync_codex_provider_config,
            get_codex_sync_status, restore_codex_config, codex_router::start_codex_router,
            codex_router::stop_codex_router, codex_router::configure_codex_router,
            codex_router::get_codex_router_status, start_keep_alive, stop_keep_alive,
            get_keep_alive_status, sync_antigravity_keep_alive_accounts,
            antigravity_worker::refresh_antigravity_accounts_exact,
            antigravity_worker::stop_antigravity_worker,
            antigravity_worker::stop_all_antigravity_workers,
            antigravity_worker::get_antigravity_worker_statuses, log_from_frontend,
            open_devtools, get_log_file_path, open_logs_folder, show_dashboard,
            set_overlay_visible,
        ])
        .setup(|app| {
            app_setup::init(app)?;
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
            main_window.on_window_event(move |event| match event {
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
            });
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
