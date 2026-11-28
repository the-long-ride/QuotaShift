use std::collections::{BTreeSet, HashSet};

use serde_json::Value;

const PREMIUM_CODENAMES: &[&str] = &["neon", "argon", "carbon"];
const LIGHTWEIGHT_TOKENS: &[&str] = &["hydrogen", "flash", "lite", "nano"];
const DISQUALIFYING_MEDIA_TOKENS: &[&str] = &["image", "imagen", "tts", "audio", "embedding"];
const EFFORT_SUFFIXES: &[&str] = &[
    "(high)",
    "(low)",
    "(medium)",
    "(thinking)",
    "(fast)",
    "(preview)",
    "(experimental)",
];

fn leading_major_version(token: &str) -> Option<u32> {
    if token.is_empty() || !token.chars().all(|c| c.is_ascii_digit()) {
        None
    } else {
        token.parse::<u32>().ok()
    }
}

pub(crate) fn is_utility_model_id(id: &str) -> bool {
    let lower = id.to_ascii_lowercase();
    lower.starts_with("tab_")
        || lower.starts_with("tab-")
        || lower.contains("autocomplete")
        || lower.contains("embedding")
}

/// Identifies next-gen Antigravity models (known codenames or non-lightweight Gemini >= 4),
/// rejecting media/image/audio/embedding variants before version/codename checks.
pub(crate) fn is_premium_model_text(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    let tokens: Vec<&str> = lower
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect();
    if tokens
        .iter()
        .any(|token| DISQUALIFYING_MEDIA_TOKENS.contains(token))
    {
        return false;
    }
    if tokens.iter().any(|token| PREMIUM_CODENAMES.contains(token)) {
        return true;
    }
    if tokens
        .iter()
        .any(|token| LIGHTWEIGHT_TOKENS.contains(token))
    {
        return false;
    }
    for (idx, token) in tokens.iter().enumerate() {
        if *token == "gemini" {
            if let Some(next) = tokens.get(idx + 1) {
                if leading_major_version(next).is_some_and(|major| major >= 4) {
                    return true;
                }
            }
        } else if let Some(rest) = token.strip_prefix("gemini") {
            if leading_major_version(rest).is_some_and(|major| major >= 4) {
                return true;
            }
        }
    }
    false
}

pub(crate) fn normalize_premium_model_label(raw: &str) -> String {
    let mut current = raw.trim().to_string();
    loop {
        let lower = current.to_ascii_lowercase();
        let matched = EFFORT_SUFFIXES
            .iter()
            .find(|suffix| lower.ends_with(*suffix))
            .copied();
        let Some(suffix) = matched else {
            break;
        };
        let keep = current.len().saturating_sub(suffix.len());
        current = current[..keep].trim_end().to_string();
    }
    current
}

