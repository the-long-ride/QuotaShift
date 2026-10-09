use serde_json::Value;

use super::{family_for_entry, QuotaFamily};

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
