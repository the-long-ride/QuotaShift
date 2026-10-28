use serde::{Deserialize, Serialize};
use std::path::Path;

use super::process_inventory::provider_to_cli_kind;
use super::types::CliProvider;
use crate::system::cli_restore::command::kept_flags;
use crate::system::cli_restore::conversation::valid_id;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResumeMode {
    ExactId,
    LatestSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSpec {
    pub provider: CliProvider,
    pub executable: String,
    pub cwd: String,
    pub argv: Vec<String>,
    pub mode: ResumeMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CommandBuildError {
    EmptyPrompt,
    PromptTooLong,
    InvalidCharactersInPrompt,
    InvalidConversationId(String),
    MissingOrInvalidCwd(String),
}

const FORBIDDEN_FLAGS: &[&str] = &[
    "--dangerously-skip-permissions",
    "--dangerously-bypass-approvals-and-sandbox",
    "--yolo",
    "--resume",
    "resume",
    "--last",
    "--continue",
    "--conversation",
    "--prompt-interactive",
    "--prompt",
    "--print",
];

fn sanitize_flags(provider: CliProvider, original_flags: &[String]) -> Vec<String> {
    let kind = provider_to_cli_kind(provider);
    let base_kept = kept_flags(kind, original_flags);

    let mut safe = Vec::new();
    let mut flags = base_kept.into_iter().peekable();
    while let Some(flag) = flags.next() {
        let (name, inline_value) = flag.split_once('=').unwrap_or((&flag, ""));
        if FORBIDDEN_FLAGS.contains(&name) {
            continue;
        }
        // Keep ordinary config/profile/image arguments intact. Drop security overrides
        // as whole flag/value pairs so a removed flag cannot leave a positional argument.
        if provider == CliProvider::Codex && matches!(name, "-s" | "--sandbox" | "-c" | "--config")
        {
            let separate_value = inline_value.is_empty().then(|| flags.next()).flatten();
            let value = separate_value.as_deref().unwrap_or(inline_value);
            let config_key = value.split('=').next().unwrap_or(value).trim();
            if value == "danger-full-access"
                || matches!(
                    config_key,
                    "approval_policy" | "sandbox_mode" | "permissions"
                )
            {
                continue;
            }
            safe.push(flag);
            safe.extend(separate_value);
        } else {
            safe.push(flag);
        }
    }
    safe
}

pub fn validate_prompt(prompt: &str) -> Result<String, CommandBuildError> {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Err(CommandBuildError::EmptyPrompt);
    }
    if prompt.chars().count() > 2000 {
        return Err(CommandBuildError::PromptTooLong);
    }
    if prompt.contains('\0') {
        return Err(CommandBuildError::InvalidCharactersInPrompt);
    }
    Ok(prompt.to_string())
}

pub fn build_resume_command(
    provider: CliProvider,
    executable: &str,
    cwd: &str,
    conversation: Option<&str>,
    prompt: &str,
    original_flags: &[String],
    check_cwd_exists: bool,
) -> Result<CommandSpec, CommandBuildError> {
    let validated_prompt = validate_prompt(prompt)?;

    if check_cwd_exists && !Path::new(cwd).is_dir() {
        return Err(CommandBuildError::MissingOrInvalidCwd(cwd.to_string()));
    }

    let sanitized_original_flags = sanitize_flags(provider, original_flags);

    if let Some(id) = conversation {
        if !valid_id(id) {
            return Err(CommandBuildError::InvalidConversationId(id.to_string()));
        }
    }
    let mode = if conversation.is_some() {
        ResumeMode::ExactId
    } else {
        ResumeMode::LatestSession
    };
    let mut argv = match provider {
        CliProvider::Agy => vec![
            conversation
                .map(|id| format!("--conversation={id}"))
                .unwrap_or_else(|| "-c".into()),
            format!("-i={validated_prompt}"),
        ],
        CliProvider::Codex => vec!["resume".into(), conversation.unwrap_or("--last").into()],
    };
    argv.extend(sanitized_original_flags);
    if provider == CliProvider::Codex {
        argv.extend(["--".into(), validated_prompt]);
    }

    Ok(CommandSpec {
        provider,
        executable: executable.to_string(),
        cwd: cwd.to_string(),
        argv,
        mode,
    })
}

#[cfg(test)]
mod tests;
