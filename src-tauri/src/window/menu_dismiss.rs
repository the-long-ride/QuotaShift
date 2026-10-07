//! Closes the taskbar context menu when the user clicks anywhere outside it.
//!
//! The menu window is focus-limited (the taskbar strip never takes focus), so the webview `blur`
//! event is not reliable. A short-lived poller watches the global mouse buttons instead.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::taskbar_dock::Rect;

pub const DISMISS_EVENT: &str = "taskbar-menu-dismiss";
const MENU_WINDOW_LABEL: &str = "overlay-tooltip";
const POLL_INTERVAL: Duration = Duration::from_millis(30);

/// Bumped on every start/stop so an older poller ends itself when superseded.
static GENERATION: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "windows")]
mod native {
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetAsyncKeyState(vkey: i32) -> i16;
        fn GetCursorPos(point: *mut Point) -> i32;
    }

    const VK_LBUTTON: i32 = 0x01;
    const VK_RBUTTON: i32 = 0x02;
    const VK_MBUTTON: i32 = 0x04;

    pub fn any_button_down() -> bool {
        [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON]
            .into_iter()
            .any(|key| unsafe { GetAsyncKeyState(key) } < 0)
    }

    pub fn cursor_position() -> Option<(i32, i32)> {
        let mut point = Point { x: 0, y: 0 };
        (unsafe { GetCursorPos(&mut point) } != 0).then_some((point.x, point.y))
    }
}

#[cfg(not(target_os = "windows"))]
mod native {
    pub fn any_button_down() -> bool {
        false
    }

    pub fn cursor_position() -> Option<(i32, i32)> {
        None
    }
}

fn menu_rect(app_handle: &AppHandle) -> Option<Rect> {
    let window = app_handle.get_webview_window(MENU_WINDOW_LABEL)?;
    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    Some(Rect {
        left: position.x,
        top: position.y,
        right: position.x + size.width as i32,
        bottom: position.y + size.height as i32,
    })
}

/// A fresh button press (not a held one) whose cursor lies outside the menu window.
fn is_outside_press(was_down: bool, down: bool, cursor: Option<(i32, i32)>, menu: Rect) -> bool {
    !was_down && down && cursor.is_some_and(|(x, y)| !menu.contains(x, y))
}

#[tauri::command]
pub fn start_taskbar_menu_dismiss(app_handle: AppHandle) {
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        // Start from the current state so the click that opened the menu is not counted.
        let mut was_down = native::any_button_down();
        while GENERATION.load(Ordering::SeqCst) == generation {
            tokio::time::sleep(POLL_INTERVAL).await;
            let down = native::any_button_down();
            let outside = menu_rect(&app_handle).is_some_and(|menu| {
                is_outside_press(was_down, down, native::cursor_position(), menu)
            });
            was_down = down;
            if outside && GENERATION.load(Ordering::SeqCst) == generation {
                let _ = app_handle.emit(DISMISS_EVENT, ());
                break;
            }
        }
    });
}

#[tauri::command]
pub fn stop_taskbar_menu_dismiss() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    const MENU: Rect = Rect {
        left: 100,
        top: 100,
        right: 200,
        bottom: 160,
    };

    #[test]
    fn fresh_press_outside_menu_dismisses() {
        assert!(is_outside_press(false, true, Some((10, 10)), MENU));
    }

    #[test]
    fn press_inside_menu_is_kept() {
        assert!(!is_outside_press(false, true, Some((150, 130)), MENU));
    }

    #[test]
    fn held_or_released_buttons_never_dismiss() {
        assert!(!is_outside_press(true, true, Some((10, 10)), MENU));
        assert!(!is_outside_press(false, false, Some((10, 10)), MENU));
    }

    #[test]
    fn unknown_cursor_never_dismisses() {
        assert!(!is_outside_press(false, true, None, MENU));
    }
}
