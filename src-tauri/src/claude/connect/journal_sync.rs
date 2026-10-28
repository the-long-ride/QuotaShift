use super::journal::{load_journal, save_journal, PatchJournalEntry};
use super::settings_keys::{get_setting, remove_setting, set_setting};
use std::path::{Path, PathBuf};

const MANAGED_MODEL_ENV_KEYS: &[&str] = &[
    "env.ANTHROPIC_MODEL",
    "env.ANTHROPIC_DEFAULT_MODEL",
    "env.ANTHROPIC_DEFAULT_SONNET_MODEL",
    "env.ANTHROPIC_DEFAULT_OPUS_MODEL",
    "env.ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "env.ANTHROPIC_DEFAULT_FABLE_MODEL",
];

/// Updates `CLAUDE_CODE_MAX_CONTEXT_TOKENS`, `MAX_THINKING_TOKENS`, and `effortLevel`
/// in active persistent profile journals and `settings.json` when model pools are updated.
pub async fn sync_journals_with_registry(
    journal_dir: &Path,
    manager: &crate::codex::router::CodexRouterManager,
) {
    let Ok(entries) = std::fs::read_dir(journal_dir) else {
        return;
    };
    let snapshot = manager.registry.read().await.clone();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(mut journal) = load_journal(&path) else {
            continue;
        };
        let Some(default_alias) = journal
            .patched_values
            .get("env.ANTHROPIC_MODEL")
            .and_then(|v| v.as_str())
            .map(|s| s.to_ascii_lowercase())
        else {
            continue;
        };
        let Some(pool) = snapshot.routes.get(&default_alias) else {
            continue;
        };
        let limits = super::launcher::resolve_claude_pool_limits(pool);
        let Ok(content) = std::fs::read_to_string(&journal.profile_path) else {
            continue;
        };
        let Ok(mut root) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        if !root.is_object() {
            continue;
        }
        let has_conflict = journal
            .patched_keys
            .iter()
            .filter(|k| k.as_str() != "effortLevel" && k.as_str() != "env.CLAUDE_CODE_EFFORT_LEVEL")
            .any(|k| {
                journal
                    .patched_values
                    .get(k)
                    .is_some_and(|expected| get_setting(&root, k) != Some(expected))
            });
        if has_conflict {
            continue;
        }
        let _ = remove_setting(&mut root, "env.CLAUDE_CODE_EFFORT_LEVEL");
        if root.get("apiKeyHelper").is_some() {
            let _ = remove_setting(&mut root, "env.ANTHROPIC_AUTH_TOKEN");
            let _ = remove_setting(&mut root, "env.ANTHROPIC_API_KEY");
        }
        journal
            .patched_keys
            .retain(|k| k != "env.CLAUDE_CODE_EFFORT_LEVEL");
        journal
            .patched_values
            .remove("env.CLAUDE_CODE_EFFORT_LEVEL");
        journal.original_keys.remove("env.CLAUDE_CODE_EFFORT_LEVEL");

        let mut updates = vec![
            (
                "env.CLAUDE_CODE_AUTO_MODE_SERVER",
                serde_json::Value::String("0".into()),
            ),
            (
                "env.CLAUDE_CODE_ATTRIBUTION_HEADER",
                serde_json::Value::String("0".into()),
            ),
            (
                "env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS",
                serde_json::Value::String("1".into()),
            ),
        ];
        if let Some(ctx) = limits.max_context_window_tokens {
            updates.push((
                "env.CLAUDE_CODE_MAX_CONTEXT_TOKENS",
                serde_json::Value::String(ctx.to_string()),
            ));
        }
        if let Some(budget) = limits.thinking_budget_tokens {
            updates.push((
                "env.MAX_THINKING_TOKENS",
                serde_json::Value::String(budget.to_string()),
            ));
        }
        if let Some(effort) = limits.claude_effort_level {
            updates.push(("effortLevel", serde_json::Value::String(effort.to_string())));
        }
        if updates.is_empty() {
            continue;
        }
        for (key, val) in updates {
            if !journal.original_keys.contains_key(key) {
                journal
                    .original_keys
                    .insert(key.to_string(), get_setting(&root, key).cloned());
            }
            if !journal.patched_keys.iter().any(|k| k == key) {
                journal.patched_keys.push(key.to_string());
            }
            let _ = set_setting(&mut root, key, val.clone());
            journal.patched_values.insert(key.to_string(), val);
        }
        if let Ok(updated) = serde_json::to_string_pretty(&root) {
            if std::fs::write(&journal.profile_path, updated).is_ok() {
                let _ = save_journal(&journal, &path);
            }
        }
    }
}