fn is_internal_model(model: &Value) -> bool {
    model
        .get("isInternal")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub(crate) fn has_populated_quota_info(model: &Value) -> bool {
    model
        .get("quotaInfo")
        .and_then(Value::as_object)
        .is_some_and(|info| !info.is_empty())
}

pub(crate) fn selectable_agent_model_ids(value: &Value) -> Option<HashSet<&str>> {
    let sorts = value
        .get("agentModelSorts")
        .or_else(|| value.pointer("/response/agentModelSorts"))?
        .as_array()?;
    let mut ids = HashSet::new();
    for sort in sorts {
        let Some(groups) = sort.get("groups").and_then(Value::as_array) else {
            continue;
        };
        for group in groups {
            let Some(model_ids) = group.get("modelIds").and_then(Value::as_array) else {
                continue;
            };
            for id in model_ids.iter().filter_map(Value::as_str) {
                let trimmed = id.trim();
                if !trimmed.is_empty() {
                    ids.insert(trimmed);
                }
            }
        }
    }
    (!ids.is_empty()).then_some(ids)
}

/// Returns `None` when the catalog is missing/malformed, `Some(vec)` when valid.
pub(crate) fn extract_premium_models(value: &Value) -> Option<Vec<String>> {
    let models = value
        .get("models")
        .or_else(|| value.pointer("/response/models"))?
        .as_object()?;
    let selectable = selectable_agent_model_ids(value);
    let catalog_has_quota_info = models
        .values()
        .any(|model| !is_internal_model(model) && has_populated_quota_info(model));

    let mut labels = BTreeSet::new();
    for (id, model) in models {
        if let Some(allowed) = selectable.as_ref() {
            if !allowed.contains(id.as_str()) {
                continue;
            }
        }
        if super::image::is_image_model(value, id)
            || is_utility_model_id(id)
            || is_internal_model(model)
            || super::disabled_from(model)
        {
            continue;
        }
        if catalog_has_quota_info && !has_populated_quota_info(model) {
            continue;
        }
        if selectable.is_none() && model.get("recommended").and_then(Value::as_bool) == Some(false)
        {
            continue;
        }
        let mut search_text = id.clone();
        for key in [
            "displayName",
            "display_name",
            "label",
            "model",
            "modelId",
            "model_id",
            "id",
        ] {
            if let Some(v) = model.get(key).and_then(Value::as_str) {
                search_text.push(' ');
                search_text.push_str(v);
            }
        }
        if !is_premium_model_text(&search_text) {
            continue;
        }
        let display = ["displayName", "display_name", "label"]
            .iter()
            .find_map(|key| model.get(*key).and_then(Value::as_str))
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(id.as_str());
        let normalized = normalize_premium_model_label(display);
        if !normalized.is_empty() {
            labels.insert(normalized);
        }
    }
    Some(labels.into_iter().collect())
}

pub(crate) fn is_pro_plan_tier(plan_tier: Option<&str>) -> bool {
    let Some(raw) = plan_tier.map(str::trim).filter(|s| !s.is_empty()) else {
        return false;
    };
    let lower = raw.to_ascii_lowercase();
    if lower.contains("ultra")
        || lower.contains("plus")
        || lower.contains("paid")
        || lower.contains("standard")
        || lower.contains("legacy")
        || lower.contains("enterprise")
        || lower.contains("free")
    {
        return false;
    }
    lower.contains("pro") || lower.contains("advanced")
}

fn bucket_has_fraction(bucket: &Value) -> bool {
    bucket
        .get("remainingFraction")
        .or_else(|| bucket.get("remaining_fraction"))
        .and_then(Value::as_f64)
        .is_some()
}

fn bucket_entry_is_explicit_premium(bucket: &Value) -> bool {
    bucket_has_fraction(bucket)
        && [
            "bucketId",
            "bucket_id",
            "modelId",
            "model_id",
            "displayName",
            "display_name",
            "label",
        ]
        .iter()
        .any(|key| {
            bucket
                .get(*key)
                .and_then(Value::as_str)
                .is_some_and(is_premium_model_text)
        })
}

/// Checks explicit group names and bucket IDs only (never generic Gemini descriptions).
pub(crate) fn summary_has_explicit_premium_bucket(raw_summary: &Value) -> bool {
    if let Some(groups) = raw_summary
        .pointer("/response/groups")
        .or_else(|| raw_summary.get("groups"))
        .and_then(Value::as_array)
    {
        for group in groups {
            let group_name = ["displayName", "display_name", "label"]
                .iter()
                .find_map(|key| group.get(*key).and_then(Value::as_str))
                .unwrap_or("");
            let buckets = group
                .get("buckets")
                .or_else(|| group.get("modelBuckets"))
                .and_then(Value::as_array);
            if buckets.is_some_and(|list| {
                (is_premium_model_text(group_name) && list.iter().any(bucket_has_fraction))
                    || list.iter().any(bucket_entry_is_explicit_premium)
            }) {
                return true;
            }
        }
    }
    [
        "/response/modelBuckets",
        "/response/buckets",
        "/modelBuckets",
        "/buckets",
    ]
    .iter()
    .any(|pointer| {
        raw_summary
            .pointer(pointer)
            .and_then(Value::as_array)
            .is_some_and(|buckets| buckets.iter().any(bucket_entry_is_explicit_premium))
    })
}

pub(crate) fn enrich_pro_plus_plan_tier(
    plan_tier: Option<String>,
    premium_models: Option<&[String]>,
    raw_summary: Option<&Value>,
) -> Option<String> {
    if !is_pro_plan_tier(plan_tier.as_deref()) {
        return plan_tier;
    }
    let has_premium = match premium_models {
        Some(models) => !models.is_empty(),
        None => raw_summary.is_some_and(summary_has_explicit_premium_bucket),
    };
    if has_premium {
        Some("Google AI Pro+".to_string())
    } else {
        plan_tier
    }
}
