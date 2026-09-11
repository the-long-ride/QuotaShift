use serde_json::Value;
use std::io::Write;
use std::process::{Command, Output, Stdio};

#[cfg(target_os = "windows")]
const READ_CRED_MGR_PY: &str = include_str!("../../python/read_cred_mgr.py");
const READ_VSCDB_PY: &str = include_str!("../../python/read_vscdb.py");
#[cfg(target_os = "windows")]
const WRITE_CRED_MGR_PY: &str = include_str!("../../python/write_cred_mgr.py");
const WRITE_VSCDB_PY: &str = include_str!("../../python/write_vscdb.py");
#[cfg(target_os = "windows")]
const DELETE_CRED_PY: &str = include_str!("../../python/delete_cred.py");
const DELETE_SESSION_PY: &str = include_str!("../../python/delete_session.py");
const READ_ADC_PY: &str = include_str!("../../python/read_adc.py");

pub fn run_python_json_command(
    mut command: Command,
    script: &str,
    payload: &Value,
) -> Result<Output, String> {
    let mut child = command
        .args(["-c", script])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "Failed to start Python credential writer".to_string())?;

    let input = serde_json::to_vec(payload)
        .map_err(|_| "Failed to serialize Python credential writer input".to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(&input).is_err() {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Failed to send Python credential writer input".to_string());
        }
    } else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Python credential writer did not accept stdin".to_string());
    }

    child
        .wait_with_output()
        .map_err(|_| "Failed to collect Python credential writer result".to_string())
}

pub(crate) fn run_python_json(script: &str, payload: &Value) -> Result<Output, String> {
    run_python_json_command(crate::run_cmd(Command::new("python")), script, payload)
}

pub(crate) fn get_home_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .ok()
            .map(std::path::PathBuf::from)
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
    let base = std::env::var("HOME")
        .ok()
        .map(|h| std::path::PathBuf::from(h).join("Library/Application Support"));
    #[cfg(target_os = "linux")]
    let base = std::env::var("HOME")
        .ok()
        .map(|h| std::path::PathBuf::from(h).join(".config"));
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let base = None;

    if let Some(b) = base {
        paths.push(
            b.join("antigravity")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        );
        paths.push(
            b.join("Antigravity")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        );
        paths.push(
            b.join("Antigravity IDE")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        );
    }
    paths
}

fn get_adc_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    #[cfg(target_os = "windows")]
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(
            std::path::PathBuf::from(appdata)
                .join("gcloud")
                .join("application_default_credentials.json"),
        );
    }
    #[cfg(not(target_os = "windows"))]
    if let Some(home) = get_home_dir() {
        paths.push(
            home.join(".config")
                .join("gcloud")
                .join("application_default_credentials.json"),
        );
    }
    paths
}

pub async fn read_antigravity_session() -> Result<Value, String> {
    let mut result_map = serde_json::Map::new();

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

    let db_paths = get_antigravity_db_paths();
    let paths_str = db_paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join("|");

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

    let adc_paths = get_adc_paths();
    let adc_paths_str = adc_paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join("|");

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

#[allow(unused_variables)]
pub async fn write_antigravity_session(
    token: String,
    refresh_token: Option<String>,
    profile_url: Option<String>,
    email: Option<String>,
    id_token: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let payload = serde_json::json!({
            "token": token.clone(),
            "refresh_token": refresh_token.clone(),
            "id_token": id_token.clone(),
            "email": email.clone(),
        });
        let output = run_python_json(WRITE_CRED_MGR_PY, &payload)?;
        let out_str = String::from_utf8_lossy(&output.stdout);
        if !output.status.success() || !out_str.contains("SUCCESS_V2") {
            return Err("Failed to write Credential Manager".to_string());
        }
    }

    let db_paths = get_antigravity_db_paths();
    let payload = serde_json::json!({
        "db_paths": db_paths,
        "token": token,
        "profile_url": profile_url,
        "refresh_token": refresh_token,
        "email": email,
    });
    let output = run_python_json(WRITE_VSCDB_PY, &payload)?;

    if !output.status.success() {
        return Err("Failed to write Antigravity SQLite session".to_string());
    }

    let out_str = String::from_utf8_lossy(&output.stdout);
    if out_str.contains("ERROR:") {
        return Err("Failed to write Antigravity SQLite session".to_string());
    }

    Ok(())
}

pub async fn delete_antigravity_session() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = crate::run_cmd(Command::new("python"))
            .args(["-c", DELETE_CRED_PY])
            .output();
    }

    let db_paths = get_antigravity_db_paths();
    let paths_str = db_paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join("|");

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
