//! Process termination for Codex CLI, ChatGPT desktop app, and Codex IDE extension.

use serde::{Deserialize, Serialize};
use sysinfo::{ProcessesToUpdate, System};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexProcessKillResult {
    pub cli_killed: bool,
    pub desktop_killed: bool,
    pub ide_extension_killed: bool,
    pub total_killed: usize,
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

pub async fn kill_codex_processes() -> Result<CodexProcessKillResult, String> {
    let mut result = CodexProcessKillResult::default();
    let current_pid = std::process::id();

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

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All);

    for (&pid, process) in sys.processes() {
        let pid_u32 = pid.as_u32();
        let name = process.name().to_string_lossy();
        let cmd = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ");

        if is_target_codex_process(pid_u32, current_pid, &name, &cmd) {
            if is_codex_cli_process(&name, &cmd) {
                result.cli_killed = true;
            }
            if is_chatgpt_desktop_process(&name, &cmd) {
                result.desktop_killed = true;
            }
            if is_codex_ide_extension_process(&name, &cmd) {
                result.ide_extension_killed = true;
            }
            process.kill();
            result.total_killed += 1;
        }
    }

    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    Ok(result)
}

#[cfg(test)]
mod tests;
