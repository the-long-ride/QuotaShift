use std::process::Command;

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn unix_process_rows() -> Vec<(u32, String, String)> {
    let output = match Command::new("ps")
        .args(["-axo", "pid=,comm=,args="])
        .output()
    {
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
pub fn process_basename(command: &str) -> String {
    std::path::Path::new(command)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(command)
        .to_ascii_lowercase()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn is_antigravity_cli_process(command: &str, args: &str) -> bool {
    let name = process_basename(command);
    if matches!(
        name.as_str(),
        "agy" | "agy.exe" | "antigravity-cli" | "antigravity-cli.exe"
    ) {
        return true;
    }

    let lower = args.to_ascii_lowercase();
    if lower.contains("antigravity-cli") || lower.contains("language_server") {
        return true;
    }

    lower.split_whitespace().any(|token| {
        let trimmed =
            token.trim_matches(|ch: char| ch == '"' || ch == '\'' || ch == ',' || ch == ';');
        matches!(process_basename(trimmed).as_str(), "agy" | "agy.exe")
    })
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn is_antigravity_ide_process(command: &str, args: &str) -> bool {
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
pub fn unix_running_ide_executable(pid: u32, _command: &str) -> Option<String> {
    std::fs::read_link(format!("/proc/{pid}/exe"))
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(target_os = "macos")]
pub fn unix_running_ide_executable(_pid: u32, command: &str) -> Option<String> {
    let path = std::path::PathBuf::from(command);
    if path.is_absolute() && path.exists() {
        return Some(path.to_string_lossy().to_string());
    }
    unix_find_antigravity_executable()
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub async fn unix_stop_antigravity_cli() -> Result<bool, String> {
    let pids = unix_process_rows()
        .into_iter()
        .filter(|(_, cmd, args)| is_antigravity_cli_process(cmd, args))
        .map(|(pid, _, _)| pid)
        .collect::<Vec<_>>();
    if pids.is_empty() {
        return Ok(false);
    }
    for pid in &pids {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output();
    }
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    for pid in &pids {
        let still_running = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if still_running {
            let killed = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .output()
                .map_err(|e| format!("Failed to stop Antigravity CLI process {pid}: {e}"))?;
            if !killed.status.success() {
                return Err(format!("Failed to stop Antigravity CLI process {pid}"));
            }
        }
    }
    Ok(true)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub async fn unix_quit_antigravity_ide() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("osascript")
            .args(["-e", "tell application \"Antigravity IDE\" to quit"])
            .output();
        let _ = Command::new("osascript")
            .args(["-e", "tell application \"Antigravity\" to quit"])
            .output();
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    #[cfg(target_os = "linux")]
    {
        for (pid, command, args) in unix_process_rows() {
            if is_antigravity_ide_process(&command, &args) {
                let _ = Command::new("kill")
                    .args(["-TERM", &pid.to_string()])
                    .output();
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn unix_find_antigravity_executable() -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let mut roots = vec![std::path::PathBuf::from("/Applications")];
        if let Ok(home) = std::env::var("HOME") {
            roots.push(std::path::PathBuf::from(home).join("Applications"));
        }
        for root in roots {
            for app_name in ["Antigravity.app", "Antigravity IDE.app"] {
                for relative in [
                    "Contents/MacOS/Antigravity",
                    "Contents/MacOS/Antigravity IDE",
                    "Contents/MacOS/Electron",
                ] {
                    let candidate = root.join(app_name).join(relative);
                    if candidate.is_file() {
                        return Ok(candidate);
                    }
                }
            }
        }
        Err("Antigravity IDE application was not found on macOS".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        for candidate in ["antigravity-ide", "antigravity"] {
            if let Ok(output) = Command::new("sh")
                .args(["-c", &format!("command -v {}", candidate)])
                .output()
            {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        let candidate_path = std::path::PathBuf::from(path);
                        if candidate_path.is_file() {
                            return Ok(candidate_path);
                        }
                    }
                }
            }
        }
        Err("Antigravity IDE executable was not found on Linux PATH".to_string())
    }
}
