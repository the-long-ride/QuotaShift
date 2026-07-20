use std::process::Command;
use serde_json::Value;

// Load python scripts at compile time
const READ_CRED_MGR_PY: &str = include_str!("python/read_cred_mgr.py");
const READ_VSCDB_PY: &str = include_str!("python/read_vscdb.py");
const WRITE_CRED_MGR_PY: &str = include_str!("python/write_cred_mgr.py");
const WRITE_VSCDB_PY: &str = include_str!("python/write_vscdb.py");
const DELETE_CRED_PY: &str = include_str!("python/delete_cred.py");
const DELETE_SESSION_PY: &str = include_str!("python/delete_session.py");
const READ_ADC_PY: &str = include_str!("python/read_adc.py");

pub(crate) fn get_home_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok().map(std::path::PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(std::path::PathBuf::from)
    }
}

pub(crate) fn get_antigravity_db_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    #[cfg(target_os = "windows")]
    let base = std::env::var("APPDATA").ok().map(std::path::PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join("Library/Application Support"));
    #[cfg(target_os = "linux")]
    let base = std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".config"));
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let base = None;

    if let Some(b) = base {
        paths.push(b.join("antigravity").join("User").join("globalStorage").join("state.vscdb"));
        paths.push(b.join("Antigravity").join("User").join("globalStorage").join("state.vscdb"));
        paths.push(b.join("Antigravity IDE").join("User").join("globalStorage").join("state.vscdb"));
    }
    paths
}

fn get_adc_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    #[cfg(target_os = "windows")]
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(std::path::PathBuf::from(appdata).join("gcloud").join("application_default_credentials.json"));
    }
    #[cfg(not(target_os = "windows"))]
    if let Some(home) = get_home_dir() {
        paths.push(home.join(".config").join("gcloud").join("application_default_credentials.json"));
    }
    paths
}

