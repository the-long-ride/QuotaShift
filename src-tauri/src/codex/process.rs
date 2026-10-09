//! Process termination for Codex CLI, ChatGPT desktop app, and Codex IDE extension.

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessesToUpdate, System};

mod packaged;

/// One process from a snapshot: (pid, name, cmdline, executable path).
type ProcessRow = (u32, String, String, Option<String>);

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexProcessKillResult {
    pub cli_killed: bool,
    pub desktop_killed: bool,
    pub ide_extension_killed: bool,
    pub total_killed: usize,
    pub desktop_executable: Option<String>,
}

pub fn is_codex_cli_process(name: &str, cmdline: &str) -> bool {
    let lower_name = name.to_ascii_lowercase();
    let lower_cmd = cmdline.to_ascii_lowercase();
    let norm_cmd = lower_cmd.replace('\\', "/");

    let base = std::path::Path::new(&lower_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&lower_name)
        .trim_end_matches(".exe");

    if base == "codex" {
        return true;
    }

    if norm_cmd.contains("@openai/codex") || norm_cmd.contains("openai-codex") {
        return true;
    }

    // Scan every slash-separated segment of the fully-normalised cmdline so that
    // paths with spaces (e.g. "C:\Program Files\Codex\codex.exe") are handled
    // correctly even when split_whitespace would fracture the quoted path.
    if norm_cmd.split('/').any(|seg| {
        let clean = seg.trim_matches(|c: char| c == '"' || c == '\'' || c == ',' || c == ';');
        clean.trim_end_matches(".exe") == "codex"
    }) {
        return true;
    }

    // Fallback: token-split for unquoted single-word invocations.
    lower_cmd.split_whitespace().any(|token| {
        let clean = token.trim_matches(|c: char| c == '"' || c == '\'' || c == ',' || c == ';');
        let tok_base = std::path::Path::new(clean)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(clean)
            .trim_end_matches(".exe");
        tok_base == "codex"
    })
}

pub fn is_chatgpt_desktop_process(name: &str, cmdline: &str) -> bool {
    let lower_name = name.to_ascii_lowercase();
    let lower_cmd = cmdline.to_ascii_lowercase();

    let base = std::path::Path::new(&lower_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&lower_name)
        .trim_end_matches(".exe");

    if base == "chatgpt" {
        return true;
    }

    lower_cmd.contains("chatgpt.app")
        || lower_cmd.contains("chatgpt.exe")
        || lower_cmd.contains("openai.codex")
}

pub fn is_codex_ide_extension_process(name: &str, cmdline: &str) -> bool {
    let lower_name = name.to_ascii_lowercase();
    let lower_cmd = cmdline.to_ascii_lowercase();

    let base = std::path::Path::new(&lower_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&lower_name)
        .trim_end_matches(".exe");

    if matches!(
        base,
        "codex-language-server"
            | "codex-agent"
            | "codex-ls"
            | "chatgpt-codex"
            | "codex_language_server"
            | "codex-lsp"
    ) {
        return true;
    }

    let norm_cmd = lower_cmd.replace('\\', "/");

    lower_cmd.contains("codex-language-server")
        || lower_cmd.contains("codex-agent")
        || lower_cmd.contains("codex-ls")
        || lower_cmd.contains("chatgpt-codex")
        || lower_cmd.contains("codex_language_server")
        || lower_cmd.contains("codex-lsp")
        || lower_cmd.contains("openai.chatgpt")
        || lower_cmd.contains("openai.codex")
        || norm_cmd.contains("extensions/codex")
}

pub fn is_target_codex_process(pid: u32, current_pid: u32, name: &str, cmdline: &str) -> bool {
    if pid == current_pid || pid == 0 {
        return false;
    }
    let lower_name = name.to_ascii_lowercase();
    let lower_cmd = cmdline.to_ascii_lowercase();

    if lower_name.contains("quotashift") || lower_cmd.contains("quotashift") {
        return false;
    }

    is_codex_cli_process(&lower_name, &lower_cmd)
        || is_chatgpt_desktop_process(&lower_name, &lower_cmd)
        || is_codex_ide_extension_process(&lower_name, &lower_cmd)
}

