use serde_json::Value;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

const RESET_CREDITS_URL: &str =
    "https://api.anthropic.com/api/oauth/usage?cedar_ember=1&skip_spend=1";

static CLI_VERSION: Mutex<Option<String>> = Mutex::new(None);

/// Extracts a live OAuth access token. Expired tokens are never sent or refreshed:
/// Claude CLI / the VS Code extension refresh them on their next use.
pub fn access_token_from_credentials(
    credentials: &Value,
    now_ms: i64,
) -> Result<String, &'static str> {
    let oauth = credentials.get("claudeAiOauth").ok_or("no_oauth")?;
    let expired = oauth
        .get("expiresAt")
        .and_then(Value::as_i64)
        .is_some_and(|expires_at| expires_at <= now_ms);
    if expired {
        return Err("token_expired");
    }
    oauth
        .get("accessToken")
        .and_then(Value::as_str)
        .filter(|token| !token.is_empty())
        .map(String::from)
        .ok_or("no_access_token")
}

/// Picks the first version-looking token from `claude --version` output.
pub fn parse_cli_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .map(|value| value.trim().trim_start_matches('v'))
        .find(|value| {
            value.chars().next().is_some_and(|ch| ch.is_ascii_digit())
                && value
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '+'))
        })
        .map(ToOwned::to_owned)
}

fn run_version(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_cli_version(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn shell_version() -> Option<String> {
    run_version("cmd", &["/C", "claude", "--version"])
}

#[cfg(not(target_os = "windows"))]
fn shell_version() -> Option<String> {
    run_version("sh", &["-lc", "claude --version"])
}

fn local_bin_version() -> Option<String> {
    let binary = if cfg!(target_os = "windows") {
        "claude.exe"
    } else {
        "claude"
    };
    let path = crate::session::get_home_dir()?
        .join(".local")
        .join("bin")
        .join(binary);
    if !path.exists() {
        return None;
    }
    run_version(path.to_str()?, &["--version"])
}

/// Installed `claude --version`, cached after the first success so a later install is still
/// detected. The request is never sent with a made-up version.
pub fn installed_cli_version() -> Option<String> {
    let mut cached = CLI_VERSION
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(version) = cached.as_ref() {
        return Some(version.clone());
    }
    let detected = run_version("claude", &["--version"])
        .or_else(shell_version)
        .or_else(local_bin_version);
    cached.clone_from(&detected);
    detected
}

/// Read-only GET. Errors are reduced to codes so no response content reaches logs or the UI.
pub async fn fetch_usage_with_resets(access: &str, version: &str) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "network_error".to_string())?;
    let response = client
        .get(RESET_CREDITS_URL)
        .bearer_auth(access)
        .header("anthropic-beta", "oauth-2025-04-20")
        .header(
            "User-Agent",
            format!("claude-cli/{version} (external, cli)"),
        )
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| "network_error".to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("http_{}", status.as_u16()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|_| "invalid_json".to_string())
}
