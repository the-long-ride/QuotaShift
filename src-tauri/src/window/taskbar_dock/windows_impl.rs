#![allow(clippy::upper_case_acronyms)]
//! Win32 queries for the primary taskbar (`Shell_TrayWnd`) and its notification area.

use super::win32_ffi::*;
use super::Rect;
use std::ffi::c_void;

pub struct TaskbarGeometry {
    pub taskbar_hwnd: *mut c_void,
    pub taskbar: Rect,
    pub tray: Option<Rect>,
    pub monitor: Rect,
    pub auto_hide: bool,
    pub fullscreen_foreground: bool,
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn window_rect(hwnd: *mut c_void) -> Option<Rect> {
    let mut rect = Rect::default();
    (!hwnd.is_null() && GetWindowRect(hwnd, &mut rect) != 0 && !rect.is_empty()).then_some(rect)
}

unsafe fn monitor_rect(hwnd: *mut c_void) -> Option<Rect> {
    let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    let mut info = MONITORINFO {
        cb_size: std::mem::size_of::<MONITORINFO>() as u32,
        rc_monitor: Rect::default(),
        rc_work: Rect::default(),
        dw_flags: 0,
    };
    (!monitor.is_null() && GetMonitorInfoW(monitor, &mut info) != 0).then_some(info.rc_monitor)
}

unsafe fn class_name(hwnd: *mut c_void) -> String {
    let mut buf = [0u16; 64];
    let len = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32).max(0) as usize;
    String::from_utf16_lossy(&buf[..len])
}

/// Checks if `upper` precedes `lower` in Win32 Z-order by walking upward from `lower`.
unsafe fn is_above_window(upper: *mut c_void, lower: *mut c_void) -> bool {
    if upper.is_null() || lower.is_null() {
        return false;
    }
    if upper == lower {
        return true;
    }
    let mut cursor = GetWindow(lower, GW_HWNDPREV);
    for _ in 0..512 {
        if cursor.is_null() {
            return false;
        }
        if cursor == upper {
            return true;
        }
        cursor = GetWindow(cursor, GW_HWNDPREV);
    }
    false
}

unsafe fn read_hkcu_dword(sub_key: &str, value_name: &str) -> Option<u32> {
    const HKEY_CURRENT_USER: isize = -2147483647;
    const KEY_READ: u32 = 0x20019;
    let mut hkey: *mut c_void = std::ptr::null_mut();
    if RegOpenKeyExW(
        HKEY_CURRENT_USER as *mut c_void,
        wide(sub_key).as_ptr(),
        0,
        KEY_READ,
        &mut hkey,
    ) != 0
    {
        return None;
    }
    let mut val: u32 = 0;
    let mut val_type: u32 = 0;
    let mut size: u32 = std::mem::size_of::<u32>() as u32;
    let status = RegQueryValueExW(
        hkey,
        wide(value_name).as_ptr(),
        std::ptr::null_mut(),
        &mut val_type,
        &mut val as *mut u32 as *mut u8,
        &mut size,
    );
    RegCloseKey(hkey);
    (status == 0 && val_type == 4).then_some(val)
}

/// Checks whether the user enabled "Use Start full screen" or Windows Tablet Mode in Settings.
unsafe fn is_fullscreen_start_or_tablet() -> bool {
    let force_start = read_hkcu_dword(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
        "ForceStartSize",
    )
    .unwrap_or(0);
    if force_start == 2 {
        return true;
    }
    let tablet_mode = read_hkcu_dword(
        "Software\\Microsoft\\Windows\\CurrentVersion\\ImmersiveShell",
        "TabletMode",
    )
    .unwrap_or(0);
    tablet_mode == 1
}

