use chrono::{DateTime, Utc};
use serde_json::Value;

use super::{family_for_entry, NormalizedQuotaBucket, QuotaFamily};

/// A valid catalog is authoritative even when empty; missing/malformed catalogs
/// leave quota-only fallback available after a failed catalog request.
pub(super) fn available_families(value: &Value) -> Option<Vec<QuotaFamily>> {
    let models = value
        .get("models")
        .or_else(|| value.pointer("/response/models"))?
        .as_object()?;
    Some(
        models
            .iter()
            .filter_map(|(id, model)| {
                if super::image::is_image_model(value, id) {
                    return None;
                }
                if model
                    .get("isInternal")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    return None;
                }
                family_for_entry(model, Some(id), None)
            })
            .collect(),
    )
}

fn resets_close(left: Option<&str>, right: Option<&str>) -> bool {
    match (left, right) {
        (Some(a), Some(b)) => {
            if a == b {
                return true;
            }
            if let (Ok(ta), Ok(tb)) = (
                DateTime::parse_from_rfc3339(a),
                DateTime::parse_from_rfc3339(b),
            ) {
                return (ta.with_timezone(&Utc) - tb.with_timezone(&Utc))
                    .num_seconds()
                    .abs()
                    <= 120;
            }
            false
        }
        (None, None) => true,
        _ => false,
    }
}

pub(super) fn shares_gemini_quota(
    argon: &NormalizedQuotaBucket,
    gemini_buckets: &[&NormalizedQuotaBucket],
) -> bool {
    gemini_buckets.iter().any(|gemini| {
        let same_pct = (gemini.remaining_fraction - argon.remaining_fraction).abs() <= 0.01
            || (gemini.remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32
                == (argon.remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
        same_pct && resets_close(gemini.reset_time.as_deref(), argon.reset_time.as_deref())
    })
}
