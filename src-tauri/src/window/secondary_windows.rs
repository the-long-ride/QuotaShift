//! On-demand lifecycle for secondary WebView2 windows (`overlay`, `overlay-tooltip`, `taskbar`).
//! Window creation runs inside async tasks/blocking workers because `WebviewWindowBuilder::build()`
//! deadlocks on Windows when called synchronously inside sync commands or event listeners.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Listener, Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::Mutex as AsyncMutex;

const TOOLTIP_LABEL: &str = "overlay-tooltip";
const TOOLTIP_IDLE_DESTROY_SECS: u64 = 20;

static PENDING_TOOLTIP_PAYLOAD: Mutex<Option<serde_json::Value>> = Mutex::new(None);
static TOOLTIP_IDLE_GEN: AtomicU64 = AtomicU64::new(0);
static DISPLAY_MODE_GEN: AtomicU64 = AtomicU64::new(0);
static WINDOW_CREATE_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

/// Returns an existing secondary window or creates it asynchronously from `tauri.conf.json`.
pub async fn ensure_secondary_window(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
    if let Some(existing) = app.get_webview_window(label) {
        return Some(existing);
    }
    let _guard = WINDOW_CREATE_LOCK.lock().await;
    if let Some(existing) = app.get_webview_window(label) {
        return Some(existing);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == label)?
        .clone();
    let app_clone = app.clone();
    let window = tauri::async_runtime::spawn_blocking(move || {
        WebviewWindowBuilder::from_config(&app_clone, &config)
            .ok()?
            .build()
            .ok()
    })
    .await
    .ok()
    .flatten()?;
    match label {
        "overlay" => crate::app_setup::configure_overlay_window(&window),
        "taskbar" => crate::app_setup::configure_taskbar_window(&window),
        TOOLTIP_LABEL => crate::app_setup::configure_tooltip_window(&window),
        _ => {}
    }
    Some(window)
}

/// Destroys a secondary window if present, freeing its WebView2 renderer process immediately.
pub fn destroy_secondary_window(app: &AppHandle, label: &str) {
    if label == TOOLTIP_LABEL {
        TOOLTIP_IDLE_GEN.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut pending) = PENDING_TOOLTIP_PAYLOAD.lock() {
            *pending = None;
        }
    }
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.destroy();
    }
}

/// Listens for tooltip events globally so `overlay-tooltip` can be spawned lazily and torn down when idle.
pub fn register_tooltip_lifecycle(app: AppHandle) {
    let app_for_event = app.clone();
    app.listen("overlay-tooltip-data", move |event| {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(event.payload()) else {
            return;
        };
        let visible = value
            .get("visible")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if visible {
            let gen_id = TOOLTIP_IDLE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
            if let Ok(mut pending) = PENDING_TOOLTIP_PAYLOAD.lock() {
                *pending = Some(value);
            }
            if app_for_event.get_webview_window(TOOLTIP_LABEL).is_none() {
                let app_for_spawn = app_for_event.clone();
                tauri::async_runtime::spawn(async move {
                    if TOOLTIP_IDLE_GEN.load(Ordering::SeqCst) == gen_id {
                        let _ = ensure_secondary_window(&app_for_spawn, TOOLTIP_LABEL).await;
                    }
                });
            }
            return;
        }
        if let Ok(mut pending) = PENDING_TOOLTIP_PAYLOAD.lock() {
            *pending = None;
        }
        if app_for_event.get_webview_window(TOOLTIP_LABEL).is_none() {
            return;
        }
        let gen_id = TOOLTIP_IDLE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
        let app_for_destroy = app_for_event.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(TOOLTIP_IDLE_DESTROY_SECS)).await;
            if TOOLTIP_IDLE_GEN.load(Ordering::SeqCst) == gen_id {
                if let Some(win) = app_for_destroy.get_webview_window(TOOLTIP_LABEL) {
                    let _ = win.destroy();
                }
            }
        });
    });
}

/// Applies `overlay` / `taskbar` / `overlay-tooltip` creation or teardown for a display mode.
/// Returns `true` if `taskbar` stayed active and its dock watcher should be started.
pub async fn apply_display_mode_windows(
    app: &AppHandle,
    overlay_on: bool,
    taskbar_on: bool,
) -> bool {
    let gen_id = DISPLAY_MODE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    destroy_secondary_window(app, TOOLTIP_LABEL);
    if !overlay_on {
        destroy_secondary_window(app, "overlay");
    }
    if !taskbar_on {
        destroy_secondary_window(app, "taskbar");
    }
    if overlay_on {
        if let Some(overlay) = ensure_secondary_window(app, "overlay").await {
            if DISPLAY_MODE_GEN.load(Ordering::SeqCst) == gen_id {
                let _ = overlay.show();
            } else {
                destroy_secondary_window(app, "overlay");
            }
        }
        return false;
    }
    if taskbar_on {
        let _ = ensure_secondary_window(app, "taskbar").await;
        if DISPLAY_MODE_GEN.load(Ordering::SeqCst) == gen_id {
            return true;
        }
        destroy_secondary_window(app, "taskbar");
    }
    false
}

#[tauri::command]
pub fn take_pending_overlay_tooltip() -> Option<serde_json::Value> {
    PENDING_TOOLTIP_PAYLOAD
        .lock()
        .ok()
        .and_then(|mut slot| slot.take())
        .filter(|v| v.get("visible").and_then(|b| b.as_bool()) == Some(true))
}
