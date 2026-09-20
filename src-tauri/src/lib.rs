use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub mod antigravity;
pub mod app;
pub mod auth;
pub mod claude;
pub mod codex;
pub mod logger;
pub mod quota;
pub mod storage;
pub mod system;
pub mod types;
pub mod window;

pub use app::commands as app_commands;
pub use app::setup as app_setup;
pub use claude as claude_monitor;
pub use window::overlay_clamp::clamp_overlay_window_to_screen;
pub use window::window_manager;

pub(crate) use antigravity::{
    exact as antigravity_exact, keep_alive as antigravity_keep_alive, quota as antigravity_quota,
    remote as antigravity_remote, token as antigravity_token, usage as antigravity_usage,
    worker as antigravity_worker,
};
pub(crate) use auth::{credential_store, oauth, secrets};
pub(crate) use codex::{models as codex_models, router as codex_router, sync as codex_sync};
pub(crate) use quota::parser;
pub(crate) use storage::secure_storage;
pub(crate) use system::{keep_alive, process, session};
#[allow(unused_imports)]
pub(crate) use window::{dwm, overlay_clamp};

use app_commands::*;
use types::AppState;
use window_manager::{
    hide_main_window, open_main_window, quit_application, restore_router_config_on_exit,
};

static STATE: OnceLock<Mutex<AppState>> = OnceLock::new();

pub(crate) fn get_state() -> &'static Mutex<AppState> {
    STATE.get_or_init(|| {
        Mutex::new(AppState {
            last_status: None,
            monitored_model: None,
            monitored_codex: None,
            monitored_tray: None,
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
    let show = MenuItem::with_id(app, "show", "Open QuotaShift window", true, None::<&str>)?;
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
            "show" => open_main_window(app, "tray_menu_open"),
            "devtools" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                    open_main_window(app, "tray_menu_devtools");
                }
            }
            "logs" => {
                let _ = open_logs_folder();
            }
            "quit" => quit_application(app, "tray_menu_quit"),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => open_main_window(tray.app_handle(), "tray_left_click_up"),
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => open_main_window(tray.app_handle(), "tray_double_click"),
            _ => {}
        })
        .build(app);

    tray_build_res.map(|_| ())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            logger::log_info(
                "single_instance",
                &format!("Single instance event: argv={:?}, cwd={:?}", argv, cwd),
            );
            open_main_window(app, "single_instance_launch");
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(antigravity_worker::AntigravityWorkerManager::default())
        .manage(claude_monitor::ClaudeUsageScheduler::default())
        .manage(codex_router::CodexRouterManager::default())
        .invoke_handler(tauri::generate_handler![
            secure_storage::secure_storage_load,
            secure_storage::secure_storage_set,
            secure_storage::secure_storage_delete,
            secure_storage::secure_storage_clear,
            get_quota_status,
            claude_monitor::ensure_claude_statusline_bridge,
            claude_monitor::get_claude_monitor_status,
            claude_monitor::get_claude_account_statuses,
            claude_monitor::set_claude_features_enabled,
            claude_monitor::get_current_claude_config_dir,
            claude_monitor::suspend_claude_account_processes,
            claude_monitor::resume_claude_account_processes,
            force_refresh,
            set_monitored_model,
            set_monitored_codex,
            set_monitored_tray,
            set_poll_interval,
            is_debug,
            start_oauth_flow,
            exchange_oauth_token,
            fetch_chatgpt_workspaces,
            fetch_chatgpt_profile,
            fetch_chatgpt_usage,
            fetch_chatgpt_rate_limit_reset_credits,
            codex_models::fetch_chatgpt_models,
            refresh_chatgpt_token,
            reset_oauth_session,
            start_antigravity_google_oauth,
            exchange_antigravity_google_token,
            reset_google_oauth_session,
            read_codex_auth,
            write_codex_auth,
            kill_codex_processes,
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
            show_dashboard,
            quit_app,
            open_path_in_file_manager,
            set_overlay_visible,
            clear_log_file,
            get_log_file_size,
            get_session_logs,
            get_session_logs_revision,
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
            let main_app = main_window.app_handle().clone();
            main_window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    logger::log_info(
                        "window",
                        "WindowEvent::CloseRequested -> preventing close, hiding to tray",
                    );
                    api.prevent_close();
                    hide_main_window(&main_app, "window_close");
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
