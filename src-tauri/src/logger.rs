use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use chrono::Local;

static LOG_MUTEX: Mutex<()> = Mutex::new(());

pub fn get_log_dir() -> Option<PathBuf> {
    crate::session::get_home_dir().map(|h| h.join(".quotashift"))
}

pub fn get_log_path() -> Option<PathBuf> {
    get_log_dir().map(|d| d.join("quotashift.log"))
}

pub fn write_log(level: &str, tag: &str, message: &str) {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] [{}] [{}] {}\n", now, level, tag, message);

    // Always output to stderr for CLI / dev visibility
    eprint!("{}", line);

    // Also persist to log file
    let _guard = LOG_MUTEX.lock().unwrap();
    if let Some(log_dir) = get_log_dir() {
        let _ = create_dir_all(&log_dir);
        let log_file = log_dir.join("quotashift.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
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