/// A non-shell window covering its whole monitor (games, video, presentations).
/// Shell windows (Start menu, search, notification flyouts) should not hide the taskbar strip,
/// unless the user explicitly configured full-screen Start / Tablet Mode in Windows Settings.
unsafe fn is_fullscreen_foreground(monitor: Rect, taskbar_hwnd: *mut c_void) -> bool {
    let fg = GetForegroundWindow();
    let Some(rect) = window_rect(fg) else {
        return false;
    };
    let class = class_name(fg);
    let is_start = matches!(
        class.as_str(),
        "Windows.UI.Core.CoreWindow" | "XamlExplorerHostIslandWindow"
    );
    if is_start && is_fullscreen_start_or_tablet() {
        return true;
    }
    if !taskbar_hwnd.is_null() && (fg == taskbar_hwnd || is_above_window(taskbar_hwnd, fg)) {
        return false;
    }
    let shell = is_start
        || matches!(
            class.as_str(),
            "Progman"
                | "WorkerW"
                | "Shell_TrayWnd"
                | "Shell_SecondaryTrayWnd"
                | "NotifyIconOverflowWindow"
                | "TopLevelWindowForOverflowName"
                | "TopLevelWindowForOverflowXamlIsland"
                | "Windows.UI.Input.InputSite.WindowClass"
                | "ControlCenterWindow"
        );
    !shell
        && rect.left <= monitor.left
        && rect.top <= monitor.top
        && rect.right >= monitor.right
        && rect.bottom >= monitor.bottom
}

pub fn taskbar_geometry() -> Option<TaskbarGeometry> {
    unsafe {
        let taskbar_hwnd = FindWindowW(wide("Shell_TrayWnd").as_ptr(), std::ptr::null());
        let taskbar = window_rect(taskbar_hwnd)?;
        let tray_hwnd = FindWindowExW(
            taskbar_hwnd,
            std::ptr::null_mut(),
            wide("TrayNotifyWnd").as_ptr(),
            std::ptr::null(),
        );
        let monitor = monitor_rect(taskbar_hwnd)?;
        let mut data = APPBARDATA {
            cb_size: std::mem::size_of::<APPBARDATA>() as u32,
            hwnd: taskbar_hwnd,
            u_callback_message: 0,
            u_edge: 0,
            rc: Rect::default(),
            l_param: 0,
        };
        let auto_hide = SHAppBarMessage(ABM_GETSTATE, &mut data) & ABS_AUTOHIDE != 0;
        Some(TaskbarGeometry {
            taskbar_hwnd,
            taskbar,
            tray: window_rect(tray_hwnd),
            monitor,
            auto_hide,
            fullscreen_foreground: is_fullscreen_foreground(monitor, taskbar_hwnd),
        })
    }
}

/// Sets the taskbar window as the owner of the strip window.
pub fn dock_to_taskbar(strip_hwnd: *mut c_void, taskbar_hwnd: *mut c_void) {
    if strip_hwnd.is_null() || taskbar_hwnd.is_null() {
        return;
    }
    unsafe {
        #[cfg(target_pointer_width = "64")]
        {
            let current = GetWindowLongPtrW(strip_hwnd, GWLP_HWNDPARENT);
            if current != taskbar_hwnd as isize {
                SetWindowLongPtrW(strip_hwnd, GWLP_HWNDPARENT, taskbar_hwnd as isize);
            }
        }
        #[cfg(target_pointer_width = "32")]
        {
            let current = GetWindowLongW(strip_hwnd, GWLP_HWNDPARENT);
            if current != taskbar_hwnd as i32 {
                SetWindowLongW(strip_hwnd, GWLP_HWNDPARENT, taskbar_hwnd as i32);
            }
        }
    }
}

unsafe fn is_topmost(hwnd: *mut c_void) -> bool {
    #[cfg(target_pointer_width = "64")]
    let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    #[cfg(target_pointer_width = "32")]
    let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as isize;
    style & WS_EX_TOPMOST != 0
}

/// Keeps the strip topmost and above `Shell_TrayWnd` in the topmost Z-band without re-raising
/// on every tick when already above the taskbar (preserving tray context menus).
pub fn assert_topmost(hwnd: *mut c_void, taskbar_hwnd: *mut c_void) {
    if hwnd.is_null() {
        return;
    }
    unsafe {
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        let topmost = is_topmost(hwnd);
        let above_taskbar = taskbar_hwnd.is_null() || is_above_window(hwnd, taskbar_hwnd);
        if !super::should_raise_strip(topmost, above_taskbar) {
            return;
        }
        SetWindowPos(
            hwnd,
            HWND_TOPMOST as *mut c_void,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}
