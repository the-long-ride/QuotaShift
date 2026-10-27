//! Profile-local Windows .cmd launchers. Does not run Claude or touch credentials.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn render_claude_launcher(profile_dir: &Path) -> Result<String, String> {
    let dir = profile_dir
        .to_str()
        .ok_or("Profile path is not valid Unicode")?;
    if !super::installations::is_path_absolute(profile_dir)
        || dir
            .chars()
            .any(|ch| matches!(ch, '%' | '!' | '^' | '"' | '\r' | '\n'))
    {
        return Err(
            "Profile path cannot safely be interpolated into a Windows command script".into(),
        );
    }
    // This wrapper intentionally launches whatever 'claude' resolves to on the user's PATH.
    // A profile is independently useful even before Claude is installed or routed.
    // Clear inherited auth env vars so parent shell variables never conflict with apiKeyHelper.
    Ok(format!(
        "@echo off\r\nsetlocal\r\nset \"CLAUDE_CONFIG_DIR={dir}\"\r\nset \"ANTHROPIC_AUTH_TOKEN=\"\r\nset \"ANTHROPIC_API_KEY=\"\r\ncall claude %*\r\nexit /b %ERRORLEVEL%\r\n"
    ))
}

pub fn install_claude_launcher_at(
    bin_dir: &Path,
    profile_name: &str,
    profile_dir: &Path,
) -> Result<PathBuf, String> {
    if profile_name.is_empty()
        || profile_name.len() > 48
        || !profile_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err("Invalid launcher profile name".into());
    }
    let script = render_claude_launcher(profile_dir)?;
    fs::create_dir_all(bin_dir)
        .map_err(|e| format!("Cannot create user command directory: {e}"))?;
    let dest = bin_dir.join(format!("claude-{profile_name}.cmd"));
    let mut handle = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&dest)
        .map_err(|e| {
            format!(
                "Launcher already exists or cannot be created '{}': {e}",
                dest.display()
            )
        })?;
    if let Err(error) = handle
        .write_all(script.as_bytes())
        .and_then(|_| handle.sync_all())
    {
        let _ = fs::remove_file(&dest);
        return Err(format!("Cannot finish writing profile launcher: {error}"));
    }
    Ok(dest)
}

pub fn managed_launcher_bin() -> Result<PathBuf, String> {
    let root = super::creation::managed_profile_root()?;
    Ok(root
        .parent()
        .ok_or("Invalid managed profile home")?
        .join("bin"))
}

pub fn resolve_profile_launcher(name: &str, config_dir: &Path) -> Option<PathBuf> {
    let bin_dir = managed_launcher_bin().ok()?;
    let name_clean = name.trim();
    if name_clean.is_empty() {
        return None;
    }
    let candidates = [
        bin_dir.join(format!("{name_clean}.cmd")),
        bin_dir.join(format!("claude-{name_clean}.cmd")),
        bin_dir.join(name_clean),
        bin_dir.join(format!("claude-{name_clean}")),
    ];
    for candidate in &candidates {
        if candidate.is_file() {
            return Some(candidate.clone());
        }
    }
    if let Some(stripped) = name_clean.strip_prefix("claude-") {
        let stripped_cmd = bin_dir.join(format!("claude-{stripped}.cmd"));
        if stripped_cmd.is_file() {
            return Some(stripped_cmd);
        }
        let stripped_plain = bin_dir.join(format!("{stripped}.cmd"));
        if stripped_plain.is_file() {
            return Some(stripped_plain);
        }
    }
    if let Ok(root) = super::creation::managed_profile_root() {
        if config_dir.starts_with(&root) {
            #[cfg(windows)]
            {
                let file = if name_clean.starts_with("claude-") {
                    format!("{name_clean}.cmd")
                } else {
                    format!("claude-{name_clean}.cmd")
                };
                return Some(bin_dir.join(file));
            }
            #[cfg(not(windows))]
            {
                let file = if name_clean.starts_with("claude-") {
                    name_clean.to_string()
                } else {
                    format!("claude-{name_clean}")
                };
                return Some(bin_dir.join(file));
            }
        }
    }
    None
}

#[cfg(windows)]
pub fn ensure_launcher_dir_on_user_path(bin_dir: &Path) -> Result<bool, String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_EXPAND_SZ, REG_SZ};
    use winreg::{RegKey, RegValue};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (environment, _) = hkcu
        .create_subkey("Environment")
        .map_err(|e| format!("Cannot access user environment registry: {e}"))?;
    let reg = hkcu
        .open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| format!("Cannot edit user PATH registry: {e}"))?;
    let previous = match reg.get_raw_value("Path") {
        Ok(existing) => existing,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => RegValue {
            vtype: REG_EXPAND_SZ,
            bytes: vec![0, 0],
        },
        Err(error) => return Err(format!("Cannot read user PATH: {error}")),
    };
    if previous.vtype != REG_EXPAND_SZ && previous.vtype != REG_SZ {
        return Err("User PATH has unsupported registry value type".into());
    }
    if previous.bytes.len() % 2 != 0 {
        return Err("User PATH contains malformed UTF-16".into());
    }
    let utf16: Vec<u16> = previous
        .bytes
        .chunks_exact(2)
        .map(|p| u16::from_le_bytes([p[0], p[1]]))
        .collect();
    let path =
        String::from_utf16(&utf16[..utf16.iter().position(|c| *c == 0).unwrap_or(utf16.len())])
            .map_err(|e| format!("User PATH contains invalid UTF-16: {e}"))?;
    let target = bin_dir.to_string_lossy().to_string();
    let present = path.split(';').any(|item| {
        item.trim()
            .trim_matches('"')
            .trim_end_matches(['\\', '/'])
            .eq_ignore_ascii_case(target.trim_end_matches(['\\', '/']))
    });
    if present {
        return Ok(false);
    }
    let updated = if path.is_empty() {
        target
    } else {
        format!("{};{}", path.trim_end_matches(';'), target)
    };
    if updated.len() > 30000 {
        return Err("User PATH too long; cannot append managed Claude command directory".into());
    }
    let mut bytes = Vec::new();
    for wide in updated.encode_utf16().chain(std::iter::once(0)) {
        bytes.extend_from_slice(&wide.to_le_bytes());
    }
    reg.set_raw_value(
        "Path",
        &RegValue {
            vtype: previous.vtype,
            bytes,
        },
    )
    .map_err(|e| format!("Cannot update user PATH: {e}"))?;
    drop(environment);
    Ok(true)
}

#[cfg(not(windows))]
pub fn ensure_launcher_dir_on_user_path(_bin_dir: &Path) -> Result<bool, String> {
    Err("Automatic user PATH registration requires Windows".into())
}
