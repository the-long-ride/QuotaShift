//! Antigravity App/IDE restart: target recorded application processes, not unrelated services.
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

pub async fn quit_antigravity_ide() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let pids: Vec<u32> = crate::system::process::scan_process_records()
            .into_iter()
            .filter(|p| matches!(p.name.to_ascii_lowercase().as_str(), "antigravity.exe" | "antigravity ide.exe"))
            .map(|p| p.pid)
            .filter(|pid| *pid != std::process::id())
            .collect();
        for pid in pids {
            let output = crate::run_cmd(Command::new("taskkill"))
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .map_err(|e| format!("Failed to stop Antigravity process: {e}"))?;
            if !output.status.success() {
                return Err(format!("Failed to stop Antigravity process {pid}"));
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    super::unix_quit_antigravity_ide().await?;
    Ok(())
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

pub async fn verify_antigravity_restarted() -> Result<(), String> {
    // A successful spawn is not proof that the app actually started.
    for _ in 0..6 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if super::detect_antigravity_runtime().ide_detected {
            return Ok(());
        }
    }
    Err("Antigravity App did not appear after relaunch; open it manually.".to_string())
}
