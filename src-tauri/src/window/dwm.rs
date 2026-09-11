#[cfg(target_os = "windows")]
pub fn remove_border(hwnd: *mut std::ffi::c_void) {
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut std::ffi::c_void,
            dw_attribute: u32,
            pv_attribute: *const std::ffi::c_void,
            cb_attribute: u32,
        ) -> i32;
    }

    let color = DWMWA_COLOR_NONE;
    unsafe {
        let hr = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &color as *const u32 as *const std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        crate::logger::log_info(
            "dwm",
            &format!(
                "DwmSetWindowAttribute remove_border result: HRESULT={:#x}",
                hr
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
        crate::logger::log_info(
            "dwm",
            "Configured overlay tooltip window as non-activating and transparent",
        );
    }
}
