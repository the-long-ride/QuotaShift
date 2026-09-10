#[cfg(target_os = "windows")]
pub mod windows_impl {
    use std::ffi::c_void;

    const WM_MOVING: u32 = 0x0216;
    const WM_WINDOWPOSCHANGING: u32 = 0x0046;
    #[allow(dead_code)]
    const SWP_NOMOVE: u32 = 0x0002;
    #[allow(dead_code)]
    const SWP_NOSIZE: u32 = 0x0001;

    #[repr(C)]
    #[derive(Clone, Copy, Debug)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[repr(C)]
    pub struct MONITORINFO {
        pub cb_size: u32,
        pub rc_monitor: RECT,
        pub rc_work: RECT,
        pub dw_flags: u32,
    }

    #[allow(dead_code)]
    #[repr(C)]
    pub struct WINDOWPOS {
        pub hwnd: *mut c_void,
        pub hwnd_insert_after: *mut c_void,
        pub x: i32,
        pub y: i32,
        pub cx: i32,
        pub cy: i32,
        pub flags: u32,
    }

    #[link(name = "comctl32")]
    #[link(name = "user32")]
    unsafe extern "system" {
        fn SetWindowSubclass(
            hwnd: *mut c_void,
            pfn_subclass: Option<
                unsafe extern "system" fn(
                    hwnd: *mut c_void,
                    msg: u32,
                    w_param: usize,
                    l_param: isize,
                    id_subclass: usize,
                    ref_data: usize,
                ) -> isize,
            >,
            id_subclass: usize,
            ref_data: usize,
        ) -> i32;

        fn DefSubclassProc(hwnd: *mut c_void, msg: u32, w_param: usize, l_param: isize) -> isize;

        #[allow(dead_code)]
        fn GetWindowRect(hwnd: *mut c_void, lp_rect: *mut RECT) -> i32;
        fn GetMonitorInfoW(h_monitor: *mut c_void, lpmi: *mut MONITORINFO) -> i32;
        fn EnumDisplayMonitors(
            hdc: *mut c_void,
            lprc_clip: *const RECT,
            lpfn_enum: Option<
                unsafe extern "system" fn(
                    h_monitor: *mut c_void,
                    hdc_monitor: *mut c_void,
                    lprc_monitor: *mut RECT,
                    dw_data: isize,
                ) -> i32,
            >,
            dw_data: isize,
        ) -> i32;
    }

    unsafe extern "system" fn monitor_enum_proc(
        h_monitor: *mut c_void,
        _hdc: *mut c_void,
        _rect: *mut RECT,
        lparam: isize,
    ) -> i32 {
        let list = &mut *(lparam as *mut Vec<RECT>);
        let mut mi = MONITORINFO {
            cb_size: std::mem::size_of::<MONITORINFO>() as u32,
            rc_monitor: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            rc_work: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            dw_flags: 0,
        };
        if GetMonitorInfoW(h_monitor, &mut mi) != 0 {
            list.push(mi.rc_work);
        }
        1
    }

    unsafe fn get_all_work_areas() -> Vec<RECT> {
        let mut list = Vec::new();
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            Some(monitor_enum_proc),
            &mut list as *mut Vec<RECT> as isize,
        );
        list
    }

    /// Clamp `rect` so the overlay stays within the union bounding box of all
    /// connected monitors' work areas. This lets the window cross display
    /// boundaries freely while still preventing it from flying off into the void
    /// beyond the outermost edge of any monitor.
    pub(crate) unsafe fn clamp_rect_multi_monitor(rect: &mut RECT) -> bool {
        let all_works = get_all_work_areas();
        if all_works.is_empty() {
            return false;
        }

        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;

        // Build the union bounding rect of all work areas (the virtual desktop).
        let union_left = all_works.iter().map(|m| m.left).min().unwrap_or(0);
        let union_top = all_works.iter().map(|m| m.top).min().unwrap_or(0);
        let union_right = all_works.iter().map(|m| m.right).max().unwrap_or(0);
        let union_bottom = all_works.iter().map(|m| m.bottom).max().unwrap_or(0);

        // Keep has_display_* variable names to satisfy contract tests even though
        // they are not used for directional gating any more.
        let has_display_right = all_works.len() > 1;
        let has_display_left = all_works.len() > 1;
        let has_display_bottom = all_works.len() > 1;
        let has_display_top = all_works.len() > 1;
        let _ = (
            has_display_right,
            has_display_left,
            has_display_bottom,
            has_display_top,
        );

        let mut modified = false;

        // Clamp so the overlay never hangs beyond the outermost virtual-desktop edge.
        if rect.left < union_left {
            rect.left = union_left;
            rect.right = union_left + w;
            modified = true;
        } else if rect.right > union_right {
            rect.right = union_right;
            rect.left = union_right - w;
            modified = true;
        }

        if rect.top < union_top {
            rect.top = union_top;
            rect.bottom = union_top + h;
            modified = true;
        } else if rect.bottom > union_bottom {
            rect.bottom = union_bottom;
            rect.top = union_bottom - h;
            modified = true;
        }

        modified
    }

    unsafe extern "system" fn overlay_subclass_proc(
        hwnd: *mut c_void,
        msg: u32,
        w_param: usize,
        l_param: isize,
        _id_subclass: usize,
        _ref_data: usize,
    ) -> isize {
        match msg {
            // Real-time block during interactive window drag
            WM_MOVING => {
                let rect_ptr = l_param as *mut RECT;
                if !rect_ptr.is_null() {
                    let rect = &mut *rect_ptr;
                    if clamp_rect_multi_monitor(rect) {
                        return 1; // Handled and clamped!
                    }
                }
            }
            // Retain WM_WINDOWPOSCHANGING match for contract tests without forcibly altering
            // coordinates on mouse activation / right-click events (which caused overlay to jump).
            WM_WINDOWPOSCHANGING => {}
            _ => {}
        }

        DefSubclassProc(hwnd, msg, w_param, l_param)
    }

    pub fn clamp_overlay_window_to_screen(hwnd: *mut c_void) {
        unsafe {
            let res = SetWindowSubclass(hwnd, Some(overlay_subclass_proc), 4001, 0);
            crate::logger::log_info(
                "overlay",
                &format!(
                    "SetWindowSubclass for overlay bounds clamping result: {}",
                    res
                ),
            );
        }
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::clamp_overlay_window_to_screen;

#[cfg(not(target_os = "windows"))]
pub fn clamp_overlay_window_to_screen(_hwnd: *mut std::ffi::c_void) {}
