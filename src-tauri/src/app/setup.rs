use tauri::{App, Manager};

use crate::window_manager::poll_and_update_tray;
use crate::{
    antigravity_keep_alive, antigravity_worker, codex_sync, get_state, keep_alive, logger,
};

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
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

    if let Err(e) = crate::setup_tray(app.handle()) {
        logger::log_error("tray", &format!("setup_tray failed during setup: {}", e));
    }
    antigravity_worker::cleanup_stale_owned_workers();

    crate::oauth::spawn_codex_client_id_prefetch();
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

    tauri::async_runtime::spawn(keep_alive::run_background());

    let keep_alive_app = app.handle().clone();
    tauri::async_runtime::spawn(antigravity_keep_alive::run_background(keep_alive_app));

    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Some(border_window) = app.get_webview_window("main") {
            if let Ok(handle) = border_window.window_handle() {
                if let RawWindowHandle::Win32(h) = handle.as_raw() {
                    logger::log_info("window", "Removing Windows DWM border");
                    crate::dwm::remove_border(h.hwnd.get() as *mut std::ffi::c_void);
                }
            }
        }

        if let Some(overlay_window) = app.get_webview_window("overlay") {
            if let Ok(handle) = overlay_window.window_handle() {
                if let RawWindowHandle::Win32(h) = handle.as_raw() {
                    logger::log_info("window", "Removing Windows DWM border on overlay window");
                    crate::dwm::remove_border(h.hwnd.get() as *mut std::ffi::c_void);
                    logger::log_info("window", "Attaching overlay window screen clamp");
                    crate::overlay_clamp::clamp_overlay_window_to_screen(
                        h.hwnd.get() as *mut std::ffi::c_void
                    );
                }
            }
        }

        if let Some(tooltip_window) = app.get_webview_window("overlay-tooltip") {
            if let Ok(handle) = tooltip_window.window_handle() {
                if let RawWindowHandle::Win32(h) = handle.as_raw() {
                    logger::log_info(
                        "window",
                        "Removing Windows DWM border on overlay-tooltip window",
                    );
                    crate::dwm::remove_border(h.hwnd.get() as *mut std::ffi::c_void);
                    crate::dwm::make_window_click_through(h.hwnd.get() as *mut std::ffi::c_void);
                }
            }
        }
    }

    if let Some(overlay_window) = app.get_webview_window("overlay") {
        logger::log_info("app", "Configuring overlay window default position");
        if let Ok(Some(monitor)) = overlay_window.primary_monitor() {
            let monitor_size = monitor.size();
            let monitor_pos = monitor.position();
            let scale = monitor.scale_factor();
            let w = (340.0 * scale) as i32;
            let h = (100.0 * scale) as i32;
            let pad = (20.0 * scale) as i32;
            let taskbar_h = (50.0 * scale) as i32;
            let x = monitor_pos.x + monitor_size.width as i32 - w - pad;
            let y = monitor_pos.y + monitor_size.height as i32 - h - taskbar_h - pad;
            let _ = overlay_window.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }

    logger::log_info("app", "QuotaShift setup finished successfully");
    Ok(())
}
