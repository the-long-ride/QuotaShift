#[cfg(target_os = "windows")]
pub mod windows_impl {
    use std::ffi::c_void;

    const WM_MOVING: u32 = 0x0216;
    const WM_WINDOWPOSCHANGING: u32 = 0x0046;
    const SWP_NOMOVE: u32 = 0x0002;
    const MONITOR_DEFAULTTONEAREST: u32 = 2;

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

        fn DefSubclassProc(
            hwnd: *mut c_void,
            msg: u32,
            w_param: usize,
            l_param: isize,
        ) -> isize;

        fn MonitorFromRect(lprc: *const RECT, dw_flags: u32) -> *mut c_void;
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
            rc_monitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
            rc_work: RECT { left: 0, top: 0, right: 0, bottom: 0 },
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

    unsafe fn get_work_area_for_rect(rect: &RECT) -> Option<RECT> {
        let h_mon = MonitorFromRect(rect as *const RECT, MONITOR_DEFAULTTONEAREST);
        if h_mon.is_null() {
            return None;
        }

        let mut mi = MONITORINFO {
            cb_size: std::mem::size_of::<MONITORINFO>() as u32,
            rc_monitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
            rc_work: RECT { left: 0, top: 0, right: 0, bottom: 0 },
            dw_flags: 0,
        };

        if GetMonitorInfoW(h_mon, &mut mi) != 0 {
            Some(mi.rc_work)
        } else {
            None
        }
    }

    unsafe fn clamp_rect_multi_monitor(rect: &mut RECT) -> bool {
        let all_works = get_all_work_areas();
        let cur_work = match get_work_area_for_rect(rect) {
            Some(w) => w,
            None => return false,
        };

        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;

        // Check if there is another monitor display space in each direction (tolerance 50px for display alignment)
        let has_display_right = all_works.iter().any(|m| {
            m.right > cur_work.right
                && m.left <= cur_work.right + 50
                && (m.bottom > cur_work.top && m.top < cur_work.bottom)
        });

        let has_display_left = all_works.iter().any(|m| {
            m.left < cur_work.left
                && m.right >= cur_work.left - 50
                && (m.bottom > cur_work.top && m.top < cur_work.bottom)
        });

        let has_display_bottom = all_works.iter().any(|m| {
            m.bottom > cur_work.bottom
                && m.top <= cur_work.bottom + 50
                && (m.right > cur_work.left && m.left < cur_work.right)
        });

        let has_display_top = all_works.iter().any(|m| {
            m.top < cur_work.top
                && m.bottom >= cur_work.top - 50
                && (m.right > cur_work.left && m.left < cur_work.right)
        });

        let mut modified = false;

        // Only clamp the outer edge if there is NO neighboring monitor in that direction!
        if !has_display_left && rect.left < cur_work.left {
            rect.left = cur_work.left;
            rect.right = cur_work.left + w;
            modified = true;
        } else if !has_display_right && rect.right > cur_work.right {
            rect.right = cur_work.right;
            rect.left = cur_work.right - w;
            modified = true;
        }

        if !has_display_top && rect.top < cur_work.top {
            rect.top = cur_work.top;
            rect.bottom = cur_work.top + h;
            modified = true;
        } else if !has_display_bottom && rect.bottom > cur_work.bottom {
            rect.bottom = cur_work.bottom;
            rect.top = cur_work.bottom - h;
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
            // Enforce bounds on programmatic or final position changes
            WM_WINDOWPOSCHANGING => {
                let pos_ptr = l_param as *mut WINDOWPOS;
                if !pos_ptr.is_null() {
                    let pos = &mut *pos_ptr;
                    if (pos.flags & SWP_NOMOVE) == 0 {
                        let mut target_rect = RECT {
                            left: pos.x,
                            top: pos.y,
                            right: pos.x + pos.cx,
                            bottom: pos.y + pos.cy,
                        };
                        if clamp_rect_multi_monitor(&mut target_rect) {
                            pos.x = target_rect.left;
                            pos.y = target_rect.top;
                        }
                    }
                }
            }
            _ => {}
        }

        DefSubclassProc(hwnd, msg, w_param, l_param)
    }

    pub fn clamp_overlay_window_to_screen(hwnd: *mut c_void) {
        unsafe {
            let res = SetWindowSubclass(hwnd, Some(overlay_subclass_proc), 4001, 0);
            crate::logger::log_info("overlay", &format!("SetWindowSubclass for overlay bounds clamping result: {}", res));
        }
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::clamp_overlay_window_to_screen;

#[cfg(not(target_os = "windows"))]
pub fn clamp_overlay_window_to_screen(_hwnd: *mut std::ffi::c_void) {}