/// Picks the executable path of the first running ChatGPT/Codex desktop app.
/// Rows are (name, cmdline, exe path).
pub fn pick_desktop_executable(rows: &[(String, String, Option<String>)]) -> Option<String> {
    rows.iter()
        .filter(|(name, cmd, _)| {
            is_chatgpt_desktop_process(name, cmd) && !is_codex_ide_extension_process(name, cmd)
        })
        .find_map(|(_, _, exe)| exe.clone().filter(|path| !path.trim().is_empty()))
}

fn snapshot(sys: &System) -> Vec<ProcessRow> {
    sys.processes()
        .iter()
        .map(|(pid, process)| {
            let cmd = process
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy())
                .collect::<Vec<_>>()
                .join(" ");
            let exe = process.exe().map(|p| p.to_string_lossy().to_string());
            (
                pid.as_u32(),
                process.name().to_string_lossy().to_string(),
                cmd,
                exe,
            )
        })
        .collect()
}

/// Decides what a restart would stop, from a snapshot taken before anything is killed.
/// Nothing running means no pids and an all-false result, so nothing is stopped or reopened.
pub fn plan_kill(rows: &[ProcessRow], current_pid: u32) -> (CodexProcessKillResult, Vec<u32>) {
    let mut result = CodexProcessKillResult::default();
    let mut pids = Vec::new();
    let mut targets = Vec::new();
    for (pid, name, cmd, exe) in rows {
        // The user's shell may mention codex (`pwsh -NoExit -Command codex resume ...`); keep it.
        if crate::system::cli_restore::snapshot::is_user_shell(name, cmd) {
            continue;
        }
        if !is_target_codex_process(*pid, current_pid, name, cmd) {
            continue;
        }
        result.cli_killed |= is_codex_cli_process(name, cmd);
        result.desktop_killed |= is_chatgpt_desktop_process(name, cmd);
        result.ide_extension_killed |= is_codex_ide_extension_process(name, cmd);
        pids.push(*pid);
        targets.push((name.clone(), cmd.clone(), exe.clone()));
    }
    result.total_killed = pids.len();
    result.desktop_executable = pick_desktop_executable(&targets);
    (result, pids)
}

/// Relaunches the desktop app recorded before the kill. Returns false when nothing was spawned.
pub fn relaunch_codex_desktop(path: &str) -> Result<bool, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }
    #[cfg(target_os = "windows")]
    if let Some(id) = packaged::packaged_app_user_model_id(trimmed, |root| {
        std::fs::read_to_string(format!("{root}\\AppxManifest.xml")).ok()
    }) {
        return packaged::activate(&id);
    }
    #[cfg(target_os = "macos")]
    if let Some(index) = trimmed.find(".app/") {
        let bundle = &trimmed[..index + 4];
        std::process::Command::new("open")
            .arg(bundle)
            .spawn()
            .map_err(|e| format!("Failed to reopen the desktop app: {e}"))?;
        return Ok(true);
    }
    if !std::path::Path::new(trimmed).exists() {
        return Ok(false);
    }
    crate::run_cmd(std::process::Command::new(trimmed))
        .spawn()
        .map_err(|e| format!("Failed to reopen the desktop app: {e}"))?;
    Ok(true)
}

pub async fn kill_codex_processes() -> Result<CodexProcessKillResult, String> {
    use crate::system::cli_restore::{capture, stash, CliKind};
    // Read where each CLI runs before anything is stopped, so it can be resumed there.
    stash(capture(CliKind::Codex));
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All);
    let (result, pids) = plan_kill(&snapshot(&sys), std::process::id());
    if pids.is_empty() {
        return Ok(result);
    }

    #[cfg(target_os = "windows")]
    {
        for img in [
            "codex.exe",
            "ChatGPT.exe",
            "chatgpt.exe",
            "codex-language-server.exe",
            "codex-agent.exe",
            "codex-ls.exe",
            "chatgpt-codex.exe",
        ] {
            let _ = crate::run_cmd(std::process::Command::new("taskkill"))
                .args(["/F", "/T", "/IM", img])
                .output();
        }
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("osascript")
            .args(["-e", "tell application \"ChatGPT\" to quit"])
            .output();
    }

    for pid in pids {
        if let Some(process) = sys.process(Pid::from_u32(pid)) {
            process.kill();
        }
    }

    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    Ok(result)
}

#[cfg(test)]
mod plan_tests;
#[cfg(test)]
mod tests;
