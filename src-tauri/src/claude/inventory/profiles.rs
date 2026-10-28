use std::path::{Path, PathBuf};

use super::installations::canonical_windows_path;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeProfile {
    pub id: String,
    pub name: String,
    pub config_dir: PathBuf,
    pub settings_path: PathBuf,
    pub launcher_path: Option<PathBuf>,
    pub has_subscription_credentials: bool,
    pub is_gateway_only: bool,
}

pub fn inspect_profile_dir(config_dir: &Path) -> Result<ClaudeProfile, String> {
    let canonical = canonical_windows_path(config_dir)?;
    let settings_path = canonical.join("settings.json");

    // Profile name derived from directory name
    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "default".to_string());

    let launcher_path = super::launcher::resolve_profile_launcher(&name, &canonical);

    // Deterministic ID derived from canonical path string
    let mut hasher = sha2::Sha256::default();
    sha2::Digest::update(&mut hasher, canonical.to_string_lossy().as_bytes());
    let hash_bytes = sha2::Digest::finalize(hasher);
    let id = format!(
        "prof_{}",
        &base64::Engine::encode(&base64::prelude::BASE64_URL_SAFE_NO_PAD, &hash_bytes[0..8])
    );

    // Check if subscription credentials exist in settings.json
    let mut has_subscription = false;
    if settings_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(obj) = val.as_object() {
                    has_subscription = obj.contains_key("claudeAiOauth")
                        || obj.contains_key("oauthAccount")
                        || obj.contains_key("primaryApiKey");
                }
            }
        }
    }

    Ok(ClaudeProfile {
        id,
        name,
        config_dir: canonical,
        settings_path,
        launcher_path,
        has_subscription_credentials: has_subscription,
        is_gateway_only: !has_subscription,
    })
}

pub fn discover_claude_profiles(candidate_dirs: &[PathBuf]) -> Vec<ClaudeProfile> {
    let mut profiles = Vec::new();
    for dir in candidate_dirs {
        if let Ok(prof) = inspect_profile_dir(dir) {
            profiles.push(prof);
        }
    }
    profiles
}

pub fn update_profile_settings_routing_key(
    root_val: &mut serde_json::Value,
    new_key: &str,
    has_binding: bool,
) {
    if !root_val.is_object() {
        *root_val = serde_json::json!({});
    }
    let Some(obj) = root_val.as_object_mut() else {
        return;
    };
    let uses_helper = obj.contains_key("apiKeyHelper") || has_binding;
    if uses_helper {
        if let Some(env_obj) = obj
            .get_mut("env")
            .and_then(serde_json::Value::as_object_mut)
        {
            env_obj.remove("ANTHROPIC_AUTH_TOKEN");
            env_obj.remove("ANTHROPIC_API_KEY");
        }
    } else {
        let env_val = obj.entry("env").or_insert_with(|| serde_json::json!({}));
        if !env_val.is_object() {
            *env_val = serde_json::json!({});
        }
        if let Some(env_obj) = env_val.as_object_mut() {
            if env_obj.contains_key("ANTHROPIC_API_KEY") {
                env_obj.insert(
                    "ANTHROPIC_API_KEY".to_string(),
                    serde_json::Value::String(new_key.to_string()),
                );
            } else {
                env_obj.insert(
                    "ANTHROPIC_AUTH_TOKEN".to_string(),
                    serde_json::Value::String(new_key.to_string()),
                );
            }
        }
    }
    for key in ["primaryApiKey", "authToken", "apiKey"] {
        if obj.contains_key(key) {
            obj.insert(
                key.to_string(),
                serde_json::Value::String(new_key.to_string()),
            );
        }
    }
}
