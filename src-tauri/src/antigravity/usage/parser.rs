use crate::types::{
    AntigravityModelFamily, AntigravityModelQuota, AntigravityUsageCommandError,
    AntigravityUsageWarning,
};
use serde_json::Value;

pub(crate) fn extract_project_id(value: &Value) -> Option<String> {
    let v = value.get("cloudaicompanionProject")?;
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    if let Some(obj) = v.as_object() {
        if let Some(s) = obj.get("id").and_then(Value::as_str) {
            return Some(s.to_string());
        }
        if let Some(s) = obj.get("projectId").and_then(Value::as_str) {
            return Some(s.to_string());
        }
        if let Some(s) = obj.get("projectID").and_then(Value::as_str) {
            return Some(s.to_string());
        }
    }
    None
}

pub(crate) fn resolve_plan_tier(value: &Value) -> Option<String> {
    let raw = value
        .pointer("/planInfo/planType")
        .or_else(|| value.pointer("/paidTier/name"))
        .or_else(|| value.pointer("/paidTier/id"))
        .or_else(|| value.pointer("/currentTier/name"))
        .or_else(|| value.pointer("/currentTier/id"))
        .and_then(Value::as_str)?;

    let name = match raw.to_lowercase().as_str() {
        "free-tier" | "free" => "Free",
        "standard-tier" | "standard" => "Paid",
        "legacy-tier" | "legacy" => "Legacy",
        "advanced-tier" | "google_ai_pro" | "google-ai-pro" => "Google AI Pro",
        "ultra-tier" | "google_ai_ultra" | "google-ai-ultra" => "Google AI Ultra",
        _ => raw,
    };
    Some(name.to_string())
}

pub(crate) fn classify_family(model_id: &str) -> AntigravityModelFamily {
    let id_lower = model_id.to_lowercase();
    if id_lower.contains("gemini") {
        AntigravityModelFamily::Gemini
    } else if id_lower.contains("claude") {
        AntigravityModelFamily::Claude
    } else if id_lower.contains("gpt")
        || id_lower.contains("openai")
        || id_lower.contains("o1")
        || id_lower.contains("o3")
        || id_lower.contains("o4")
    {
        AntigravityModelFamily::OpenAi
    } else {
        AntigravityModelFamily::Other
    }
}

pub(crate) fn family_priority(family: &AntigravityModelFamily) -> u32 {
    match family {
        AntigravityModelFamily::Gemini => 1,
        AntigravityModelFamily::Claude => 2,
        AntigravityModelFamily::OpenAi => 3,
        AntigravityModelFamily::Other => 4,
    }
}

pub(crate) fn sort_quotas(quotas: &mut [AntigravityModelQuota]) {
    quotas.sort_by(|a, b| {
        family_priority(&a.family)
            .cmp(&family_priority(&b.family))
            .then_with(|| a.display_name.cmp(&b.display_name))
            .then_with(|| a.model_id.cmp(&b.model_id))
    });
}

pub(crate) fn parse_fraction(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .filter(|f| f.is_finite())
        .map(|f| f.clamp(0.0, 1.0))
}

pub(crate) fn read_string_alias<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

pub(crate) fn build_quota(
    model_id: String,
    display_name: String,
    remaining_fraction: f64,
    reset_at: Option<String>,
) -> AntigravityModelQuota {
    AntigravityModelQuota {
        family: classify_family(&model_id),
        model_id,
        display_name,
        remaining_fraction,
        remaining_percent: (remaining_fraction * 100.0).round() as u32,
        reset_at,
        five_hour_percent: None,
        five_hour_reset: None,
        five_hour_disabled: None,
        weekly_percent: None,
        weekly_reset: None,
        weekly_disabled: None,
    }
}

pub(crate) fn normalize_available_models(
    value: &Value,
) -> Result<(Vec<AntigravityModelQuota>, Vec<AntigravityUsageWarning>), AntigravityUsageCommandError>
{
    let models_obj = value
        .get("models")
        .and_then(Value::as_object)
        .ok_or_else(|| AntigravityUsageCommandError {
            code: "ANTIGRAVITY_USAGE_INVALID_RESPONSE".to_string(),
            message: "Missing 'models' object in fetchAvailableModels response".to_string(),
            retryable: true,
        })?;

    let mut quotas = Vec::new();
    let mut warnings = Vec::new();
    let mut skipped_some = false;

    for (model_id, model_value) in models_obj {
        if model_value
            .get("isInternal")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }

        let quota_info = match model_value.get("quotaInfo") {
            Some(info) => info,
            None => {
                skipped_some = true;
                continue;
            }
        };

        let remaining_fraction = match parse_fraction(
            quota_info
                .get("remainingFraction")
                .or_else(|| quota_info.get("remaining_fraction")),
        ) {
            Some(fraction) => fraction,
            None => {
                skipped_some = true;
                continue;
            }
        };

        let display_name =
            read_string_alias(model_value, &["displayName", "display_name", "label"])
                .unwrap_or(model_id)
                .to_string();
        let reset_at =
            read_string_alias(quota_info, &["resetTime", "reset_time"]).map(str::to_string);

        quotas.push(build_quota(
            model_id.clone(),
            display_name,
            remaining_fraction,
            reset_at,
        ));
    }

    if skipped_some {
        warnings.push(AntigravityUsageWarning::SomeModelsSkipped);
    }
    if quotas.is_empty() {
        warnings.push(AntigravityUsageWarning::NoQuotaModelsReturned);
    } else {
        sort_quotas(&mut quotas);
    }

    Ok((quotas, warnings))
}

pub(crate) fn should_verify_full_quotas(quotas: &[AntigravityModelQuota]) -> bool {
    !quotas.is_empty() && quotas.iter().all(|quota| quota.remaining_fraction >= 0.999)
}
