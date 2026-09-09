// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--claude-statusline-bridge") {
        if let Err(error) = tauri_app_lib::claude_monitor::run_claude_statusline_bridge() {
            eprintln!("QuotaShift Claude statusLine bridge: {error}");
        }
        return;
    }

    tauri_app_lib::run()
}