pub async fn restore_profile_settings_to_default(
    journal_dir: &Path,
    manager: &crate::codex::router::CodexRouterManager,
    profile_id: &str,
    config_dir: &Path,
    self_exe: &Path,
) -> Result<String, String> {
    let settings_path = config_dir.join("settings.json");
    let mut root = std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));

    let mut matched_journal: Option<(PathBuf, PatchJournalEntry)> = None;
    if let Ok(entries) = std::fs::read_dir(journal_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(j) = load_journal(&p) {
                if j.profile_id == profile_id || j.profile_path == settings_path {
                    matched_journal = Some((p, j));
                    break;
                }
            }
        }
    }

    let snapshot = manager.registry.read().await.clone();
    let fallback_pool = snapshot
        .routes
        .values()
        .find(|p| p.enabled)
        .map(|p| p.public_model_name.clone())
        .unwrap_or_else(|| "gpt-5".to_string());

    let j_vals = matched_journal.as_ref().map(|(_, j)| &j.patched_values);
    let base_url = manager
        .status()
        .await
        .base_url
        .or_else(|| {
            j_vals
                .and_then(|v| v.get("env.ANTHROPIC_BASE_URL"))
                .and_then(|v| v.as_str())
                .map(str::to_string)
        })
        .or_else(|| {
            get_setting(&root, "env.ANTHROPIC_BASE_URL")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "http://127.0.0.1:8787".to_string());

    let helper = if !self_exe.as_os_str().is_empty() {
        format!(
            "\"{}\" --claude-gateway-token {profile_id}",
            self_exe.display()
        )
    } else {
        j_vals
            .and_then(|v| v.get("apiKeyHelper"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let _ = remove_setting(&mut root, "env.ANTHROPIC_AUTH_TOKEN");
    let _ = remove_setting(&mut root, "env.ANTHROPIC_API_KEY");
    let _ = remove_setting(&mut root, "env.CLAUDE_CODE_EFFORT_LEVEL");

    let mut desired: Vec<(String, serde_json::Value)> = vec![
        ("apiKeyHelper".to_string(), helper.into()),
        ("env.ANTHROPIC_BASE_URL".to_string(), base_url.into()),
        ("env.CLAUDE_CODE_AUTO_MODE_SERVER".to_string(), "0".into()),
        ("env.CLAUDE_CODE_ATTRIBUTION_HEADER".to_string(), "0".into()),
        (
            "env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS".to_string(),
            "1".into(),
        ),
    ];

    for &key in MANAGED_MODEL_ENV_KEYS {
        let alias = j_vals
            .and_then(|v| v.get(key))
            .and_then(|v| v.as_str())
            .or_else(|| get_setting(&root, key).and_then(|v| v.as_str()))
            .map(str::to_string)
            .or_else(|| {
                (key == "env.ANTHROPIC_MODEL" || key == "env.ANTHROPIC_DEFAULT_MODEL")
                    .then(|| fallback_pool.clone())
            });
        if let Some(alias) = alias {
            desired.push((key.to_string(), alias.into()));
        }
    }

    let default_alias = desired
        .iter()
        .find(|(k, _)| k == "env.ANTHROPIC_MODEL")
        .and_then(|(_, v)| v.as_str())
        .unwrap_or(&fallback_pool)
        .to_ascii_lowercase();
    let limits = snapshot
        .routes
        .get(&default_alias)
        .map(|p| super::launcher::resolve_claude_pool_limits(p))
        .unwrap_or(super::launcher::ClaudePoolLimits {
            max_context_window_tokens: Some(200_000),
            thinking_budget_tokens: Some(8_192),
            claude_effort_level: Some("medium"),
        });

    desired.push((
        "env.CLAUDE_CODE_MAX_CONTEXT_TOKENS".to_string(),
        limits
            .max_context_window_tokens
            .unwrap_or(200_000)
            .to_string()
            .into(),
    ));
    desired.push((
        "env.MAX_THINKING_TOKENS".to_string(),
        limits
            .thinking_budget_tokens
            .unwrap_or(8_192)
            .to_string()
            .into(),
    ));
    desired.push((
        "effortLevel".to_string(),
        limits.claude_effort_level.unwrap_or("medium").into(),
    ));

    for (key, val) in &desired {
        set_setting(&mut root, key, val.clone())?;
    }

    if let Some((j_path, mut journal)) = matched_journal {
        journal
            .patched_keys
            .retain(|k| k != "env.CLAUDE_CODE_EFFORT_LEVEL");
        journal
            .patched_values
            .remove("env.CLAUDE_CODE_EFFORT_LEVEL");
        journal.original_keys.remove("env.CLAUDE_CODE_EFFORT_LEVEL");
        for (key, val) in desired {
            journal.original_keys.entry(key.clone()).or_insert(None);
            if !journal.patched_keys.contains(&key) {
                journal.patched_keys.push(key.clone());
            }
            journal.patched_values.insert(key, val);
        }
        let _ = save_journal(&journal, &j_path);
    }

    let formatted = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize restored settings.json: {e}"))?;
    if let Some(parent) = settings_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&settings_path, &formatted)
        .map_err(|e| format!("Failed to write restored settings.json: {e}"))?;
    Ok(formatted)
}
