use rand::RngCore;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

pub fn run_env_setup(port: u16) -> Result<(), String> {
    if port < 1024 {
        return Err("Agent API port must be between 1024 and 65535".into());
    }
    let key = super::key::load_key()?
        .ok_or("Generate or save an API key before running terminal setup")?;
    let url = format!("http://localhost:{port}");
    spawn_terminal_setup(&url, &key)
}

fn setup_temp_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("quotashift-agent-setup");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot prepare setup folder: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
    }
    Ok(dir)
}

fn write_temp_script(ext: &str, content: &str) -> Result<PathBuf, String> {
    let dir = setup_temp_dir()?;
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let path = dir.join(format!("setup-{token}.{ext}"));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o700);
    }
    let mut file = options
        .open(&path)
        .map_err(|e| format!("Cannot write setup script: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Cannot populate setup script: {e}"))?;
    Ok(path)
}

#[cfg(any(windows, test))]
pub fn build_windows_run_script() -> String {
    [
        "$ErrorActionPreference = 'Stop'",
        "try {",
        "  $url = $env:QUOTASHIFT_SETUP_URL",
        "  $key = $env:QUOTASHIFT_SETUP_KEY",
        "  if ([string]::IsNullOrWhiteSpace($url) -or [string]::IsNullOrWhiteSpace($key)) {",
        "    throw 'Missing Agent API setup environment values.'",
        "  }",
        "  Write-Host '=== QuotaShift Agent API Setup (User Scope) ===' -ForegroundColor Cyan",
        "  Write-Host 'Executing commands:' -ForegroundColor Gray",
        "  Write-Host \"  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_URL', '$url', 'User')\" -ForegroundColor DarkGray",
        "  Write-Host \"  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_KEY', '<OS keyring secret>', 'User')\" -ForegroundColor DarkGray",
        "  Write-Host ''",
        "  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_URL', $url, 'User')",
        "  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_KEY', $key, 'User')",
        "  Write-Host 'QuotaShift Agent API environment variables saved for your Windows user.' -ForegroundColor Green",
        "  Write-Host 'Restart your AI agent or open a new terminal to inherit them.'",
        "} catch {",
        "  Write-Host \"Error saving Agent API variables: $_\" -ForegroundColor Red",
        "} finally {",
        "  Remove-Item Env:QUOTASHIFT_SETUP_URL, Env:QUOTASHIFT_SETUP_KEY -ErrorAction SilentlyContinue",
        "  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue",
        "}",
        "Write-Host ''",
        "Write-Host 'You can close this window now.' -ForegroundColor Cyan",
        "Read-Host 'Press Enter to close' | Out-Null",
    ]
    .join("\r\n")
}

#[cfg(target_os = "windows")]
fn spawn_terminal_setup(url: &str, key: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    let script = build_windows_run_script();
    let script_path = write_temp_script("ps1", &script)?;
    Command::new("powershell.exe")
        .creation_flags(CREATE_NEW_CONSOLE)
        .env("QUOTASHIFT_SETUP_URL", url)
        .env("QUOTASHIFT_SETUP_KEY", key)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .spawn()
        .map_err(|e| {
            let _ = fs::remove_file(&script_path);
            format!("Cannot open PowerShell: {e}")
        })?;
    Ok(())
}

