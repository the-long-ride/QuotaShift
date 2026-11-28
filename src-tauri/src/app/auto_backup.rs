use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

fn validate_auto_backup_file_name(file_name: &str) -> Result<&str, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || !trimmed.ends_with(".json")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || trimmed.contains("..")
    {
        return Err("Invalid auto-backup filename".to_string());
    }
    let mut components = Path::new(trimmed).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(trimmed),
        _ => Err("Invalid auto-backup filename".to_string()),
    }
}

pub(crate) fn expand_user_dir_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Auto-backup folder path is required".to_string());
    }
    if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        let home = crate::session::get_home_dir()
            .ok_or_else(|| "Could not locate home directory".to_string())?;
        let suffix = trimmed
            .trim_start_matches('~')
            .trim_start_matches(['/', '\\']);
        return Ok(if suffix.is_empty() {
            home
        } else {
            home.join(suffix)
        });
    }
    Ok(PathBuf::from(trimmed))
}

fn temp_backup_path(dir: &Path, safe_name: &str) -> PathBuf {
    dir.join(format!(
        ".{safe_name}.tmp-{}-{}",
        std::process::id(),
        rand::random::<u64>()
    ))
}

pub(crate) fn write_auto_backup_file_in_dir(
    dir: &Path,
    file_name: &str,
    content: &str,
) -> Result<PathBuf, String> {
    if content.trim().is_empty() {
        return Err("Auto-backup payload is empty".to_string());
    }
    let safe_name = validate_auto_backup_file_name(file_name)?;
    fs::create_dir_all(dir)
        .map_err(|error| format!("Failed to create auto-backup folder: {error}"))?;

    let target = dir.join(safe_name);
    let temp_path = temp_backup_path(dir, safe_name);
    let write_res = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|error| format!("Failed to stage auto-backup file: {error}"))?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Failed to write auto-backup file: {error}"))?;
        drop(file);
        if fs::rename(&temp_path, &target).is_err() {
            if target.exists() {
                fs::remove_file(&target)
                    .map_err(|error| format!("Failed to replace auto-backup file: {error}"))?;
            }
            fs::rename(&temp_path, &target)
                .map_err(|error| format!("Failed to commit auto-backup file: {error}"))?;
        }
        Ok(())
    })();

    if write_res.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_res.map(|_| target)
}

#[tauri::command]
pub fn write_auto_backup_file(
    dir_path: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    let dir = expand_user_dir_path(&dir_path)?;
    let target = write_auto_backup_file_in_dir(&dir, &file_name, &content)?;
    Ok(target.to_string_lossy().to_string())
}

fn pick_folder_blocking(initial_path: Option<String>) -> Result<Option<String>, String> {
    let initial = initial_path
        .as_deref()
        .and_then(|raw| expand_user_dir_path(raw).ok())
        .filter(|path| path.is_dir());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choose QuotaShift Auto Backup Folder'
$dialog.ShowNewFolderButton = $true
if ($env:QUOTASHIFT_INITIAL_DIR -and (Test-Path -LiteralPath $env:QUOTASHIFT_INITIAL_DIR)) {
  $dialog.SelectedPath = $env:QUOTASHIFT_INITIAL_DIR
}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
}
"#;
        let mut command = std::process::Command::new("powershell");
        command
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-NoProfile", "-STA", "-Command", script]);
        if let Some(dir) = initial {
            command.env("QUOTASHIFT_INITIAL_DIR", dir);
        }
        let output = command
            .output()
            .map_err(|error| format!("Failed to open folder picker: {error}"))?;
        if !output.status.success() {
            return Err("Folder picker failed to complete".to_string());
        }
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok((!selected.is_empty()).then_some(selected));
    }

    #[cfg(target_os = "macos")]
    {
        let mut script = String::from("try\n");
        if let Some(dir) = initial {
            let escaped = dir
                .to_string_lossy()
                .replace('\\', "\\\\")
                .replace('"', "\\\"");
            script.push_str(&format!(
                "POSIX path of (choose folder with prompt \"Choose QuotaShift Auto Backup Folder\" default location POSIX file \"{escaped}\")\n"
            ));
        } else {
            script.push_str(
                "POSIX path of (choose folder with prompt \"Choose QuotaShift Auto Backup Folder\")\n",
            );
        }
        script.push_str("on error number -128\nreturn \"\"\nend try");
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|error| format!("Failed to open folder picker: {error}"))?;
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok((!selected.is_empty()).then_some(selected));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut cmd = std::process::Command::new("zenity");
        cmd.args([
            "--file-selection",
            "--directory",
            "--title=Choose QuotaShift Auto Backup Folder",
        ]);
        if let Some(ref dir) = initial {
            cmd.arg(format!("--filename={}/", dir.to_string_lossy()));
        }
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return Ok((!selected.is_empty()).then_some(selected));
            }
            if output.status.code() == Some(1) {
                return Ok(None);
            }
        }
        Err("No system folder picker found; enter the folder path manually".to_string())
    }
}

#[tauri::command]
pub async fn pick_auto_backup_folder(
    initial_path: Option<String>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_folder_blocking(initial_path))
        .await
        .map_err(|error| format!("Folder picker task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "quotashift-autobackup-{label}-{}-{}",
                std::process::id(),
                rand::random::<u64>()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn overwrites_existing_target_atomically_without_tmp_leftovers() {
        let dir = TempDir::new("overwrite");
        let nested = dir.0.join("nested");
        let first =
            write_auto_backup_file_in_dir(&nested, "QuotaShift-Backup.json", "{\"v\":1}").unwrap();
        let second =
            write_auto_backup_file_in_dir(&nested, "QuotaShift-Backup.json", "{\"v\":2}").unwrap();
        assert_eq!(first, second);
        assert_eq!(fs::read_to_string(&second).unwrap(), "{\"v\":2}");
        let entries: Vec<_> = fs::read_dir(&nested)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn creates_distinct_timestamped_files_without_overwriting() {
        let dir = TempDir::new("timestamped");
        let day = write_auto_backup_file_in_dir(&dir.0, "QuotaShift-Backup-2026-11-28.json", "day")
            .unwrap();
        let hour = write_auto_backup_file_in_dir(
            &dir.0,
            "QuotaShift-Backup-2026-11-28_14-30.json",
            "hour",
        )
        .unwrap();
        assert_ne!(day, hour);
        assert_eq!(fs::read_to_string(&day).unwrap(), "day");
        assert_eq!(fs::read_to_string(&hour).unwrap(), "hour");
    }

    #[test]
    fn rejects_invalid_filenames_and_empty_content() {
        let dir = TempDir::new("invalid");
        assert!(write_auto_backup_file_in_dir(&dir.0, "../evil.json", "{}").is_err());
        assert!(write_auto_backup_file_in_dir(&dir.0, "sub/file.json", "{}").is_err());
        assert!(write_auto_backup_file_in_dir(&dir.0, "file.txt", "{}").is_err());
        assert!(write_auto_backup_file_in_dir(&dir.0, "QuotaShift-Backup.json", "   ").is_err());
    }
}
