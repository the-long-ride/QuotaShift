//! The line that resumes a CLI: kept flags, the conversation, and quoting for the target shell.

use super::{CliKind, HostKind, HostProcess};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuoteStyle {
    PowerShell,
    Cmd,
    Posix,
}

pub fn quote_style(shell: Option<&HostProcess>) -> QuoteStyle {
    match shell.map(|s| s.kind) {
        Some(HostKind::Cmd) => QuoteStyle::Cmd,
        Some(HostKind::Posix) => QuoteStyle::Posix,
        Some(HostKind::PowerShell) => QuoteStyle::PowerShell,
        _ if cfg!(target_os = "windows") => QuoteStyle::PowerShell,
        _ => QuoteStyle::Posix,
    }
}

struct FlagRules {
    keep_value: &'static [&'static str],
    drop_value: &'static [&'static str],
    drop_bare: &'static [&'static str],
}

// `-c` means `--config` for Codex but `--continue` for agy, so each CLI has its own list.
const CODEX: FlagRules = FlagRules {
    keep_value: &[
        "-m",
        "--model",
        "-s",
        "--sandbox",
        "-a",
        "--ask-for-approval",
        "-C",
        "--cd",
        "-c",
        "--config",
        "-p",
        "--profile",
        "-i",
        "--image",
        "--add-dir",
        "--local-provider",
        "--enable",
        "--disable",
    ],
    drop_value: &[],
    drop_bare: &["--last"],
};

const AGY: FlagRules = FlagRules {
    keep_value: &[
        "--model",
        "--effort",
        "--mode",
        "--agent",
        "--add-dir",
        "--project",
        "--log-file",
    ],
    drop_value: &["--conversation", "--prompt", "--prompt-interactive", "-i"],
    drop_bare: &["-c", "--continue", "-p", "--print"],
};

/// Original flags minus conversation selection and prompt text. Positional words (subcommands,
/// ids, prompts) are never kept.
pub fn kept_flags(kind: CliKind, args: &[String]) -> Vec<String> {
    let rules = match kind {
        CliKind::Codex => &CODEX,
        CliKind::Agy => &AGY,
    };
    let mut kept = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        i += 1;
        if !arg.starts_with('-') {
            continue;
        }
        let (name, inline) = match arg.split_once('=') {
            Some((name, _)) if arg.starts_with("--") => (name, true),
            _ => (arg.as_str(), false),
        };
        let next_is_value = !inline && args.get(i).is_some_and(|next| !next.starts_with('-'));
        if rules.drop_bare.contains(&name) {
            continue;
        }
        if rules.drop_value.contains(&name) {
            if next_is_value {
                i += 1;
            }
            continue;
        }
        kept.push(arg.clone());
        if rules.keep_value.contains(&name) && next_is_value {
            kept.push(args[i].clone());
            i += 1;
        }
    }
    kept
}

pub fn resume_argv(kind: CliKind, conversation: Option<&str>, flags: &[String]) -> Vec<String> {
    let mut argv: Vec<String> = Vec::new();
    match kind {
        CliKind::Codex => {
            argv.extend(["codex".to_string(), "resume".to_string()]);
            argv.extend(flags.iter().cloned());
            argv.push(conversation.unwrap_or("--last").to_string());
        }
        CliKind::Agy => {
            argv.push("agy".to_string());
            match conversation {
                Some(id) => argv.extend(["--conversation".to_string(), id.to_string()]),
                None => argv.push("--continue".to_string()),
            }
            argv.extend(flags.iter().cloned());
        }
    }
    argv
}

fn is_plain(token: &str) -> bool {
    !token.is_empty()
        && token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_./:=+".contains(c))
}

fn quote(style: QuoteStyle, token: &str) -> String {
    if is_plain(token) {
        return token.to_string();
    }
    match style {
        QuoteStyle::PowerShell => format!("'{}'", token.replace('\'', "''")),
        QuoteStyle::Cmd => format!("\"{}\"", token.replace('"', "\"\"")),
        QuoteStyle::Posix => format!("'{}'", token.replace('\'', "'\\''")),
    }
}

pub fn render_line(style: QuoteStyle, argv: &[String]) -> String {
    argv.iter()
        .map(|token| quote(style, token))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Only the tmux restore path (unix) calls this.
#[cfg(any(unix, test))]
pub fn valid_tmux_pane(pane: &str) -> bool {
    pane.len() > 1 && pane.starts_with('%') && pane[1..].chars().all(|c| c.is_ascii_digit())
}
