//! One-time OS notification when `claude -p /usage` prints no quota percentages.
//!
//! That output means Claude Code has no usable login. The notice is sent at most once per
//! QuotaShift launch so repeated polls never spam the user.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use tauri::AppHandle;

const TITLE: &str = "Claude Code is not logged in";
const BODY: &str = "Run `claude` and sign in with /login so QuotaShift can read your usage.";

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static NOTIFIED: AtomicBool = AtomicBool::new(false);

/// Called once at startup so background polls can raise the notification.
pub fn register_app_handle(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

/// First call per launch wins; every later call returns false.
fn claim_notification(flag: &AtomicBool) -> bool {
    !flag.swap(true, Ordering::SeqCst)
}

pub fn notify_not_logged_in_once() {
    notify_with(&NOTIFIED, |title, body| {
        let app = APP_HANDLE.get().ok_or("app handle not registered")?;
        crate::system::notification::show_native_notification(app, title, body)
    });
}

fn notify_with(flag: &AtomicBool, send: impl FnOnce(&str, &str) -> Result<(), String>) {
    if !claim_notification(flag) {
        return;
    }
    if let Err(error) = send(TITLE, BODY) {
        crate::logger::log_warn(
            "claude_cli",
            &format!("Failed to show the not-logged-in notification: {error}"),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn notifies_only_once_per_launch() {
        let flag = AtomicBool::new(false);
        let sent = Cell::new(0);
        for _ in 0..3 {
            notify_with(&flag, |_, _| {
                sent.set(sent.get() + 1);
                Ok(())
            });
        }
        assert_eq!(sent.get(), 1);
    }

    #[test]
    fn a_failed_send_is_not_retried() {
        let flag = AtomicBool::new(false);
        let sent = Cell::new(0);
        for _ in 0..2 {
            notify_with(&flag, |_, _| {
                sent.set(sent.get() + 1);
                Err("blocked".to_string())
            });
        }
        assert_eq!(sent.get(), 1);
    }
}
