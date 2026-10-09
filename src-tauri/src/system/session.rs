use serde::Serialize;
#[cfg(target_os = "windows")]
use serde_json::Value;
use std::process::Command;

pub mod store;
pub use store::*;

pub mod executable;
pub(crate) use executable::*;

mod switch_message;
use switch_message::{compose_switch_message, SwitchOutcome};

use crate::system::cli_restore::{self, CliKind, RestoreOutcome};

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod unix;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use unix::*;

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
    pub cli_outcomes: Vec<RestoreOutcome>,
    pub message: String,
}

pub fn detect_antigravity_runtime() -> AntigravityRuntimeState {
    #[cfg(target_os = "windows")]
    {
        let powershell = r#"$processes = Get-CimInstance Win32_Process; $ide = $processes | Where-Object { $_.Name -eq 'Antigravity.exe' -or $_.Name -eq 'Antigravity IDE.exe' } | Select-Object -First 1; $cli = $processes | Where-Object { $_.ProcessId -ne $PID -and $_.Name -notmatch '^(pwsh|powershell|cmd|bash|wt|WindowsTerminal)\.exe$' -and ($_.Name -match '^(agy|antigravity-cli)(\.exe)?$' -or ($_.CommandLine -and ($_.CommandLine -match '(^|\s)agy(\.exe)?(\s|$)' -or $_.CommandLine -match 'antigravity-cli'))) } | Select-Object -First 1; [PSCustomObject]@{ ideDetected = [bool]$ide; cliDetected = [bool]$cli; ideExecutable = if ($ide) { $ide.ExecutablePath } else { $null } } | ConvertTo-Json -Compress"#;
        if let Ok(output) = crate::run_cmd(Command::new("powershell"))
            .args(["-NoProfile", "-NonInteractive", "-Command", powershell])
            .output()
        {
            if output.status.success() {
                if let Ok(value) = serde_json::from_slice::<Value>(&output.stdout) {
                    return AntigravityRuntimeState {
                        ide_detected: value
                            .get("ideDetected")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        cli_detected: value
                            .get("cliDetected")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        ide_executable: value
                            .get("ideExecutable")
                            .and_then(Value::as_str)
                            .filter(|v| !v.trim().is_empty())
                            .map(ToOwned::to_owned),
                    };
                }
            }
        }
        AntigravityRuntimeState::default()
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
    let powershell = r#"$targets = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -notmatch '^(pwsh|powershell|cmd|bash|wt|WindowsTerminal)\.exe$' -and ($_.Name -match '^(agy|antigravity-cli)(\.exe)?$' -or ($_.CommandLine -and ($_.CommandLine -match '(^|\s)agy(\.exe)?(\s|$)' -or $_.CommandLine -match 'antigravity-cli')) -or $_.Name -like '*language_server*' -or ($_.CommandLine -and $_.CommandLine -like '*language_server*')) }); $count = $targets.Count; foreach ($target in $targets) { Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Output $count"#;
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
        for img in [
            "Antigravity IDE.exe",
            "Antigravity.exe",
            "language_server.exe",
        ] {
            let _ = crate::run_cmd(Command::new("taskkill"))
                .args(["/F", "/IM", img])
                .output();
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    unix_quit_antigravity_ide().await?;
    Ok(())
}

pub(crate) async fn open_antigravity_ide_at(executable: &str) -> Result<(), String> {
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
    restart: bool,
) -> Result<AntigravitySwitchResult, String> {
    let runtime = detect_antigravity_runtime();
    let restart_ide = restart && runtime.ide_detected;
    // Read where each CLI runs before anything is stopped, so it can be resumed there.
    let cli_snapshots = if restart && runtime.cli_detected {
        cli_restore::capture(CliKind::Agy)
    } else {
        Vec::new()
    };
    if restart_ide {
        quit_antigravity_ide().await?;
    }

    let (active_token, active_id_token) = if let Some(rt) = &refresh_token {
        match crate::quota::do_refresh_antigravity_token(rt, None).await {
            Ok(refreshed) => (
                refreshed
                    .get("access_token")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| token.clone()),
                refreshed
                    .get("id_token")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            ),
            Err(_) => (token.clone(), None),
        }
    } else {
        (token.clone(), None)
    };

    write_antigravity_session(
        active_token,
        refresh_token,
        profile_url,
        email,
        active_id_token,
    )
    .await?;

    let (cli_stopped, cli_stop_error) = if restart && runtime.cli_detected {
        match stop_antigravity_cli().await {
            Ok(s) => (s, None),
            Err(e) => (false, Some(e)),
        }
    } else {
        (false, None)
    };

    let (ide_restarted, ide_restart_error) = if restart_ide {
        match runtime.ide_executable.as_deref() {
            Some(executable) => match open_antigravity_ide_at(executable).await {
                Ok(()) => (true, None), Err(e) => (false, Some(e)),
            },
            None => (false, Some("The running Antigravity IDE executable path could not be resolved before switching.".to_string())),
        }
    } else {
        (false, None)
    };

    let cli_outcomes = if cli_stopped {
        cli_restore::restore(cli_snapshots).await
    } else {
        Vec::new()
    };
    let cli_summary = cli_restore::summarize(&cli_outcomes);

    let message = compose_switch_message(&SwitchOutcome {
        restart,
        ide_detected: runtime.ide_detected,
        cli_detected: runtime.cli_detected,
        ide_restarted,
        cli_stopped,
        cli_stop_error: cli_stop_error.as_deref(),
        cli_summary: Some(cli_summary.as_str()).filter(|s| !s.is_empty()),
        ide_restart_error: ide_restart_error.as_deref(),
    });

    Ok(AntigravitySwitchResult {
        ide_detected: runtime.ide_detected,
        cli_detected: runtime.cli_detected,
        ide_restarted,
        cli_stopped,
        ide_restart_error,
        cli_stop_error,
        cli_outcomes,
        message,
    })
}

pub async fn read_codex_auth() -> Result<Option<String>, String> {
    let home = get_home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let path = home.join(".codex").join("auth.json");
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|e| e.to_string())
}

pub async fn write_codex_auth(content: String) -> Result<(), String> {
    crate::codex_sync::write_codex_auth_content(&content)
}

#[cfg(test)]
mod tests;