pub async fn read_antigravity_session() -> Result<Value, String> {
    let mut result_map = serde_json::Map::new();

    // ── Antigravity 2.0: read from Windows Credential Manager ─────────
    #[cfg(target_os = "windows")]
    {
        let output = crate::run_cmd(Command::new("python"))
            .args(["-c", READ_CRED_MGR_PY])
            .output()
            .map_err(|e| format!("Failed to run python: {}", e))?;
        if output.status.success() {
            let stdout_str = String::from_utf8_lossy(&output.stdout);
            if let Ok(val) = serde_json::from_str::<Value>(stdout_str.trim()) {
                if let Some(obj) = val.as_object() {
                    for (k, v) in obj {
                        result_map.insert(k.clone(), v.clone());
                    }
                }
            }
        }
    }

    // ── Antigravity 1.x fallback: read from state.vscdb ───────────────
    let db_paths = get_antigravity_db_paths();
    let paths_str = db_paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<String>>().join("|");

    let output = crate::run_cmd(Command::new("python"))
        .args(["-c", READ_VSCDB_PY, &paths_str])
        .output()
        .map_err(|e| format!("Failed to run python: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    if let Ok(val) = serde_json::from_str::<Value>(stdout_str.trim()) {
        if let Some(obj) = val.as_object() {
            for (k, v) in obj {
                if !result_map.contains_key(k) {
                    result_map.insert(k.clone(), v.clone());
                }
            }
        }
    }

    // ── Antigravity CLI / gcloud ADC fallback ────────────────────────
    let adc_paths = get_adc_paths();
    let adc_paths_str = adc_paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<String>>().join("|");

    let adc_output = crate::run_cmd(Command::new("python"))
        .args(["-c", READ_ADC_PY, &adc_paths_str])
        .output();

    if let Ok(output) = adc_output {
        if output.status.success() {
            let adc_stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(val) = serde_json::from_str::<Value>(adc_stdout.trim()) {
                if let Some(obj) = val.as_object() {
                    for (k, v) in obj {
                        if !result_map.contains_key(k) {
                            result_map.insert(k.clone(), v.clone());
                        }
                    }
                }
            }
        }
    }

    Ok(Value::Object(result_map))
}

pub async fn write_antigravity_session(token: String, refresh_token: Option<String>, profile_url: Option<String>, email: Option<String>) -> Result<(), String> {
    // ── Antigravity 2.0: write to Windows Credential Manager ──────────
    #[cfg(target_os = "windows")]
    {
        let token_clone = token.clone();
        let refresh_clone = refresh_token.clone().unwrap_or_default();
        let output = crate::run_cmd(Command::new("python"))
            .args(["-c", WRITE_CRED_MGR_PY, &token_clone, &refresh_clone])
            .output()
            .map_err(|e| format!("Failed to run python: {}", e))?;
        let out_str = String::from_utf8_lossy(&output.stdout);
        if out_str.contains("WRITE_FAILED") {
            return Err(format!("Failed to write Credential Manager: {}", out_str.trim()));
        }
    }

    // ── Antigravity 1.x fallback: write to state.vscdb ────────────────
    let db_paths = get_antigravity_db_paths();
    let paths_str = db_paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<String>>().join("|");

    let profile_str = profile_url.unwrap_or_default();
    let refresh_str = refresh_token.unwrap_or_default();
    let email_str = email.unwrap_or_default();
    let output = crate::run_cmd(Command::new("python"))
        .args(["-c", WRITE_VSCDB_PY, &paths_str, &token, &profile_str, &refresh_str, &email_str])
        .output()
        .map_err(|e| format!("Failed to run python: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let out_str = String::from_utf8_lossy(&output.stdout);
    if out_str.contains("ERROR:") {
        return Err(out_str.trim().to_string());
    }

    Ok(())
}

pub async fn delete_antigravity_session() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = crate::run_cmd(Command::new("python")).args(["-c", DELETE_CRED_PY]).output();
    }

    let db_paths = get_antigravity_db_paths();
    let paths_str = db_paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<String>>().join("|");

    let output = crate::run_cmd(Command::new("python"))
        .args(["-c", DELETE_SESSION_PY, &paths_str])
        .output()
        .map_err(|e| format!("Failed to run python: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let out_str = String::from_utf8_lossy(&output.stdout);
    if out_str.contains("ERROR:") {
        return Err(out_str.trim().to_string());
    }

    Ok(())
}

pub async fn quit_antigravity_ide() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = crate::run_cmd(Command::new("taskkill")).args(["/F", "/IM", "Antigravity IDE.exe"]).output();
        let _ = crate::run_cmd(Command::new("taskkill")).args(["/F", "/IM", "Antigravity.exe"]).output();
        let _ = crate::run_cmd(Command::new("taskkill")).args(["/F", "/IM", "language_server.exe"]).output();
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("osascript").args(["-e", "tell application \"Antigravity IDE\" to quit"]).output();
        let _ = Command::new("osascript").args(["-e", "tell application \"Antigravity\" to quit"]).output();
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("pkill").arg("-f").arg("Antigravity").output();
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    Ok(())
}

pub async fn open_antigravity_ide() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let local_appdata = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
        let mut path1 = std::path::PathBuf::from(&local_appdata);
        path1.push("Programs");
        path1.push("Antigravity");
        path1.push("Antigravity IDE.exe");

        if path1.exists() {
            let _ = crate::run_cmd(Command::new(path1)).spawn().map_err(|e| e.to_string())?;
            return Ok(());
        }

        let mut path2 = std::path::PathBuf::from(&local_appdata);
        path2.push("Programs");
        path2.push("Antigravity");
        path2.push("Antigravity.exe");

        if path2.exists() {
            let _ = crate::run_cmd(Command::new(path2)).spawn().map_err(|e| e.to_string())?;
            return Ok(());
        }

        Err("Antigravity IDE executable not found".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg("-a").arg("Antigravity IDE").output();
        let _ = Command::new("open").arg("-a").arg("Antigravity").output();
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("antigravity-ide").spawn();
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Ok(())
}

pub async fn read_codex_auth() -> Result<Option<String>, String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let path = home.join(".codex").join("auth.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

pub async fn write_codex_auth(content: String) -> Result<(), String> {
    crate::codex_sync::write_codex_auth_content(&content)
}
