use serde_json::Value;

use crate::types::{AntigravityModelFamily, AntigravityModelQuota};

use super::{fraction_from, reset_from};

/// Prefer the server-declared image model IDs; recognize legacy image model names as well.
pub(super) fn is_image_model(response: &Value, model_id: &str) -> bool {
    let declared = response
        .get("imageGenerationModelIds")
        .or_else(|| response.pointer("/response/imageGenerationModelIds"))
        .and_then(Value::as_array)
        .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(model_id)));
    if declared {
        return true;
    }
    let id = model_id.to_ascii_lowercase();
    id.contains("imagen")
        || id.contains("image-generation")
        || id.ends_with("-image")
        || id.ends_with("_image")
}

/// Image quotas are independent from Gemini's model-pool limits.
pub(super) fn extract_image_quota(response: &Value) -> Option<AntigravityModelQuota> {
    let models = response
        .get("models")
        .or_else(|| response.pointer("/response/models"))?
        .as_object()?;
    let mut selected: Option<AntigravityModelQuota> = None;

    for (id, model) in models {
        if !is_image_model(response, id)
            || model.get("isInternal").and_then(Value::as_bool) == Some(true)
        {
            continue;
        }
        let info = model.get("quotaInfo").unwrap_or(model);
        let Some(fraction) = fraction_from(info) else {
            continue;
        };
        let quota = AntigravityModelQuota {
            model_id: "image_generation_pool".to_string(),
            display_name: "Image Generation".to_string(),
            family: AntigravityModelFamily::Other,
            remaining_fraction: fraction,
            remaining_percent: (fraction * 100.0).round() as u32,
            reset_at: reset_from(info),
            five_hour_percent: None,
            five_hour_reset: None,
            five_hour_disabled: None,
            weekly_percent: None,
            weekly_reset: None,
            weekly_disabled: None,
        };
        // With multiple image models, show the most restrictive available meter.
        if selected
            .as_ref()
            .is_none_or(|current| fraction < current.remaining_fraction)
        {
            selected = Some(quota);
        }
    }
    selected
}

#[cfg(test)]
mod tests;