#[cfg(any(unix, test))]
fn posix_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(any(unix, test))]
pub fn build_posix_run_script(url: &str, key: &str, is_macos: bool) -> String {
    let q_url = posix_single_quote(url);
    let q_key = posix_single_quote(key);
    let mut lines = vec![
        "#!/bin/sh".to_string(),
        "set -e".to_string(),
        "rm -f \"$0\" >/dev/null 2>&1 || true".to_string(),
        format!("QS_URL={q_url}"),
        format!("QS_KEY={q_key}"),
        "printf '=== QuotaShift Agent API Setup (User Scope) ===\\n'".to_string(),
        "printf 'Executing commands:\\n'".to_string(),
        "printf \"  export QUOTASHIFT_AGENT_API_URL='%s'\\n\" \"$QS_URL\"".to_string(),
        "printf \"  export QUOTASHIFT_AGENT_API_KEY='<OS keyring secret>'\\n\\n\"".to_string(),
        "START_MARK='# >>> quotashift-agent-api >>>'".to_string(),
        "END_MARK='# <<< quotashift-agent-api <<<'".to_string(),
        "esc_sq() { printf '%s' \"$1\" | sed \"s/'/'\\\\''/g\"; }".to_string(),
        "update_rc() {".to_string(),
        "  rc=\"$1\"".to_string(),
        "  [ -n \"$rc\" ] || return 0".to_string(),
        "  tmp=\"${rc}.quotashift.tmp.$$\"".to_string(),
        "  if [ -f \"$rc\" ]; then".to_string(),
        "    awk -v s=\"$START_MARK\" -v e=\"$END_MARK\" '".to_string(),
        "      $0 == s { skip = 1; next }".to_string(),
        "      $0 == e { skip = 0; next }".to_string(),
        "      !skip { print }".to_string(),
        "    ' \"$rc\" > \"$tmp\"".to_string(),
        "  else".to_string(),
        "    : > \"$tmp\"".to_string(),
        "  fi".to_string(),
        "  {".to_string(),
        "    cat \"$tmp\"".to_string(),
        "    printf '%s\\n' \"$START_MARK\"".to_string(),
        "    printf \"export QUOTASHIFT_AGENT_API_URL='%s'\\n\" \"$(esc_sq \"$QS_URL\")\""
            .to_string(),
        "    printf \"export QUOTASHIFT_AGENT_API_KEY='%s'\\n\" \"$(esc_sq \"$QS_KEY\")\""
            .to_string(),
        "    printf '%s\\n' \"$END_MARK\"".to_string(),
        "  } > \"${tmp}.out\" && chmod 600 \"${tmp}.out\" && mv \"${tmp}.out\" \"$rc\"".to_string(),
        "  rm -f \"$tmp\"".to_string(),
        "}".to_string(),
    ];
    if is_macos {
        lines.push("printf '  update_rc %s/.zshrc\\n' \"$HOME\"".to_string());
        lines.push("update_rc \"$HOME/.zshrc\"".to_string());
        lines.push("printf '  update_rc %s/.zprofile\\n' \"$HOME\"".to_string());
        lines.push("update_rc \"$HOME/.zprofile\"".to_string());
        lines.push(
            "printf '  launchctl setenv QUOTASHIFT_AGENT_API_URL & QUOTASHIFT_AGENT_API_KEY\\n'"
                .to_string(),
        );
        lines.push(
            "launchctl setenv QUOTASHIFT_AGENT_API_URL \"$QS_URL\" >/dev/null 2>&1 || true"
                .to_string(),
        );
        lines.push(
            "launchctl setenv QUOTASHIFT_AGENT_API_KEY \"$QS_KEY\" >/dev/null 2>&1 || true"
                .to_string(),
        );
    } else {
        lines.push("printf '  update_rc %s/.bashrc\\n' \"$HOME\"".to_string());
        lines.push("update_rc \"$HOME/.bashrc\"".to_string());
        lines.push(
            "[ -f \"$HOME/.zshrc\" ] && printf '  update_rc %s/.zshrc\\n' \"$HOME\" && update_rc \"$HOME/.zshrc\""
                .to_string(),
        );
        lines.push("printf '  update_rc %s/.profile\\n' \"$HOME\"".to_string());
        lines.push("update_rc \"$HOME/.profile\"".to_string());
    }
    lines.push("unset QS_URL QS_KEY".to_string());
    lines.push(
        "printf '\\nQuotaShift Agent API environment variables saved for your user profile.\\n'"
            .to_string(),
    );
    lines.push(
        "printf 'Restart your AI agent or open a new terminal to inherit them.\\n\\n'".to_string(),
    );
    lines.push("printf 'You can close this window now. Press Enter to exit... '".to_string());
    lines.push("read -r _unused || true".to_string());
    lines.join("\n")
}

#[cfg(target_os = "macos")]
fn spawn_terminal_setup(url: &str, key: &str) -> Result<(), String> {
    let script = build_posix_run_script(url, key, true);
    let script_path = write_temp_script("sh", &script)?;
    let command = format!("sh {}", posix_single_quote(&script_path.to_string_lossy()));
    let escaped = command.replace('\\', "\\\\").replace('"', "\\\"");
    let osa = format!("tell application \"Terminal\"\nactivate\ndo script \"{escaped}\"\nend tell");
    Command::new("osascript")
        .args(["-e", &osa])
        .spawn()
        .map_err(|e| {
            let _ = fs::remove_file(&script_path);
            format!("Cannot open Terminal: {e}")
        })?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn spawn_terminal_setup(url: &str, key: &str) -> Result<(), String> {
    let script = build_posix_run_script(url, key, false);
    let script_path = write_temp_script("sh", &script)?;
    let path_str = script_path.to_string_lossy().to_string();
    let candidates: [(&str, Vec<&str>); 7] = [
        ("x-terminal-emulator", vec!["-e", "sh", &path_str]),
        ("gnome-terminal", vec!["--", "sh", &path_str]),
        ("konsole", vec!["-e", "sh", &path_str]),
        ("xfce4-terminal", vec!["-e", "sh", &path_str]),
        ("alacritty", vec!["-e", "sh", &path_str]),
        ("kitty", vec!["sh", &path_str]),
        ("xterm", vec!["-e", "sh", &path_str]),
    ];
    for (bin, args) in candidates {
        if Command::new(bin).args(&args).spawn().is_ok() {
            return Ok(());
        }
    }
    let _ = fs::remove_file(&script_path);
    Err("No supported terminal emulator found (tried x-terminal-emulator, gnome-terminal, konsole, xfce4-terminal, alacritty, kitty, xterm)".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_script_displays_commands_and_pauses_at_end() {
        let win = build_windows_run_script();
        assert!(win.contains("Executing commands:"));
        assert!(win.contains(
            "[Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_URL', '$url', 'User')"
        ));
        assert!(win.contains("<OS keyring secret>"));
        assert!(win.contains("You can close this window now."));
    }

    #[test]
    fn posix_script_targets_user_profiles_and_pauses_at_end() {
        let mac = build_posix_run_script("http://localhost:45692", "secret'key-123456", true);
        assert!(mac.contains("Executing commands:"));
        assert!(mac.contains("update_rc \"$HOME/.zshrc\""));
        assert!(mac.contains("launchctl setenv QUOTASHIFT_AGENT_API_KEY"));
        assert!(mac.contains("You can close this window now"));
        assert!(mac.contains("'secret'\"'\"'key-123456'"));

        let linux = build_posix_run_script("http://localhost:45692", "secret-key-123456", false);
        assert!(linux.contains("update_rc \"$HOME/.bashrc\""));
        assert!(linux.contains("update_rc \"$HOME/.profile\""));
        assert!(!linux.contains("launchctl setenv"));
        assert!(linux.contains("You can close this window now"));
    }
}
