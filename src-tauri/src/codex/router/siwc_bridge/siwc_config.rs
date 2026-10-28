//! Preflight native SIWC registrations before publishing a router snapshot.
use super::pool_registry::PoolAuthMode;
use super::types::{CodexRouterAuth, CodexRouterConfig};
use std::collections::{HashMap, HashSet};

pub async fn verify_native_siwc_pools(
    app: &tauri::AppHandle,
    config: &CodexRouterConfig,
) -> Result<(), String> {
    let mut required: HashMap<&str, HashSet<&str>> = HashMap::new();
    for pool in config.pools_v2.as_deref().unwrap_or_default() {
        if !pool.enabled || pool.auth_mode != PoolAuthMode::Siwc {
            continue;
        }
        for id in &pool.member_account_ids {
            let account = config
                .accounts
                .iter()
                .find(|a| a.id == *id)
                .ok_or("Enabled SIWC pool has an unknown account")?;
            if !matches!(&account.auth, CodexRouterAuth::Siwc { registration_id } if registration_id == id)
            {
                return Err("SIWC requires a native account registration, not Codex OAuth".into());
            }
            required
                .entry(id)
                .or_default()
                .insert(&pool.upstream_model_id);
        }
    }
    if required.is_empty() {
        return Ok(());
    }
    let client = reqwest::Client::new();
    for (id, models) in required {
        let bearer =
            crate::codex::siwc::native_access::get_usable_siwc_bearer(app, id, &client).await?;
        let available = crate::codex::siwc::models::fetch_siwc_models(&client, &bearer).await?;
        for model in models {
            if !available.iter().any(|entry| entry.slug == model) {
                return Err(format!(
                    "Model '{}' is not listed for this authorized ChatGPT account. Choose a model from its SIWC catalog.",
                    model
                ));
            }
        }
    }
    Ok(())
}
