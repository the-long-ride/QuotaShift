use serde::Serialize;
use serde_json::Value;
use std::process::Command;

#[path = "session_store.rs"]
pub mod session_store;
pub use session_store::*;

#[path = "session_unix.rs"]
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod session_unix;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use session_unix::*;

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
                        ide_executable: value.get("ideExecutable").and_then(Value::as_str).filter(|v| !v.trim().is_empty()).map(ToOwned::to_owned),
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
            .any(|(_, cmd, args)| is_antigravity_cli_process(cmd, args));
        let ide = rows
            .iter()
            .find(|(_, cmd, args)| is_antigravity_ide_process(cmd, args));
        let ide_executable = ide.and_then(|(pid, cmd, _)| unix_running_ide_executable(*pid, cmd));
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
        .and_then(|l| l.trim().parse::<usize>().ok())
        .unwrap_or(0);
    Ok(count > 0)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
async fn stop_antigravity_cli() -> Result<bool, String> {
    unix_stop_antigravity_cli().await
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
async fn stop_antigravity_cli() -> Result<bool, String> {
    Ok(false)
}

pub async fn quit_antigravity_ide() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        for img in ["Antigravity IDE.exe", "Antigravity.exe", "language_server.exe"] {
            let _ = crate::run_cmd(Command::new("taskkill")).args(["/F", "/IM", img]).output();
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    unix_quit_antigravity_ide().await?;
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
                    let exe = line.trim().trim_matches('"');
                    if !exe.is_empty() && std::path::Path::new(exe).is_file() {
                        return Ok(std::path::PathBuf::from(exe));
                    }
                }
            }
        }
        let mut install_roots = Vec::new();
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            install_roots.push(std::path::PathBuf::from(local).join("Programs"));
        }
        for env in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(env) {
                install_roots.push(std::path::PathBuf::from(pf));
            }
        }
        for root in install_roots {
            for (dir, exe) in [
                ("Antigravity", "Antigravity.exe"),
                ("Antigravity", "Antigravity IDE.exe"),
                ("Antigravity IDE", "Antigravity IDE.exe"),
                ("Antigravity IDE", "Antigravity.exe"),
            ] {
                let candidate = root.join(dir).join(exe);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
        for name in ["antigravity", "Antigravity.exe", "Antigravity IDE.exe"] {
            if let Ok(output) = crate::run_cmd(Command::new("where")).arg(name).output() {
                if output.status.success() {
                    for line in String::from_utf8_lossy(&output.stdout).lines() {
                        let c = std::path::PathBuf::from(line.trim().trim_matches('"'));
                        if c.is_file() {
                            return Ok(c);
                        }
                    }
                }
            }
        }
        return Err("Antigravity IDE executable not found".to_string());
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    unix_find_antigravity_executable()
}

async fn open_antigravity_ide_at(executable: &str) -> Result<(), String> {
    let path = std::path::PathBuf::from(executable);
    if !path.exists() {
        return Err(format!(
            "Antigravity IDE executable no longer exists: {}",
            path.display()
        ));
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

    let mut message = match (
        runtime.ide_detected,
        runtime.cli_detected,
        ide_restarted,
        cli_stopped,
    ) {
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
    if !path.exists() { return Ok(None); }
    std::fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

pub async fn write_codex_auth(content: String) -> Result<(), String> {
    crate::codex_sync::write_codex_auth_content(&content)
}

#[cfg(test)]
#[path = "session_test.rs"]
mod tests;
