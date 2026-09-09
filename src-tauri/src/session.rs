use std::io::Write;
use std::process::{Command, Output, Stdio};
use serde::Serialize;
use serde_json::Value;

// Load python scripts at compile time. Credential-manager helpers are only used on Windows.
#[cfg(target_os = "windows")]
const READ_CRED_MGR_PY: &str = include_str!("python/read_cred_mgr.py");
const READ_VSCDB_PY: &str = include_str!("python/read_vscdb.py");
#[cfg(target_os = "windows")]
const WRITE_CRED_MGR_PY: &str = include_str!("python/write_cred_mgr.py");
const WRITE_VSCDB_PY: &str = include_str!("python/write_vscdb.py");
#[cfg(target_os = "windows")]
const DELETE_CRED_PY: &str = include_str!("python/delete_cred.py");
const DELETE_SESSION_PY: &str = include_str!("python/delete_session.py");
const READ_ADC_PY: &str = include_str!("python/read_adc.py");

/// Run an embedded Python writer with its credential payload on stdin.
///
/// Keeping this boundary in one helper makes it difficult for callers to
/// accidentally put tokens in process arguments. The command receives only
/// the interpreter flag and fixed embedded script text.
fn run_python_json_command(mut command: Command, script: &str, payload: &Value) -> Result<Output, String> {
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
        // Drop stdin before waiting so malformed or failing writers cannot
        // remain blocked waiting for EOF.
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
        let payload = serde_json::json!({
            "token": token.clone(),
            "refresh_token": refresh_token.clone(),
        });
        let output = run_python_json(WRITE_CRED_MGR_PY, &payload)?;
        let out_str = String::from_utf8_lossy(&output.stdout);
        if !output.status.success() || !out_str.contains("SUCCESS_V2") {
            return Err("Failed to write Credential Manager".to_string());
        }
    }

    // ── Antigravity 1.x fallback: write to state.vscdb ────────────────
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

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityRuntimeState {
    pub ide_detected: bool,
    pub cli_detected: bool,
    pub ide_executable: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravitySwitchResult {
    pub ide_detected: bool,
    pub cli_detected: bool,
    pub ide_restarted: bool,
    pub cli_stopped: bool,
    pub ide_restart_error: Option<String>,
    pub cli_stop_error: Option<String>,
    pub message: String,
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn unix_process_rows() -> Vec<(u32, String, String)> {
    let output = match Command::new("ps").args(["-axo", "pid=,comm=,args="]).output() {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let pid = parts.next()?.parse::<u32>().ok()?;
            let command = parts.next()?.to_string();
            let args = parts.collect::<Vec<_>>().join(" ");
            Some((pid, command, args))
        })
        .collect()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn process_basename(command: &str) -> String {
    std::path::Path::new(command)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(command)
        .to_ascii_lowercase()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn is_antigravity_cli_process(command: &str, args: &str) -> bool {
    let name = process_basename(command);
    if matches!(name.as_str(), "agy" | "agy.exe" | "antigravity-cli" | "antigravity-cli.exe") {
        return true;
    }

    let lower = args.to_ascii_lowercase();
    if lower.contains("antigravity-cli") {
        return true;
    }

    lower.split_whitespace().any(|token| {
        let trimmed = token.trim_matches(|ch: char| ch == '"' || ch == '\'' || ch == ',' || ch == ';');
        matches!(process_basename(trimmed).as_str(), "agy" | "agy.exe")
    })
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn is_antigravity_ide_process(command: &str, args: &str) -> bool {
    if is_antigravity_cli_process(command, args) {
        return false;
    }

    let name = process_basename(command);
    #[cfg(target_os = "linux")]
    if matches!(name.as_str(), "antigravity" | "antigravity-ide") {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        let lower = args.to_ascii_lowercase();
        if lower.contains("antigravity.app/contents/macos/antigravity")
            || lower.contains("antigravity ide.app/contents/macos/antigravity ide")
            || matches!(name.as_str(), "antigravity" | "antigravity ide")
        {
            return true;
        }
    }

    false
}

#[cfg(target_os = "linux")]
fn unix_running_ide_executable(pid: u32, _command: &str) -> Option<String> {
    std::fs::read_link(format!("/proc/{pid}/exe"))
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(target_os = "macos")]
fn unix_running_ide_executable(_pid: u32, command: &str) -> Option<String> {
    let path = std::path::PathBuf::from(command);
    if path.is_absolute() && path.exists() {
        return Some(path.to_string_lossy().to_string());
    }
    find_antigravity_executable()
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

pub fn detect_antigravity_runtime() -> AntigravityRuntimeState {
    #[cfg(target_os = "windows")]
    {
        let powershell = r#"$processes = Get-CimInstance Win32_Process; $ide = $processes | Where-Object { $_.Name -eq 'Antigravity.exe' -or $_.Name -eq 'Antigravity IDE.exe' } | Select-Object -First 1; $cli = $processes | Where-Object { $_.ProcessId -ne $PID -and ($_.Name -match '^(agy|antigravity-cli)(\.exe)?$' -or ($_.CommandLine -and ($_.CommandLine -match '(^|\s)agy(\.exe)?(\s|$)' -or $_.CommandLine -match 'antigravity-cli'))) } | Select-Object -First 1; [PSCustomObject]@{ ideDetected = [bool]$ide; cliDetected = [bool]$cli; ideExecutable = if ($ide) { $ide.ExecutablePath } else { $null } } | ConvertTo-Json -Compress"#;
        if let Ok(output) = crate::run_cmd(Command::new("powershell"))
            .args(["-NoProfile", "-NonInteractive", "-Command", powershell])
            .output()
        {
            if output.status.success() {
                if let Ok(value) = serde_json::from_slice::<Value>(&output.stdout) {
                    return AntigravityRuntimeState {
                        ide_detected: value.get("ideDetected").and_then(Value::as_bool).unwrap_or(false),
                        cli_detected: value.get("cliDetected").and_then(Value::as_bool).unwrap_or(false),
                        ide_executable: value
                            .get("ideExecutable")
                            .and_then(Value::as_str)
                            .filter(|value| !value.trim().is_empty())
                            .map(ToOwned::to_owned),
                    };
                }
            }
        }
        return AntigravityRuntimeState::default();
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let rows = unix_process_rows();
        let cli_detected = rows
            .iter()
            .any(|(_, command, args)| is_antigravity_cli_process(command, args));
        let ide = rows
            .iter()
            .find(|(_, command, args)| is_antigravity_ide_process(command, args));
        let ide_executable = ide.and_then(|(pid, command, _)| unix_running_ide_executable(*pid, command));
        return AntigravityRuntimeState {
            ide_detected: ide.is_some(),
            cli_detected,
            ide_executable,
        };
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    AntigravityRuntimeState::default()
}

#[cfg(target_os = "windows")]
async fn stop_antigravity_cli() -> Result<bool, String> {
    let powershell = r#"$targets = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ($_.Name -match '^(agy|antigravity-cli)(\.exe)?$' -or ($_.CommandLine -and ($_.CommandLine -match '(^|\s)agy(\.exe)?(\s|$)' -or $_.CommandLine -match 'antigravity-cli'))) }); $count = $targets.Count; foreach ($target in $targets) { Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop }; Write-Output $count"#;
    let output = crate::run_cmd(Command::new("powershell"))
        .args(["-NoProfile", "-NonInteractive", "-Command", powershell])
        .output()
        .map_err(|error| format!("Failed to stop Antigravity CLI: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Failed to stop Antigravity CLI: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let count = String::from_utf8_lossy(&output.stdout)
        .lines()
        .last()
        .and_then(|line| line.trim().parse::<usize>().ok())
        .unwrap_or(0);
    Ok(count > 0)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
async fn stop_antigravity_cli() -> Result<bool, String> {
    let pids = unix_process_rows()
        .into_iter()
        .filter(|(_, command, args)| is_antigravity_cli_process(command, args))
        .map(|(pid, _, _)| pid)
        .collect::<Vec<_>>();
    if pids.is_empty() {
        return Ok(false);
    }

    for pid in &pids {
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
    }
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    for pid in &pids {
        let still_running = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false);
        if still_running {
            let killed = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .output()
                .map_err(|error| format!("Failed to stop Antigravity CLI process {pid}: {error}"))?;
            if !killed.status.success() {
                return Err(format!("Failed to stop Antigravity CLI process {pid}"));
            }
        }
    }
    Ok(true)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
async fn stop_antigravity_cli() -> Result<bool, String> {
    Ok(false)
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
        for (pid, command, args) in unix_process_rows() {
            if is_antigravity_ide_process(&command, &args) {
                let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    Ok(())
}

pub(crate) fn find_antigravity_executable() -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let powershell = r#"$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Antigravity.exe' -or $_.Name -eq 'Antigravity IDE.exe' } | Select-Object -First 1; if ($p) { $p.ExecutablePath }"#;
        if let Ok(output) = crate::run_cmd(Command::new("powershell"))
            .args(["-NoProfile", "-NonInteractive", "-Command", powershell])
            .output()
        {
            if output.status.success() {
                for line in String::from_utf8_lossy(&output.stdout).lines() {
                    let executable = line.trim().trim_matches('"');
                    if executable.is_empty() {
                        continue;
                    }
                    let candidate = std::path::PathBuf::from(executable);
                    if candidate.is_file() {
                        return Ok(candidate);
                    }
                }
            }
        }

        let mut install_roots = Vec::new();
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            install_roots.push(std::path::PathBuf::from(local_appdata).join("Programs"));
        }
        for env_name in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(program_files) = std::env::var(env_name) {
                install_roots.push(std::path::PathBuf::from(program_files));
            }
        }
        for root in install_roots {
            for (directory, executable) in [
                ("Antigravity", "Antigravity.exe"),
                ("Antigravity", "Antigravity IDE.exe"),
                ("Antigravity IDE", "Antigravity IDE.exe"),
                ("Antigravity IDE", "Antigravity.exe"),
            ] {
                let candidate = root.join(directory).join(executable);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }

        for name in ["antigravity", "Antigravity.exe", "Antigravity IDE.exe"] {
            if let Ok(output) = crate::run_cmd(Command::new("where")).arg(name).output() {
                if output.status.success() {
                    for line in String::from_utf8_lossy(&output.stdout).lines() {
                        let candidate = std::path::PathBuf::from(line.trim().trim_matches('"'));
                        if candidate.is_file() {
                            return Ok(candidate);
                        }
                    }
                }
            }
        }
        return Err("Antigravity IDE executable not found".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        for candidate in [
            "/Applications/Antigravity IDE.app/Contents/MacOS/Antigravity IDE",
            "/Applications/Antigravity.app/Contents/MacOS/Antigravity",
        ] {
            let path = std::path::PathBuf::from(candidate);
            if path.exists() {
                return Ok(path);
            }
        }
        return Err("Antigravity IDE executable not found".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        for candidate in ["antigravity-ide", "antigravity"] {
            if let Ok(output) = Command::new("sh").args(["-c", &format!("command -v {}", candidate)]).output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Ok(std::path::PathBuf::from(path));
                    }
                }
            }
        }
        return Err("Antigravity IDE executable not found".to_string());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Err("Antigravity IDE is unsupported on this operating system".to_string())
}

async fn open_antigravity_ide_at(executable: &str) -> Result<(), String> {
    let path = std::path::PathBuf::from(executable);
    if !path.exists() {
        return Err(format!("Antigravity IDE executable no longer exists: {}", path.display()));
    }
    crate::run_cmd(Command::new(path))
        .spawn()
        .map_err(|error| format!("Failed to reopen Antigravity IDE: {error}"))?;
    Ok(())
}

pub async fn open_antigravity_ide() -> Result<(), String> {
    let executable = find_antigravity_executable()?;
    open_antigravity_ide_at(&executable.to_string_lossy()).await
}

pub async fn switch_antigravity_account(
    token: String,
    refresh_token: Option<String>,
    profile_url: Option<String>,
    email: Option<String>,
) -> Result<AntigravitySwitchResult, String> {
    let runtime = detect_antigravity_runtime();

    if runtime.ide_detected {
        quit_antigravity_ide().await?;
    }

    write_antigravity_session(token, refresh_token, profile_url, email).await?;

    let (cli_stopped, cli_stop_error) = if runtime.cli_detected {
        match stop_antigravity_cli().await {
            Ok(stopped) => (stopped, None),
            Err(error) => (false, Some(error)),
        }
    } else {
        (false, None)
    };

    let mut ide_restarted = false;
    let mut ide_restart_error = None;
    if runtime.ide_detected {
        match runtime.ide_executable.as_deref() {
            Some(executable) => match open_antigravity_ide_at(executable).await {
                Ok(()) => ide_restarted = true,
                Err(error) => ide_restart_error = Some(error),
            },
            None => {
                ide_restart_error = Some("The running Antigravity IDE executable path could not be resolved before switching.".to_string());
            }
        }
    }

    let mut message = match (runtime.ide_detected, runtime.cli_detected, ide_restarted, cli_stopped) {
        (true, true, true, true) => "IDE switched and restarted. CLI switched — run agy again.".to_string(),
        (false, true, _, true) => "CLI switched — run agy again.".to_string(),
        (true, false, true, _) => "IDE switched and restarted.".to_string(),
        (false, false, _, _) => "Credentials switched. The next Antigravity IDE or agy session will use this account.".to_string(),
        _ => "Antigravity credentials switched.".to_string(),
    };

    if let Some(error) = &cli_stop_error {
        message.push_str(&format!(" The running CLI could not be stopped: {error}. Restart agy manually."));
    } else if runtime.cli_detected && !cli_stopped {
        message.push_str(" The CLI was detected but had already exited; run agy again to use the switched account.");
    }
    if let Some(error) = &ide_restart_error {
        message.push_str(&format!(" IDE credentials were switched, but restart failed: {error}"));
    }

    Ok(AntigravitySwitchResult {
        ide_detected: runtime.ide_detected,
        cli_detected: runtime.cli_detected,
        ide_restarted,
        cli_stopped,
        ide_restart_error,
        cli_stop_error,
        message,
    })
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

#[cfg(test)]
mod tests {
    use super::run_python_json_command;
    use serde_json::json;
    use std::process::Command;

    #[test]
    fn python_writer_payload_stays_out_of_process_arguments() {
        let secret = "access token 'quoted' \u{1f512}";
        let payload = json!({
            "db_paths": ["C:/synthetic/profile/state.vscdb"],
            "token": secret,
            "refresh_token": "refresh\"quoted",
            "email": "unicode-用户@example.test",
        });
        let script = r#"import json, sys; print(json.dumps({"args": sys.argv[1:], "input": json.loads(sys.stdin.buffer.read().decode('utf-8'))}))"#;
        let output = run_python_json_command(Command::new("python"), script, &payload).expect("python helper should run");
        assert!(output.status.success());
        let captured: serde_json::Value = serde_json::from_slice(&output.stdout).expect("fake helper output should be JSON");
        let args = captured["args"].as_array().expect("args should be an array");
        assert!(args.iter().all(|arg| arg.as_str().map(|value| !value.contains(secret)).unwrap_or(true)));
        assert_eq!(captured["input"]["token"], secret);
        assert_eq!(captured["input"]["refresh_token"], "refresh\"quoted");
    }
}
