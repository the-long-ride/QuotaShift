use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct ClaudeLaunchConfig {
    pub executable_path: PathBuf,
    pub config_dir: PathBuf,
    pub gateway_base_url: String,
    pub gateway_token: String,
    pub model_mappings: HashMap<String, String>,
    pub max_context_window_tokens: Option<u64>,
    pub thinking_budget_tokens: Option<u64>,
    pub claude_effort_level: Option<String>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ClaudePoolLimits {
    pub max_context_window_tokens: Option<u64>,
    pub thinking_budget_tokens: Option<u64>,
    pub claude_effort_level: Option<&'static str>,
}

pub fn resolve_claude_pool_limits(
    pool: &crate::codex::router::CodexModelPoolV2,
) -> ClaudePoolLimits {
    let thinking = resolve_claude_thinking_env(
        pool.reasoning_effort.as_deref(),
        pool.thinking_budget_tokens,
    );
    ClaudePoolLimits {
        max_context_window_tokens: pool.max_context_window_tokens.filter(|&v| v > 0),
        thinking_budget_tokens: thinking.map(|(b, _)| b),
        claude_effort_level: thinking.map(|(_, e)| e),
    }
}

pub fn resolve_claude_thinking_env(
    reasoning_effort: Option<&str>,
    thinking_budget_tokens: Option<u64>,
) -> Option<(u64, &'static str)> {
    if reasoning_effort.is_none() && thinking_budget_tokens.is_none() {
        return None;
    }
    let budget = thinking_budget_tokens.unwrap_or_else(|| match reasoning_effort {
        Some("minimal") => 1_024,
        Some("low") => 2_048,
        Some("high") => 16_384,
        Some("xhigh") => 32_768,
        _ => 8_192,
    });
    let raw_effort = reasoning_effort
        .unwrap_or_else(|| crate::codex::router::anthropic::request::effort_for_budget(budget));
    let claude_effort = match raw_effort {
        "minimal" | "low" => "low",
        "high" | "xhigh" => "high",
        _ => "medium",
    };
    Some((budget, claude_effort))
}

/// Claude Code prefers a user-set token or API key in settings over `apiKeyHelper`. Refuse
/// instead of editing it. Only the key name is inspected; the value is never read out.
pub fn check_auth_override_keys(settings_path: &Path) -> Result<(), String> {
    let Ok(content) = std::fs::read_to_string(settings_path) else {
        return Ok(());
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) else {
        return Ok(());
    };
    for key in ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"] {
        if val.get("env").and_then(|e| e.get(key)).is_some() {
            return Err(format!(
                "settings.json sets env.{key}, which would override the QuotaShift gateway credential. Remove env.{key} from that profile's settings.json and try again. QuotaShift does not edit it."
            ));
        }
    }
    Ok(())
}

pub fn check_settings_precedence_conflicts(
    config_dir: &Path,
    target_base_url: &str,
) -> Result<(), String> {
    let settings_path = config_dir.join("settings.json");
    check_auth_override_keys(&settings_path)?;
    if settings_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(env_obj) = val.get("env").and_then(|v| v.as_object()) {
                    if let Some(existing_url) =
                        env_obj.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str())
                    {
                        if existing_url != target_base_url {
                            return Err(format!(
                                "Conflict: settings.json env.ANTHROPIC_BASE_URL is set to '{}', which overrides process environment '{}'",
                                existing_url, target_base_url
                            ));
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn slot_env_keys(slot: &str) -> &'static [&'static str] {
    match slot.to_lowercase().as_str() {
        "default" => &["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_MODEL"],
        "sonnet" => &["ANTHROPIC_DEFAULT_SONNET_MODEL"],
        "opus" => &["ANTHROPIC_DEFAULT_OPUS_MODEL"],
        "haiku" => &["ANTHROPIC_DEFAULT_HAIKU_MODEL"],
        "fable" => &["ANTHROPIC_DEFAULT_FABLE_MODEL"],
        _ => &[],
    }
}

pub fn build_launch_command(config: &ClaudeLaunchConfig) -> Result<Command, String> {
    if !config.executable_path.is_file() {
        return Err(format!(
            "Claude executable not found at '{}'",
            config.executable_path.display()
        ));
    }

    check_settings_precedence_conflicts(&config.config_dir, &config.gateway_base_url)?;

    let mut cmd = Command::new(&config.executable_path);
    cmd.env("CLAUDE_CONFIG_DIR", &config.config_dir);
    cmd.env("ANTHROPIC_BASE_URL", &config.gateway_base_url);
    cmd.env("ANTHROPIC_AUTH_TOKEN", &config.gateway_token);
    cmd.env("CLAUDE_CODE_AUTO_MODE_SERVER", "0");
    cmd.env("CLAUDE_CODE_ATTRIBUTION_HEADER", "0");
    cmd.env("CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS", "1");

    for (slot, model_alias) in &config.model_mappings {
        for env_key in slot_env_keys(slot) {
            cmd.env(env_key, model_alias);
        }
    }
    if let Some(ctx) = config.max_context_window_tokens {
        cmd.env("CLAUDE_CODE_MAX_CONTEXT_TOKENS", ctx.to_string());
    }
    if let Some(budget) = config.thinking_budget_tokens {
        cmd.env("MAX_THINKING_TOKENS", budget.to_string());
    }

    Ok(cmd)
}
