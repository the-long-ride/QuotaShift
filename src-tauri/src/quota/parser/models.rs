use std::collections::BTreeSet;

use serde_json::Value;

pub(crate) fn extract_ide_premium_models(raw: &Value) -> Option<Vec<String>> {
    let cascade_data = raw.pointer("/userStatus/cascadeModelConfigData")?;
    let configs = cascade_data.get("clientModelConfigs")?.as_array()?;
    let selectable = crate::antigravity_quota::selectable_agent_model_ids(cascade_data);
    let catalog_has_quota_info = configs.iter().any(|config| {
        !config
            .get("isInternal")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            && crate::antigravity_quota::has_populated_quota_info(config)
    });
    let mut labels = BTreeSet::new();
    for config in configs {
        if config
            .get("isInternal")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || crate::antigravity_quota::disabled_from(config)
        {
            continue;
        }
        if let Some(allowed) = selectable.as_ref() {
            let in_sorts = ["modelId", "model_id", "id"]
                .iter()
                .filter_map(|key| config.get(*key).and_then(Value::as_str))
                .chain(
                    ["/modelOrAlias/model", "/modelOrAlias/alias"]
                        .iter()
                        .filter_map(|pointer| config.pointer(pointer).and_then(Value::as_str)),
                )
                .any(|id| allowed.contains(id.trim()));
            if !in_sorts {
                continue;
            }
        }
        if catalog_has_quota_info && !crate::antigravity_quota::has_populated_quota_info(config) {
            continue;
        }
        if selectable.is_none() && config.get("recommended").and_then(Value::as_bool) == Some(false)
        {
            continue;
        }
        let mut search_text = String::new();
        for key in [
            "label",
            "displayName",
            "display_name",
            "modelId",
            "model_id",
            "model",
        ] {
            if let Some(value) = config.get(key).and_then(Value::as_str) {
                search_text.push(' ');
                search_text.push_str(value);
            }
        }
        for pointer in ["/modelOrAlias/model", "/modelOrAlias/alias"] {
            if let Some(value) = config.pointer(pointer).and_then(Value::as_str) {
                search_text.push(' ');
                search_text.push_str(value);
            }
        }
        let lower = search_text.to_ascii_lowercase();
        if lower.contains("imagen")
            || lower.contains("image-generation")
            || lower.contains("autocomplete")
            || lower.contains("embedding")
        {
            continue;
        }
        if !crate::antigravity_quota::is_premium_model_text(&search_text) {
            continue;
        }
        let display = ["label", "displayName", "display_name"]
            .iter()
            .find_map(|key| config.get(*key).and_then(Value::as_str))
            .or_else(|| {
                config
                    .pointer("/modelOrAlias/model")
                    .and_then(Value::as_str)
            })
            .or_else(|| config.get("modelId").and_then(Value::as_str))
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(raw_label) = display {
            let normalized = crate::antigravity_quota::normalize_premium_model_label(raw_label);
            if !normalized.is_empty() {
                labels.insert(normalized);
            }
        }
    }
    Some(labels.into_iter().collect())
}

pub(crate) fn resolve_ide_plan_and_models(
    raw: &Value,
    quota_summary: &Value,
) -> (Option<String>, Option<Vec<String>>) {
    let base_plan = raw
        .pointer("/userStatus/userTier/name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let premium_models = extract_ide_premium_models(raw);
    let plan_tier = crate::antigravity_quota::enrich_pro_plus_plan_tier(
        base_plan,
        premium_models.as_deref(),
        Some(quota_summary),
    );
    (plan_tier, premium_models)
}

#[allow(dead_code)]
pub(crate) fn build_status_from_models_response(
    models_resp: serde_json::Value,
    plan_info: Option<&serde_json::Value>,
) -> serde_json::Value {
    let mut client_model_configs = Vec::new();
    if let Some(models_map) = models_resp.get("models").and_then(|v| v.as_object()) {
        for (model_name, model_info) in models_map {
            let quota_info = model_info
                .get("quotaInfo")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            client_model_configs.push(serde_json::json!({
                "label": model_name,
                "modelId": model_name,
                "quotaInfo": quota_info,
                "displayName": model_info.get("displayName"),
            }));
        }
    }

    // Cloud-driven plan info comes from the loadCodeAssist response.
    // Prefer planInfo.planType (matches CodexBar's resolvePlan()).
    let plan_name = plan_info
        .and_then(|pi| pi.get("planType"))
        .and_then(|v| v.as_str())
        .map(|s| resolve_plan_name(s).to_string())
        .or_else(|| {
            let tier = models_resp
                .get("paidTier")
                .or_else(|| models_resp.get("currentTier"));
            let id = tier.and_then(|t| t.get("id")).and_then(|v| v.as_str());
            let name = tier.and_then(|t| t.get("name")).and_then(|v| v.as_str());
            let derived = match id {
                Some("standard-tier") => Some("Paid".to_string()),
                Some("free-tier") => Some("Free".to_string()),
                Some("legacy-tier") => Some("Legacy".to_string()),
                Some("advanced-tier") => Some("Google AI Pro".to_string()),
                _ => id.map(|tid| resolve_plan_name(tid).to_string()),
            };
            derived.or_else(|| name.map(|s| resolve_plan_name(s).to_string()))
        });

    fn resolve_plan_name(raw: &str) -> &str {
        match raw {
            "free-tier" | "free" => "Free",
            "standard-tier" | "standard" => "Paid",
            "legacy-tier" | "legacy" => "Legacy",
            "advanced-tier" | "advanced" | "google_ai_pro" | "google-ai-pro" | "ai-pro" => {
                "Google AI Pro"
            }
            "ultra-tier" | "ultra" | "google_ai_ultra" | "google-ai-ultra" | "ai-ultra" => {
                "Google AI Ultra"
            }
            s => s,
        }
    }

    serde_json::json!({
        "userStatus": {
            "userTier": {
                "name": plan_name
            },
            "planInfo": plan_info.cloned().unwrap_or(serde_json::Value::Null),
            "cascadeModelConfigData": {
                "clientModelConfigs": client_model_configs
            },
            "userInfo": {
                "email": null,
                "creditInfo": null
            }
        }
    })
}
