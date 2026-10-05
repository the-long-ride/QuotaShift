//! Docks the `taskbar` webview window as a compact strip inside the Windows taskbar,
//! just left of the notification area (like the Widgets/weather button).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

#[cfg(target_os = "windows")]
mod windows_impl;

pub const TASKBAR_LABEL: &str = "taskbar";
pub const OVERLAY_LABEL: &str = "overlay";
const DEFAULT_CONTENT: (f64, f64) = (120.0, 36.0);

static TASKBAR_ACTIVE: AtomicBool = AtomicBool::new(false);
static WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);
static CONTENT_WIDTH: AtomicU64 = AtomicU64::new(0);
static CONTENT_HEIGHT: AtomicU64 = AtomicU64::new(0);

/// Matches Win32 `RECT`; passed directly to `GetWindowRect` / `GetMonitorInfoW`.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn width(&self) -> i32 {
        self.right - self.left
    }
    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }
    pub fn is_empty(&self) -> bool {
        self.width() <= 0 || self.height() <= 0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edge {
    Bottom,
    Top,
    Left,
    Right,
}

/// Which monitor edge the taskbar is docked to.
pub fn detect_edge(taskbar: Rect, monitor: Rect) -> Edge {
    if taskbar.width() >= taskbar.height() {
        if taskbar.top <= monitor.top && taskbar.bottom < monitor.bottom {
            Edge::Top
        } else {
            Edge::Bottom
        }
    } else if taskbar.left <= monitor.left && taskbar.right < monitor.right {
        Edge::Left
    } else {
        Edge::Right
    }
}

/// Physical rect of the strip: inset 2px inside the taskbar, ending just before the tray.
/// `content` is the strip's logical (CSS px) size; `scale` the monitor DPI scale.
pub fn compute_strip_rect(
    edge: Edge,
    taskbar: Rect,
    tray: Option<Rect>,
    content: (f64, f64),
    scale: f64,
) -> Rect {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let px = |v: f64| (v * scale).round() as i32;
    let (cw, ch) = content;
    let (left, top, w, h) = match edge {
        Edge::Bottom | Edge::Top => {
            let h = (taskbar.height() - px(4.0)).max(1);
            let w = px(cw).max(1).min(taskbar.width());
            let anchor = tray
                .filter(|t| !t.is_empty())
                .map_or(taskbar.right, |t| t.left);
            (anchor - w - px(2.0), taskbar.top + px(2.0), w, h)
        }
        Edge::Left | Edge::Right => {
            let w = (taskbar.width() - px(4.0)).max(1);
            let h = px(ch).max(1).min(taskbar.height());
            let anchor = tray
                .filter(|t| !t.is_empty())
                .map_or(taskbar.bottom, |t| t.top);
            (taskbar.left + px(2.0), anchor - h - px(2.0), w, h)
        }
    };
    let x = left.clamp(taskbar.left, (taskbar.right - w).max(taskbar.left));
    let y = top.clamp(taskbar.top, (taskbar.bottom - h).max(taskbar.top));
    Rect {
        left: x,
        top: y,
        right: x + w,
        bottom: y + h,
    }
}

pub fn normalize_display_mode(mode: &str) -> &'static str {
    match mode {
        "none" => "none",
        "taskbar" if cfg!(target_os = "windows") => "taskbar",
        _ => "overlay",
    }
}

fn content_size() -> (f64, f64) {
    let w = f64::from_bits(CONTENT_WIDTH.load(Ordering::Relaxed));
    let h = f64::from_bits(CONTENT_HEIGHT.load(Ordering::Relaxed));
    let ok = |v: f64| v.is_finite() && v > 0.0;
    (
        if ok(w) { w } else { DEFAULT_CONTENT.0 },
        if ok(h) { h } else { DEFAULT_CONTENT.1 },
    )
}

#[tauri::command]
pub fn set_display_mode(app_handle: tauri::AppHandle, mode: String) -> Result<String, String> {
    use tauri::Manager;
    let mode = normalize_display_mode(&mode);
    if let Some(overlay) = app_handle.get_webview_window(OVERLAY_LABEL) {
        let _ = if mode == "overlay" {
            overlay.show()
        } else {
            overlay.hide()
        };
    }
    let taskbar_on = mode == "taskbar";
    TASKBAR_ACTIVE.store(taskbar_on, Ordering::SeqCst);
    if taskbar_on {
        spawn_watcher(app_handle);
    } else if let Some(strip) = app_handle.get_webview_window(TASKBAR_LABEL) {
        let _ = strip.hide();
    }
    Ok(mode.to_string())
}

#[tauri::command]
pub fn set_taskbar_content_size(width: f64, height: f64) {
    if width.is_finite() && width > 0.0 {
        CONTENT_WIDTH.store(width.to_bits(), Ordering::Relaxed);
    }
    if height.is_finite() && height > 0.0 {
        CONTENT_HEIGHT.store(height.to_bits(), Ordering::Relaxed);
    }
}

fn spawn_watcher(app_handle: tauri::AppHandle) {
    if WATCHER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        while TASKBAR_ACTIVE.load(Ordering::SeqCst) {
            place_strip(&app_handle);
            tokio::time::sleep(std::time::Duration::from_millis(750)).await;
        }
        WATCHER_RUNNING.store(false, Ordering::SeqCst);
        // A re-enable between the loop exit and the flag reset must not be lost.
        if TASKBAR_ACTIVE.load(Ordering::SeqCst) {
            spawn_watcher(app_handle);
        }
    });
}

#[cfg(target_os = "windows")]
fn place_strip(app_handle: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(strip) = app_handle.get_webview_window(TASKBAR_LABEL) else {
        return;
    };
    let Some(geometry) = windows_impl::taskbar_geometry() else {
        let _ = strip.hide();
        return;
    };
    if geometry.auto_hide || geometry.fullscreen_foreground {
        let _ = strip.hide();
        return;
    }
    let edge = detect_edge(geometry.taskbar, geometry.monitor);
    let scale = strip.scale_factor().unwrap_or(1.0);
    let rect = compute_strip_rect(edge, geometry.taskbar, geometry.tray, content_size(), scale);
    let _ = strip.set_size(tauri::PhysicalSize::new(
        rect.width() as u32,
        rect.height() as u32,
    ));
    let _ = strip.set_position(tauri::PhysicalPosition::new(rect.left, rect.top));
    if !strip.is_visible().unwrap_or(false) {
        let _ = strip.show();
    }
    if let Ok(handle) = raw_window_handle::HasWindowHandle::window_handle(&strip) {
        if let raw_window_handle::RawWindowHandle::Win32(h) = handle.as_raw() {
            windows_impl::assert_topmost(h.hwnd.get() as *mut std::ffi::c_void);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn place_strip(app_handle: &tauri::AppHandle) {
    use tauri::Manager;
    let _ = content_size();
    if let Some(strip) = app_handle.get_webview_window(TASKBAR_LABEL) {
        let _ = strip.hide();
    }
    TASKBAR_ACTIVE.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests;
