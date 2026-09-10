use chrono::{DateTime, Utc};
use serde_json::Value;

use super::window::*;

pub fn fraction_from(entry: &Value) -> Option<f64> {
    let candidates = [
        entry.pointer("/remaining/remainingFraction"),
        entry.pointer("/remaining/remaining_fraction"),
        entry.pointer("/quotaInfo/remainingFraction"),
        entry.pointer("/quotaInfo/remaining_fraction"),
        entry.pointer("/quotaInfo/remaining/remainingFraction"),
        entry.pointer("/quotaInfo/remaining/remaining_fraction"),
        entry.get("remainingFraction"),
        entry.get("remaining_fraction"),
        entry.get("fractionRemaining"),
        entry.get("fraction_remaining"),
    ];
    candidates
        .into_iter()
        .flatten()
        .find_map(number)
        .map(|value| value.clamp(0.0, 1.0))
}

pub fn reset_from(entry: &Value) -> Option<String> {
    let direct = string_alias(
        entry,
        &[
            "resetTime",
            "reset_time",
            "resetAt",
            "reset_at",
            "resetTimeDescription",
            "reset_time_description",
        ],
    );
    direct.or_else(|| {
        entry.get("quotaInfo").and_then(|quota| {
            string_alias(
                quota,
                &[
                    "resetTime",
                    "reset_time",
                    "resetAt",
                    "reset_at",
                    "resetTimeDescription",
                    "reset_time_description",
                ],
            )
        })
    })
}

pub fn disabled_from(entry: &Value) -> bool {
    value_alias(entry, &["disabled", "isDisabled", "is_disabled"])
        .and_then(Value::as_bool)
        .or_else(|| {
            entry
                .get("quotaInfo")
                .and_then(|quota| value_alias(quota, &["disabled", "isDisabled", "is_disabled"]))
                .and_then(Value::as_bool)
        })
        .unwrap_or(false)
}

pub fn family_from_text(text: &str) -> Option<QuotaFamily> {
    let text = text.to_lowercase();
    if text.contains("gemini") || text.contains("imagen") {
        Some(QuotaFamily::Gemini)
    } else if text.contains("claude")
        || text.contains("gpt")
        || text.contains("openai")
        || text.contains("o1")
        || text.contains("o3")
        || text.contains("o4")
    {
        Some(QuotaFamily::ClaudeGpt)
    } else {
        None
    }
}

pub fn family_for_entry(
    entry: &Value,
    fallback_id: Option<&str>,
    hint: Option<QuotaFamily>,
) -> Option<QuotaFamily> {
    let mut text = String::new();
    for key in [
        "modelId",
        "model_id",
        "model",
        "id",
        "bucketId",
        "bucket_id",
        "displayName",
        "display_name",
        "description",
        "desc",
    ] {
        if let Some(value) = entry.get(key).and_then(Value::as_str) {
            text.push(' ');
            text.push_str(value);
        }
    }
    if let Some(fallback_id) = fallback_id {
        text.push(' ');
        text.push_str(fallback_id);
    }
    family_from_text(&text).or(hint)
}

pub fn normalize_entry(
    entry: &Value,
    fallback_id: Option<&str>,
    family_hint: Option<QuotaFamily>,
    source: QuotaSource,
    observed_at: &DateTime<Utc>,
) -> Result<NormalizedQuotaBucket, &'static str> {
    let family = family_for_entry(entry, fallback_id, family_hint).ok_or("unknown model family")?;
    let remaining_fraction = fraction_from(entry).ok_or("missing remaining fraction")?;
    let reset_time = reset_from(entry);
    let window = if source == QuotaSource::AvailableModels {
        QuotaWindow::Unknown
    } else {
        classify_window(entry, reset_time.as_deref(), observed_at)
    };
    Ok(NormalizedQuotaBucket {
        family,
        remaining_fraction,
        reset_time,
        window,
        disabled: disabled_from(entry),
        source,
    })
}

