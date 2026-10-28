#![allow(clippy::upper_case_acronyms)]
//! Raw Win32 FFI bindings and structs for taskbar geometry and Z-order queries.

use super::Rect;
use std::ffi::c_void;

pub const MONITOR_DEFAULTTONEAREST: u32 = 2;
pub const ABM_GETSTATE: u32 = 0x4;
pub const ABS_AUTOHIDE: usize = 0x1;
pub const SWP_NOSIZE: u32 = 0x0001;
pub const SWP_NOMOVE: u32 = 0x0002;
pub const SWP_NOACTIVATE: u32 = 0x0010;
pub const HWND_TOPMOST: isize = -1;
pub const GWL_EXSTYLE: i32 = -20;
pub const GWLP_HWNDPARENT: i32 = -8;
pub const WS_EX_TOPMOST: isize = 0x0000_0008;
pub const GW_HWNDPREV: u32 = 3;
pub const SW_SHOWNOACTIVATE: i32 = 4;

#[repr(C)]
pub struct MONITORINFO {
    pub cb_size: u32,
    pub rc_monitor: Rect,
    pub rc_work: Rect,
    pub dw_flags: u32,
}

#[repr(C)]
pub struct APPBARDATA {
    pub cb_size: u32,
    pub hwnd: *mut c_void,
    pub u_callback_message: u32,
    pub u_edge: u32,
    pub rc: Rect,
    pub l_param: isize,
}

#[link(name = "user32")]
#[link(name = "shell32")]
#[link(name = "advapi32")]
unsafe extern "system" {
    pub fn FindWindowW(class_name: *const u16, window_name: *const u16) -> *mut c_void;
    pub fn FindWindowExW(
        parent: *mut c_void,
        child_after: *mut c_void,
        class_name: *const u16,
        window_name: *const u16,
    ) -> *mut c_void;
    pub fn GetWindowRect(hwnd: *mut c_void, rect: *mut Rect) -> i32;
    pub fn GetForegroundWindow() -> *mut c_void;
    pub fn GetWindow(hwnd: *mut c_void, u_cmd: u32) -> *mut c_void;
    pub fn IsIconic(hwnd: *mut c_void) -> i32;
    pub fn ShowWindow(hwnd: *mut c_void, cmd_show: i32) -> i32;
    pub fn GetClassNameW(hwnd: *mut c_void, class_name: *mut u16, max_count: i32) -> i32;
    pub fn MonitorFromWindow(hwnd: *mut c_void, flags: u32) -> *mut c_void;
    pub fn GetMonitorInfoW(monitor: *mut c_void, info: *mut MONITORINFO) -> i32;
    pub fn SHAppBarMessage(message: u32, data: *mut APPBARDATA) -> usize;
    pub fn SetWindowPos(
        hwnd: *mut c_void,
        insert_after: *mut c_void,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> i32;
    pub fn RegOpenKeyExW(
        hkey: *mut c_void,
        sub_key: *const u16,
        options: u32,
        sam: u32,
        result: *mut *mut c_void,
    ) -> i32;
    pub fn RegQueryValueExW(
        hkey: *mut c_void,
        value_name: *const u16,
        reserved: *mut u32,
        val_type: *mut u32,
        data: *mut u8,
        data_len: *mut u32,
    ) -> i32;
    pub fn RegCloseKey(hkey: *mut c_void) -> i32;
}

#[cfg(target_pointer_width = "64")]
unsafe extern "system" {
    pub fn GetWindowLongPtrW(hwnd: *mut c_void, index: i32) -> isize;
    pub fn SetWindowLongPtrW(hwnd: *mut c_void, index: i32, new_long: isize) -> isize;
}

#[cfg(target_pointer_width = "32")]
unsafe extern "system" {
    pub fn GetWindowLongW(hwnd: *mut c_void, index: i32) -> i32;
    pub fn SetWindowLongW(hwnd: *mut c_void, index: i32, new_long: i32) -> i32;
}
