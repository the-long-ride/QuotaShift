use chrono::Local;
use std::collections::VecDeque;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

static LOG_MUTEX: Mutex<()> = Mutex::new(());
static SESSION_LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
static SESSION_REVISION: AtomicU64 = AtomicU64::new(0);
const MAX_SESSION_LOGS: usize = 2000;

fn push_session_log(entry: String) {
    if let Ok(mut logs) = SESSION_LOGS.lock() {
        if logs.len() >= MAX_SESSION_LOGS {
            logs.pop_front();
        }
        logs.push_back(entry);
        SESSION_REVISION.fetch_add(1, Ordering::Relaxed);
    }
}

pub fn get_session_logs() -> Vec<String> {
    SESSION_LOGS
        .lock()
        .map(|logs| logs.iter().cloned().collect())
        .unwrap_or_default()
}

pub fn get_session_logs_revision() -> u64 {
    SESSION_REVISION.load(Ordering::Relaxed)
}

pub fn get_log_file_size() -> u64 {
    get_log_path()
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0)
}

pub fn clear_log_file() -> Result<(), String> {
    let _guard = LOG_MUTEX.lock().unwrap();
    if let Some(path) = get_log_path() {
        if path.exists() {
            std::fs::write(&path, b"").map_err(|e| format!("Failed to clear log file: {e}"))?;
        }
    }
    Ok(())
}

pub fn get_log_dir() -> Option<PathBuf> {
    crate::session::get_home_dir().map(|h| h.join(".quotashift"))
}

pub fn get_log_path() -> Option<PathBuf> {
    get_log_dir().map(|d| d.join("quotashift.log"))
}

fn is_redundant_info(tag: &str, message: &str) -> bool {
    match tag {
        "window" => {
            message.starts_with("main window Resized")
                || message.starts_with("main window Moved")
                || message.starts_with("open_main_window requested by")
                || message.starts_with("hide_main_window requested by")
                || message == "open_devtools command executed"
                || message.starts_with("Opening logs folder:")
        }
        "codex_router" => message.contains("event=forwarded"),
        "frontend:main:bootstrap" => true,
        "frontend:frontend:init" => message == "Frontend logger initialized",
        _ => false,
    }
}

pub fn short_time() -> impl std::fmt::Display {
    Local::now().format("%H:%M:%S")
}

pub fn record_eprintln(msg: &str) {
    let time_short = short_time().to_string();
    let line = format!("[{}] {}", time_short, msg);
    eprintln!("{}", line);
    push_session_log(line);
}

#[macro_export]
macro_rules! log_eprintln {
    ($($arg:tt)*) => {
        $crate::logger::record_eprintln(&format!($($arg)*))
    };
}

pub fn write_log(level: &str, tag: &str, message: &str) {
    if level.eq_ignore_ascii_case("INFO") && is_redundant_info(tag, message) {
        return;
    }

    let time_short = short_time();
    let line = format!("[{}] [{}] [{}] {}", time_short, level, tag, message);

    // Always output to stderr and buffer for in-memory session logs
    eprintln!("{}", line);
    push_session_log(line);

    // quotashift.log file only logs warnings or errors, saved durably
    let is_warning_or_error = level.eq_ignore_ascii_case("WARN")
        || level.eq_ignore_ascii_case("WARNING")
        || level.eq_ignore_ascii_case("ERROR");

    if is_warning_or_error {
        let _guard = LOG_MUTEX.lock().unwrap();
        if let Some(log_dir) = get_log_dir() {
            let _ = create_dir_all(&log_dir);
            let log_file = log_dir.join("quotashift.log");
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
                let file_now = Local::now().format("%Y-%m-%d %H:%M:%S");
                let file_line = format!("[{}] [{}] [{}] {}\n", file_now, level, tag, message);
                let _ = file.write_all(file_line.as_bytes());
                let _ = file.flush();
            }
        }
    }
}

pub fn log_info(tag: &str, message: &str) {
    write_log("INFO", tag, message);
}

pub fn log_warn(tag: &str, message: &str) {
    write_log("WARN", tag, message);
}

pub fn log_error(tag: &str, message: &str) {
    write_log("ERROR", tag, message);
}

pub fn log_debug(tag: &str, message: &str) {
    write_log("DEBUG", tag, message);
}

#[cfg(test)]
mod tests {
    use super::is_redundant_info;

    #[test]
    fn suppresses_high_frequency_window_info() {
        assert!(is_redundant_info(
            "window",
            "main window Resized to 680x720"
        ));
        assert!(is_redundant_info(
            "window",
            "main window Moved to x=120 y=80"
        ));
        assert!(is_redundant_info(
            "window",
            "open_main_window requested by tray_click"
        ));
        assert!(is_redundant_info(
            "window",
            "hide_main_window requested by focus_lost"
        ));
    }

    #[test]
    fn suppresses_routine_success_traces() {
        assert!(is_redundant_info(
            "codex_router",
            "event=forwarded account_id=a model=gpt-5 status=200"
        ));
        assert!(is_redundant_info(
            "frontend:main:bootstrap",
            "React root.render() executed"
        ));
        assert!(is_redundant_info(
            "frontend:frontend:init",
            "Frontend logger initialized"
        ));
        assert!(is_redundant_info(
            "window",
            "open_devtools command executed"
        ));
        assert!(is_redundant_info(
            "window",
            "Opening logs folder: C:\\Users\\user\\.quotashift"
        ));
    }

    #[test]
    fn keeps_diagnostics_and_lifecycle_info() {
        assert!(!is_redundant_info(
            "codex_router",
            "event=precommit_failover account_id=a model=gpt-5 status=429"
        ));
        assert!(!is_redundant_info("lifecycle", "Tauri RunEvent::Exit"));
        assert!(!is_redundant_info(
            "window",
            "Failed to position main window: monitor unavailable"
        ));
    }

    #[test]
    fn short_time_format_is_hh_mm_ss() {
        let t = super::short_time().to_string();
        assert_eq!(t.len(), 8);
        assert_eq!(&t[2..3], ":");
        assert_eq!(&t[5..6], ":");
    }

    #[test]
    fn session_logs_buffer_captures_entries() {
        super::record_eprintln("test_session_log_entry_unique_123");
        let logs = super::get_session_logs();
        assert!(logs
            .iter()
            .any(|l| l.contains("test_session_log_entry_unique_123")));
    }
}
