use tauri::State;
use super::{key, server::{build_router, RouterContext}};
use super::state::{AgentApiManager, AgentApiSnapshot, AgentApiStatus, AgentRuntime};

#[tauri::command]
pub async fn agent_api_status(
    manager: State<'_, AgentApiManager>,
) -> Result<AgentApiStatus, String> {
    let runtime = manager.inner.runtime.lock().await;
    Ok(AgentApiStatus {
        running: runtime.is_some(),
        port: runtime.as_ref().map(|r| r.port),
        write_enabled: runtime.as_ref().is_some_and(|r| r.write_enabled),
        key_configured: key::load_key()?.is_some(),
    })
}

#[tauri::command]
pub async fn agent_api_generate_key(
    manager: State<'_, AgentApiManager>,
) -> Result<String, String> {
    if manager.inner.runtime.lock().await.is_some() {
        return Err("Stop the Agent API before replacing its key".into());
    }
    key::generate_key()
}

#[tauri::command]
pub async fn agent_api_start(
    app: tauri::AppHandle,
    manager: State<'_, AgentApiManager>,
    port: u16,
    write_enabled: bool,
) -> Result<AgentApiStatus, String> {
    if port < 1024 {
        return Err("Agent API port must be between 1024 and 65535".into());
    }
    let secret = key::load_key()?.ok_or("Generate an API key before enabling the Agent API")?;
    let mut runtime = manager.inner.runtime.lock().await;
    if runtime.is_some() {
        return Err("Agent API is already running; stop it before changing settings".into());
    }
    // Deliberately never bind to a LAN or public interface.
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await.map_err(|e| format!("Cannot bind agent loopback port: {e}"))?;
    let router = build_router(RouterContext {
        manager: (*manager).clone(),
        key: secret,
        write_enabled,
        app,
    });
    let task = tauri::async_runtime::spawn(async move {
        if let Err(err) = axum::serve(listener, router).await {
            crate::logger::log_warn("agent_api", &format!("Agent API listener stopped: {err}"));
        }
    });
    *runtime = Some(AgentRuntime { task, port, write_enabled });
    Ok(AgentApiStatus { running: true, port: Some(port), write_enabled, key_configured: true })
}

#[tauri::command]
pub async fn agent_api_test_connection(
    manager: State<'_, AgentApiManager>,
) -> Result<String, String> {
    let port = manager.inner.runtime.lock().await.as_ref()
        .map(|r| r.port).ok_or("Agent API is disabled")?;
    let key = key::load_key()?.ok_or("No Agent API key is configured")?;
    let url = format!("http://127.0.0.1:{port}/v1/accounts");
    let response = reqwest::Client::new()
        .get(url)
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {key}"))
        .timeout(std::time::Duration::from_secs(3))
        .send().await.map_err(|_| "Agent API connection failed".to_string())?;
    if !response.status().is_success() {
        return Err("Agent API rejected its own authentication test".into());
    }
    Ok("Loopback API authenticated successfully".into())
}

#[tauri::command]
pub async fn agent_api_stop(
    manager: State<'_, AgentApiManager>,
) -> Result<(), String> {
    if manager.inner.active_operation.lock()
        .map_err(|_| "Agent operation lock unavailable")?.is_some() {
        return Err("Agent rotation is in progress. Disable the API after it completes.".into());
    }
    if let Some(runtime) = manager.inner.runtime.lock().await.take() {
        runtime.task.abort();
    }
    let pending = manager.inner.active_operation.lock().ok()
        .and_then(|busy| busy.as_ref().cloned());
    if let Some(id) = pending {
        manager.complete(&id, false);
    }
    Ok(())
}

#[tauri::command]
pub fn agent_api_publish_snapshot(
    manager: State<'_, AgentApiManager>,
    snapshot: AgentApiSnapshot,
) -> Result<(), String> {
    snapshot.validate()?;
    *manager.inner.snapshot.write()
        .map_err(|_| "Agent API snapshot lock unavailable")? = snapshot;
    Ok(())
}

#[tauri::command]
pub fn agent_api_finish_rotation(
    manager: State<'_, AgentApiManager>,
    operation_id: String,
    success: bool,
) -> Result<(), String> {
    let operations = manager.inner.operations.lock()
        .map_err(|_| "Agent operation lock unavailable")?;
    if !operations.contains_key(&operation_id) {
        return Err("Unknown agent rotation operation".into());
    }
    drop(operations);
    manager.complete(&operation_id, success);
    Ok(())
}