pub fn push_collection(
    value: &Value,
    family_hint: Option<QuotaFamily>,
    source: QuotaSource,
    observed_at: &DateTime<Utc>,
    buckets: &mut Vec<NormalizedQuotaBucket>,
    diagnostics: &mut Vec<String>,
) {
    if let Some(entries) = value.as_array() {
        for entry in entries {
            match normalize_entry(entry, None, family_hint, source, observed_at) {
                Ok(bucket) => buckets.push(bucket),
                Err(reason) => diagnostics.push(format!("skipped quota bucket: {reason}")),
            }
        }
    } else if let Some(entries) = value.as_object() {
        for (fallback_id, entry) in entries {
            match normalize_entry(entry, Some(fallback_id), family_hint, source, observed_at) {
                Ok(bucket) => buckets.push(bucket),
                Err(reason) => diagnostics.push(format!("skipped quota bucket: {reason}")),
            }
        }
    }
}

pub fn normalize_available_models(
    value: &Value,
    observed_at: &DateTime<Utc>,
    diagnostics: &mut Vec<String>,
) -> Vec<NormalizedQuotaBucket> {
    let Some(models) = value
        .get("models")
        .or_else(|| value.pointer("/response/models"))
        .and_then(Value::as_object)
    else {
        diagnostics.push("fetchAvailableModels returned no models object".to_string());
        return Vec::new();
    };

    let mut buckets = Vec::new();
    for (model_id, model) in models {
        if model
            .get("isInternal")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        let entry = model.get("quotaInfo").unwrap_or(model);
        let wrapped = serde_json::json!({
            "modelId": model_id,
            "displayName": model.get("displayName").or_else(|| model.get("display_name")),
            "remainingFraction": fraction_from(entry),
            "resetTime": reset_from(entry),
            "disabled": disabled_from(entry),
        });
        match normalize_entry(
            &wrapped,
            Some(model_id),
            family_from_text(model_id),
            QuotaSource::AvailableModels,
            observed_at,
        ) {
            Ok(bucket) => buckets.push(bucket),
            Err(reason) => diagnostics.push(format!(
                "skipped fetchAvailableModels model {model_id}: {reason}"
            )),
        }
    }
    buckets
}

pub fn normalize_user_quota(
    value: &Value,
    observed_at: &DateTime<Utc>,
    diagnostics: &mut Vec<String>,
) -> Vec<NormalizedQuotaBucket> {
    let mut buckets = Vec::new();

    for pointer in [
        "/response/groups",
        "/groups",
        "/userQuota/groups",
        "/quotaSummary/groups",
        "/quota_summary/groups",
    ] {
        if let Some(groups) = value.pointer(pointer).and_then(Value::as_array) {
            for group in groups {
                let display_name = string_alias(group, &["displayName", "display_name", "label"]);
                let description = string_alias(group, &["description", "desc"]);
                let combined = format!(
                    "{} {}",
                    display_name.as_deref().unwrap_or(""),
                    description.as_deref().unwrap_or("")
                );
                let family_hint = family_from_text(&combined);
                if let Some(collection) = group.get("buckets").or_else(|| group.get("modelBuckets"))
                {
                    push_collection(
                        collection,
                        family_hint,
                        QuotaSource::UserQuota,
                        observed_at,
                        &mut buckets,
                        diagnostics,
                    );
                }
            }
            if !buckets.is_empty() {
                diagnostics.push(format!(
                    "retrieveUserQuota selected grouped shape at {pointer}"
                ));
                return buckets;
            }
        }
    }

    for pointer in [
        "/response/modelBuckets",
        "/response/buckets",
        "/modelBuckets",
        "/buckets",
        "/userQuota/modelBuckets",
        "/userQuota/buckets",
        "/userQuota/quotaBuckets",
    ] {
        if let Some(collection) = value.pointer(pointer) {
            push_collection(
                collection,
                None,
                QuotaSource::UserQuota,
                observed_at,
                &mut buckets,
                diagnostics,
            );
            diagnostics.push(format!(
                "retrieveUserQuota selected flat shape at {pointer}"
            ));
            break;
        }
    }

    diagnostics.push(format!(
        "retrieveUserQuota normalized {} buckets",
        buckets.len()
    ));
    buckets
}
