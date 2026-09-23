use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

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

pub fn scan_claude_accounts_at(home: &Path, dirs: Vec<std::path::PathBuf>) -> Vec<ClaudeAccount> {
    let mut accounts = Vec::new();
    let mut seen = HashSet::new();

    for dir in dirs {
        if !seen.insert(normalize_config_dir_key(&dir)) {
            continue;
        }
        let (credentials, source) = match read_credentials_file(&dir) {
            Some(value) => (value, "file"),
            None => match read_keychain_credentials(&dir) {
                Some(value) => (value, "keychain"),
                None => continue,
            },
        };
        let Some(oauth) = credentials.get("claudeAiOauth") else {
            continue;
        };
        let Some(subscription_type) = oauth.get("subscriptionType").and_then(Value::as_str) else {
            continue;
        };

        let identity = read_identity(&dir, home);
        let email = identity
            .as_ref()
            .and_then(|value| value.get("emailAddress"))
            .and_then(Value::as_str)
            .or_else(|| oauth.get("email").and_then(Value::as_str))
            .map(String::from);
        let organization_name = identity
            .as_ref()
            .and_then(|value| value.get("organizationName"))
            .and_then(Value::as_str)
            .map(String::from);
        let expires_at = oauth.get("expiresAt").and_then(Value::as_i64);

        accounts.push(ClaudeAccount {
            id: stable_account_id(&dir),
            config_dir: dir.to_string_lossy().to_string(),
            profile_name: profile_name(&dir, home),
            subscription_type: Some(subscription_type.to_string()),
            rate_limit_tier: oauth
                .get("rateLimitTier")
                .and_then(Value::as_str)
                .map(String::from),
            expires_at,
            expired: expires_at.map(|value| now_ms() > value),
            email,
            organization_name,
            source: source.to_string(),
        });
    }

    accounts.sort_by(|left, right| left.config_dir.cmp(&right.config_dir));
    accounts
}

/// Raw OAuth credentials for one config dir: `.credentials.json` first, then the macOS Keychain.
/// Callers must never serialize or log the returned value.
pub(super) fn read_oauth_credentials(dir: &Path) -> Option<Value> {
    read_credentials_file(dir).or_else(|| read_keychain_credentials(dir))
}
