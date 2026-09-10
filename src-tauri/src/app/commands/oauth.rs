use crate::oauth;

#[tauri::command]
pub async fn start_oauth_flow(app_handle: tauri::AppHandle) -> Result<String, String> {
    oauth::start_oauth_flow(&app_handle).await
}

#[tauri::command]
pub async fn exchange_oauth_token(code: String) -> Result<serde_json::Value, String> {
    oauth::exchange_oauth_token(code).await
}

#[tauri::command]
pub async fn fetch_chatgpt_workspaces(access_token: String) -> Result<serde_json::Value, String> {
    oauth::fetch_chatgpt_workspaces(access_token).await
}

#[tauri::command]
pub async fn fetch_chatgpt_usage(
    access_token: String,
    account_id: String,
) -> Result<serde_json::Value, String> {
    oauth::fetch_chatgpt_usage(access_token, Some(account_id)).await
}

#[tauri::command]
pub async fn refresh_chatgpt_token(refresh_token: String) -> Result<serde_json::Value, String> {
    oauth::refresh_chatgpt_token(refresh_token).await
}

#[tauri::command]
pub async fn reset_oauth_session() -> Result<(), String> {
    oauth::reset_oauth_session().await
}

#[tauri::command]
pub async fn start_antigravity_google_oauth(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    oauth::start_antigravity_google_oauth(&app_handle).await
}

#[tauri::command]
pub async fn exchange_antigravity_google_token(code: String) -> Result<serde_json::Value, String> {
    oauth::exchange_antigravity_google_token(code).await
}

#[tauri::command]
pub async fn reset_google_oauth_session() -> Result<(), String> {
    oauth::reset_google_oauth_session().await
}
