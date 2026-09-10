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
            derived.or_else(|| name.map(|s| resolve_plan_name(&s).to_string()))
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
