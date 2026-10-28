#[cfg(target_os = "windows")]
use std::process::Command;

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
        Err("Antigravity IDE executable not found".to_string())
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        super::unix::unix_find_antigravity_executable()
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("Antigravity IDE is unsupported on this operating system".to_string())
    }
}
