use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use super::discovery::is_managed_profile_dir_at;
use super::types::ClaudeAccount;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn read_credentials_file(dir: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(dir.join(".credentials.json")).ok()?).ok()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn read_keychain_credentials(dir: &Path) -> Option<Value> {
    #[cfg(target_os = "macos")]
    {
        let mut hasher = Sha256::new();
        hasher.update(dir.to_string_lossy().as_bytes());
        let digest = hasher.finalize();
        let service = format!("Claude Code-credentials-{}", &hex_encode(&digest)[..8]);
        let output = Command::new("security")
            .args(["find-generic-password", "-s", service.as_str(), "-w"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        serde_json::from_slice(&output.stdout).ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = dir;
        None
    }
}

fn read_identity(dir: &Path, home: &Path) -> Option<Value> {
    let default_dir = home.join(".claude");
    let mut candidates = vec![dir.join(".claude.json")];
    if dir == default_dir {
        candidates.push(home.join(".claude.json"));
    }
    candidates.into_iter().find_map(|candidate| {
        serde_json::from_str::<Value>(&fs::read_to_string(candidate).ok()?)
            .ok()?
            .get("oauthAccount")
            .cloned()
    })
}

pub fn normalize_config_dir_key(path: &Path) -> String {
    let normalized = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let raw = normalized.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        raw.to_ascii_lowercase()
    } else {
        raw.to_string()
    }
}

fn stable_account_id(config_dir: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize_config_dir_key(config_dir).as_bytes());
    format!("claude-{}", &hex_encode(&hasher.finalize())[..16])
}

fn profile_name(config_dir: &Path, home: &Path) -> String {
    if normalize_config_dir_key(config_dir) == normalize_config_dir_key(&home.join(".claude")) {
        return "Default".to_string();
    }
    config_dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            name.trim_start_matches('.')
                .trim_start_matches("claude-")
                .trim_start_matches("claude")
                .trim_start_matches('-')
                .to_string()
        })
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Claude Code".to_string())
}

fn non_empty_str(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn has_non_empty_setting(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(text)) => !text.trim().is_empty(),
        Some(Value::Null) | None => false,
        Some(_) => true,
    }
}

fn is_gateway_only_profile(dir: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(dir.join("settings.json")) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return false;
    };
    let Some(obj) = value.as_object() else {
        return false;
    };
    if has_non_empty_setting(obj.get("apiKeyHelper")) {
        return true;
    }
    has_non_empty_setting(
        obj.get("env")
            .and_then(Value::as_object)
            .and_then(|env| env.get("ANTHROPIC_BASE_URL")),
    )
}

fn has_oauth_session(oauth: &Value, credentials: &Value, identity: Option<&Value>) -> bool {
    let Some(map) = oauth.as_object() else {
        return false;
    };
    if map.is_empty() {
        return false;
    }
    let has_populated_entry = map.values().any(|value| match value {
        Value::String(text) => !text.trim().is_empty(),
        Value::Number(_) => true,
        Value::Array(items) => !items.is_empty(),
        _ => false,
    });
    has_populated_entry
        || non_empty_str(credentials.get("subscriptionType")).is_some()
        || non_empty_str(identity.and_then(|value| value.get("emailAddress"))).is_some()
}

fn managed_launcher_command(dir: &Path, managed: bool) -> Option<String> {
    if !managed {
        return None;
    }
    dir.file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| format!("claude-{name}"))
}

pub fn scan_claude_accounts_at(home: &Path, dirs: Vec<std::path::PathBuf>) -> Vec<ClaudeAccount> {
    let mut accounts = Vec::new();
    let mut seen = HashSet::new();

    for dir in dirs {
        if !seen.insert(normalize_config_dir_key(&dir)) {
            continue;
        }
        let managed = is_managed_profile_dir_at(&dir, home);
        let launcher_command = managed_launcher_command(&dir, managed);
        let identity = read_identity(&dir, home);
        let email_from_identity = identity
            .as_ref()
            .and_then(|value| value.get("emailAddress"))
            .and_then(Value::as_str)
            .map(String::from);
        let organization_name = identity
            .as_ref()
            .and_then(|value| value.get("organizationName"))
            .and_then(Value::as_str)
            .map(String::from);

        let creds = read_credentials_file(&dir)
            .map(|value| (value, "file"))
            .or_else(|| read_keychain_credentials(&dir).map(|value| (value, "keychain")));

        if let Some((credentials, source)) = creds {
            if let Some(oauth) = credentials
                .get("claudeAiOauth")
                .filter(|value| has_oauth_session(value, &credentials, identity.as_ref()))
            {
                let subscription_type = non_empty_str(oauth.get("subscriptionType"))
                    .or_else(|| non_empty_str(credentials.get("subscriptionType")))
                    .map(String::from);
                let email = email_from_identity
                    .or_else(|| oauth.get("email").and_then(Value::as_str).map(String::from));
                let expires_at = oauth.get("expiresAt").and_then(Value::as_i64);

                accounts.push(ClaudeAccount {
                    id: stable_account_id(&dir),
                    config_dir: dir.to_string_lossy().to_string(),
                    profile_name: profile_name(&dir, home),
                    subscription_type,
                    rate_limit_tier: non_empty_str(oauth.get("userRateLimitTier"))
                        .or_else(|| non_empty_str(oauth.get("rateLimitTier")))
                        .map(String::from),
                    expires_at,
                    expired: expires_at.map(|value| now_ms() > value),
                    email,
                    organization_name,
                    source: source.to_string(),
                    authenticated: true,
                    launcher_command,
                });
                continue;
            }
        }

        if managed && !is_gateway_only_profile(&dir) {
            accounts.push(ClaudeAccount {
                id: stable_account_id(&dir),
                config_dir: dir.to_string_lossy().to_string(),
                profile_name: profile_name(&dir, home),
                subscription_type: None,
                rate_limit_tier: None,
                expires_at: None,
                expired: None,
                email: email_from_identity,
                organization_name,
                source: "managed".to_string(),
                authenticated: false,
                launcher_command,
            });
        }
    }

    accounts.sort_by(|left, right| left.config_dir.cmp(&right.config_dir));
    accounts
}

/// Raw OAuth credentials for one config dir: `.credentials.json` first, then the macOS Keychain.
/// Callers must never serialize or log the returned value.
pub(super) fn read_oauth_credentials(dir: &Path) -> Option<Value> {
    read_credentials_file(dir).or_else(|| read_keychain_credentials(dir))
}
