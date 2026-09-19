use crate::logger;
use tauri::Manager;

#[tauri::command]
pub fn log_from_frontend(level: String, tag: String, message: String) {
    logger::write_log(&level, &format!("frontend:{}", tag), &message);
}

#[tauri::command]
pub fn open_devtools(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        logger::log_info("window", "open_devtools command executed");
        window.open_devtools();
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
pub fn get_log_file_path() -> Result<String, String> {
    logger::get_log_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine log file path".to_string())
}

#[tauri::command]
pub fn open_logs_folder() -> Result<(), String> {
    let dir =
        logger::get_log_dir().ok_or_else(|| "Could not determine log directory".to_string())?;
    logger::log_info("window", &format!("Opening logs folder: {:?}", dir));
    crate::system::explorer::show_path_in_file_manager(&dir.to_string_lossy())
}

#[tauri::command]
pub fn get_log_file_size() -> Result<u64, String> {
    Ok(logger::get_log_file_size())
}

#[tauri::command]
pub fn clear_log_file() -> Result<(), String> {
    logger::clear_log_file()
}

#[tauri::command]
pub fn get_session_logs() -> Result<Vec<String>, String> {
    Ok(logger::get_session_logs())
}

#[tauri::command]
pub fn get_session_logs_revision() -> Result<u64, String> {
    Ok(logger::get_session_logs_revision())
}
