//! Antigravity App/IDE restart: target recorded application processes, not unrelated services.
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

/// Stop only the recorded Antigravity App/IDE binary, not both products.
pub async fn quit_antigravity_ide() -> Result<(), String> {
    if let Some(executable) = super::detect_antigravity_runtime().ide_executable {
        quit_antigravity_ide_at(&executable).await
    } else {
        Ok(())
    }
}
fn same_executable(a: &str, b: &str) -> bool {
    if cfg!(windows) { a.eq_ignore_ascii_case(b) } else { a == b }
}
pub async fn quit_antigravity_ide_at(executable: &str) -> Result<(), String> {
    if executable.is_empty() {
        return Err("No Antigravity executable was selected".into());
    }
    #[cfg(target_os = "windows")]
    {
        // Use an environment variable rather than interpolating a file path
        // into a PowerShell script; never terminate every Antigravity.exe PID.
        let command = r#"$target = $env:QS_RESTART_TARGET; $apps = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('Antigravity.exe','Antigravity IDE.exe') -and $_.ExecutablePath -ieq $target }); foreach ($app in $apps) { Stop-Process -Id $app.ProcessId -Force -ErrorAction Stop }; Write-Output $apps.Count"#;
        let output = crate::run_cmd(Command::new("powershell"))
            .args(["-NoProfile", "-NonInteractive", "-Command", command])
            .env("QS_RESTART_TARGET", executable).output()
            .map_err(|e| format!("Cannot stop the selected Antigravity app: {e}"))?;
        if !output.status.success() {
            return Err("Windows could not terminate the selected Antigravity app".into());
        }
        let count = String::from_utf8_lossy(&output.stdout).lines().last()
            .and_then(|line| line.trim().parse::<u32>().ok()).unwrap_or(0);
        if count == 0 {
            return Err("The recorded Antigravity app was no longer running".into());
        }
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        // Match a known executable path, never stop all Antigravity-labeled apps.
        let mut matched = 0;
        for (pid, command, args) in super::unix_process_rows() {
            if !super::is_antigravity_ide_process(&command, &args) {
                continue;
            }
            let path = super::unix_running_ide_executable(pid, &command);
            if !path.as_deref().is_some_and(|candidate| same_executable(candidate, executable)) {
                continue;
            }
            let output = Command::new("kill").args(["-TERM", &pid.to_string()])
                .output().map_err(|e| format!("Cannot stop selected Antigravity app: {e}"))?;
            if !output.status.success() {
                return Err(format!("Cannot stop Antigravity app PID {pid}"));
            }
            matched += 1;
        }
        if matched == 0 {
            return Err("The recorded Antigravity app process is no longer identifiable".into());
        }
    }
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_millis(250)).await;
        // The selected app path must disappear; another Antigravity product
        // is allowed to remain open without blocking the switch.
        let running = super::detect_antigravity_runtime();
        if !running.ide_executable.as_deref()
            .is_some_and(|found| same_executable(found, executable)) {
            return Ok(());
        }
    }
    Err("Antigravity App did not exit; account switching was aborted".into())
}

pub async fn open_antigravity_ide_at(executable: &str) -> Result<(), String> {
    let path = PathBuf::from(executable);
    if !path.is_file() {
        return Err("The previously running Antigravity executable could not be found.".into());
    }
    #[cfg(target_os = "macos")]
    {
        // Launch the bundle (not the nested Mach-O executable) to retain its app identity.
        if let Some(prefix) = executable.find(".app/") {
            let bundle = &executable[..prefix + 4];
            Command::new("open")
                .args(["-a", bundle])
                .spawn()
                .map_err(|e| format!("Failed to reopen Antigravity App: {e}"))?;
            return Ok(());
        }
    }
    crate::run_cmd(Command::new(path))
        .spawn()
        .map_err(|e| format!("Failed to reopen Antigravity App: {e}"))?;
    Ok(())
}

pub async fn verify_antigravity_restarted(executable: &str) -> Result<(), String> {
    for _ in 0..12 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let runtime = super::detect_antigravity_runtime();
        if runtime.ide_detected && runtime.ide_executable.as_deref()
            .is_some_and(|path| same_executable(path, executable)) {
            return Ok(());
        }
    }
    Err("The originally selected Antigravity app did not relaunch".into())
}
