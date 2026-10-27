// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--claude-statusline-bridge") {
        if let Err(error) = tauri_app_lib::claude_monitor::run_claude_statusline_bridge() {
            eprintln!("QuotaShift Claude Code statusLine bridge: {error}");
        }
        return;
    }

    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == "--claude-gateway-token" {
            let code = match args.next() {
                Some(profile_id) => {
                    tauri_app_lib::storage::secure_storage::run_claude_gateway_token_cli(
                        &profile_id,
                    )
                }
                None => 1,
            };
            std::process::exit(code);
        }
    }

    tauri_app_lib::run()
}
