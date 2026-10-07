//! Reopening the agy CLI after an account switch. The CLI lives in a terminal we do not own,
//! so a stopped CLI is started again in a new console window, in the same folder.

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgyCliTarget {
    pub executable: String,
    pub cwd: Option<String>,
}

pub fn is_agy_executable(path: &str) -> bool {
    std::path::Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            matches!(
                name.to_ascii_lowercase().as_str(),
                "agy" | "agy.exe" | "antigravity-cli" | "antigravity-cli.exe"
            )
        })
        .unwrap_or(false)
}

/// First running process whose executable is the agy CLI. Rows are (exe path, working folder).
pub fn pick_agy_target(rows: &[(Option<String>, Option<String>)]) -> Option<AgyCliTarget> {
    rows.iter().find_map(|(exe, cwd)| {
        let executable = exe.as_deref().filter(|path| is_agy_executable(path))?;
        Some(AgyCliTarget {
            executable: executable.to_string(),
            cwd: cwd.clone().filter(|dir| !dir.trim().is_empty()),
        })
    })
}

/// The agy CLI that is running right now, with where it was started. Call before stopping it.
pub fn find_running_agy() -> Option<AgyCliTarget> {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        ProcessRefreshKind::new()
            .with_exe(UpdateKind::Always)
            .with_cwd(UpdateKind::Always),
    );
    let rows: Vec<(Option<String>, Option<String>)> = sys
        .processes()
        .values()
        .map(|process| {
            (
                process.exe().map(|p| p.to_string_lossy().to_string()),
                process.cwd().map(|p| p.to_string_lossy().to_string()),
            )
        })
        .collect();
    pick_agy_target(&rows)
}

/// Starts the CLI again in a new console window. Ok(false) when this platform cannot do it.
#[cfg(target_os = "windows")]
pub fn relaunch_agy(target: &AgyCliTarget) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    let mut command = std::process::Command::new(&target.executable);
    // Same folder as before; fall back to the home folder rather than QuotaShift's own.
    let folder = target
        .cwd
        .clone()
        .filter(|dir| std::path::Path::new(dir).is_dir())
        .or_else(|| std::env::var("USERPROFILE").ok());
    if let Some(dir) = folder {
        command.current_dir(dir);
    }
    command
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map(|_| true)
        .map_err(|e| format!("Failed to reopen agy: {e}"))
}

#[cfg(not(target_os = "windows"))]
pub fn relaunch_agy(_target: &AgyCliTarget) -> Result<bool, String> {
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_agy_executables() {
        assert!(is_agy_executable(
            "C:\\Users\\me\\AppData\\Local\\agy\\bin\\agy.exe"
        ));
        assert!(is_agy_executable("/usr/local/bin/agy"));
        assert!(is_agy_executable("C:\\tools\\Antigravity-CLI.exe"));
        assert!(!is_agy_executable("C:\\Windows\\System32\\ping.exe"));
        assert!(!is_agy_executable("C:\\Program Files\\nodejs\\node.exe"));
    }

    #[test]
    fn picks_first_agy_with_its_folder() {
        let rows = vec![
            (
                Some("C:\\nodejs\\node.exe".to_string()),
                Some("C:\\a".to_string()),
            ),
            (None, None),
            (
                Some("C:\\agy\\bin\\agy.exe".to_string()),
                Some("C:\\work\\proj".to_string()),
            ),
        ];
        assert_eq!(
            pick_agy_target(&rows),
            Some(AgyCliTarget {
                executable: "C:\\agy\\bin\\agy.exe".to_string(),
                cwd: Some("C:\\work\\proj".to_string()),
            })
        );
    }

    #[test]
    fn nothing_running_means_no_target() {
        assert_eq!(pick_agy_target(&[]), None);
        let rows = vec![(Some("C:\\nodejs\\node.exe".to_string()), None)];
        assert_eq!(pick_agy_target(&rows), None);
    }

    #[test]
    fn blank_folder_is_dropped() {
        let rows = vec![(Some("agy.exe".to_string()), Some("  ".to_string()))];
        assert_eq!(pick_agy_target(&rows).and_then(|t| t.cwd), None);
    }
}
