#[cfg(target_os = "windows")]
fn set_dwm_attribute(hwnd: *mut std::ffi::c_void, attribute: u32, value: &u32) -> i32 {
    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut std::ffi::c_void,
            dw_attribute: u32,
            pv_attribute: *const std::ffi::c_void,
            cb_attribute: u32,
        ) -> i32;
    }

    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            value as *const u32 as *const std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        )
    }
}

#[cfg(target_os = "windows")]
pub fn remove_border(hwnd: *mut std::ffi::c_void) {
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;
    let hr = set_dwm_attribute(hwnd, DWMWA_BORDER_COLOR, &DWMWA_COLOR_NONE);
    if hr < 0 {
        crate::logger::log_warn(
            "dwm",
            &format!("Failed to remove DWM border: HRESULT={:#x}", hr as u32),
        );
    }
}

#[cfg(target_os = "windows")]
pub fn prefer_rounded_corners(hwnd: *mut std::ffi::c_void) {
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_ROUND: u32 = 2;
    let hr = set_dwm_attribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &DWMWCP_ROUND);
    if hr < 0 {
        crate::logger::log_warn(
            "dwm",
            &format!(
                "Failed to request rounded window corners: HRESULT={:#x}",
                hr as u32
            ),
        );
    }
}

#[cfg(target_os = "windows")]
pub fn make_window_click_through(hwnd: *mut std::ffi::c_void) {
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_NOACTIVATE: isize = 0x08000000;
    const WS_EX_TRANSPARENT: isize = 0x00000020;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetWindowLongPtrW(hwnd: *mut std::ffi::c_void, n_index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: *mut std::ffi::c_void, n_index: i32, new_long: isize) -> isize;
    }

    unsafe {
        let cur = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let updated = cur | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, updated);
    }
}

/// Hints WebView2 to release idle renderer caches when hidden without suspending JS timers/IPC.
#[cfg(target_os = "windows")]
pub fn set_webview_memory_usage_low(window: &tauri::WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows_core::Interface;

    let _ = window.with_webview(move |webview| unsafe {
        if let Ok(core) = webview.controller().CoreWebView2() {
            if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
                let level = if low {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                } else {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                };
                let _ = core19.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn set_webview_memory_usage_low(_window: &tauri::WebviewWindow, _low: bool) {}
