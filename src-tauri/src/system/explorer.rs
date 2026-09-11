use std::path::PathBuf;

pub fn show_path_in_file_manager(target: &str) -> Result<(), String> {
    let path = PathBuf::from(target);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", target));
    }

    #[cfg(target_os = "windows")]
    {
        if path.is_file() {
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,{}", path.display()))
                .spawn();
        } else {
            let _ = std::process::Command::new("explorer")
                .arg(path.to_string_lossy().to_string())
                .spawn();
        }
    }

    #[cfg(target_os = "macos")]
    {
        if path.is_file() {
            let _ = std::process::Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn();
        } else {
            let _ = std::process::Command::new("open")
                .arg(path.to_string_lossy().to_string())
                .spawn();
        }
    }

    #[cfg(target_os = "linux")]
    {
        let folder = if path.is_file() {
            path.parent().unwrap_or(&path).to_path_buf()
        } else {
            path
        };
        let _ = std::process::Command::new("xdg-open")
            .arg(folder.to_string_lossy().to_string())
            .spawn();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nonexistent_path_returns_err() {
        let res = show_path_in_file_manager("non_existent_path_12345");
        assert!(res.is_err());
    }
}
