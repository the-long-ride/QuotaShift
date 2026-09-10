use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::OnceLock;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

use crate::types::FullStatus;
use crate::{get_state, logger};

static PANEL_CLOCK: OnceLock<Instant> = OnceLock::new();
pub static LAST_SHOWN_TIMESTAMP_MS: AtomicI64 = AtomicI64::new(0);

pub fn panel_clock_ms() -> u64 {
    PANEL_CLOCK
        .get_or_init(Instant::now)
        .elapsed()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

pub fn format_tooltip(status: &FullStatus) -> String {
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

pub async fn poll_and_update_tray(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let res = crate::quota::fetch_full_status_internal().await;
    match res {
        Ok(mut status) => {
            let monitored_codex = {
                let state = get_state().lock().unwrap();
                state.monitored_codex.clone()
            };
            status.monitored_codex = monitored_codex;
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

pub fn update_tray_only(app_handle: &tauri::AppHandle) {
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

pub fn position_window(window: &tauri::WebviewWindow) {
    logger::log_info("window", "position_window: calculating window position...");
    let primary_res = window.primary_monitor();
    let current_res = window.current_monitor();

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

        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    } else {
        logger::log_error(
            "window",
            "position_window: No monitor available to position window!",
        );
    }
}

pub fn show_main_dashboard(app: &AppHandle, source: &str) {
    logger::log_info(
        "window",
        &format!("show_main_dashboard requested by '{}'", source),
    );
    if let Some(window) = app.get_webview_window("main") {
        position_window(&window);
        crate::arm_panel_focus_guard();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("window-shown", true);
        LAST_SHOWN_TIMESTAMP_MS.store(chrono::Utc::now().timestamp_millis(), Ordering::SeqCst);
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
        if is_visible {
            let _ = window.hide();
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

pub fn restore_router_config_on_exit(source: &str) {
    match crate::codex_sync::restore_codex_router_config() {
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
