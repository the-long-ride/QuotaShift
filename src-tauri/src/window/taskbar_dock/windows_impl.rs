#![allow(clippy::upper_case_acronyms)]
//! Win32 queries for the primary taskbar (`Shell_TrayWnd`) and its notification area.

use super::Rect;
use std::ffi::c_void;

const MONITOR_DEFAULTTONEAREST: u32 = 2;
const ABM_GETSTATE: u32 = 0x4;
const ABS_AUTOHIDE: usize = 0x1;
const SWP_NOSIZE: u32 = 0x0001;
const SWP_NOMOVE: u32 = 0x0002;
const SWP_NOACTIVATE: u32 = 0x0010;
const HWND_TOPMOST: isize = -1;

#[repr(C)]
struct MONITORINFO {
    cb_size: u32,
    rc_monitor: Rect,
    rc_work: Rect,
    dw_flags: u32,
}

#[repr(C)]
struct APPBARDATA {
    cb_size: u32,
    hwnd: *mut c_void,
    u_callback_message: u32,
    u_edge: u32,
    rc: Rect,
    l_param: isize,
}

#[link(name = "user32")]
#[link(name = "shell32")]
unsafe extern "system" {
    fn FindWindowW(class_name: *const u16, window_name: *const u16) -> *mut c_void;
    fn FindWindowExW(
        parent: *mut c_void,
        child_after: *mut c_void,
        class_name: *const u16,
        window_name: *const u16,
    ) -> *mut c_void;
    fn GetWindowRect(hwnd: *mut c_void, rect: *mut Rect) -> i32;
    fn GetForegroundWindow() -> *mut c_void;
    fn GetClassNameW(hwnd: *mut c_void, class_name: *mut u16, max_count: i32) -> i32;
    fn MonitorFromWindow(hwnd: *mut c_void, flags: u32) -> *mut c_void;
    fn GetMonitorInfoW(monitor: *mut c_void, info: *mut MONITORINFO) -> i32;
    fn SHAppBarMessage(message: u32, data: *mut APPBARDATA) -> usize;
    fn SetWindowPos(
        hwnd: *mut c_void,
        insert_after: *mut c_void,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> i32;
}

pub struct TaskbarGeometry {
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

/// A non-shell window covering its whole monitor (games, video, presentations).
unsafe fn is_fullscreen_foreground(monitor: Rect) -> bool {
    let fg = GetForegroundWindow();
    let Some(rect) = window_rect(fg) else {
        return false;
    };
    let class = class_name(fg);
    let shell = matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd");
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
            taskbar,
            tray: window_rect(tray_hwnd),
            monitor,
            auto_hide,
            fullscreen_foreground: is_fullscreen_foreground(monitor),
        })
    }
}

/// The taskbar is itself topmost; re-assert so clicking it does not bury the strip.
pub fn assert_topmost(hwnd: *mut c_void) {
    if hwnd.is_null() {
        return;
    }
    unsafe {
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
