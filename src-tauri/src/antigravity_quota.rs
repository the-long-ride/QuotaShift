use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::types::{AntigravityModelFamily, AntigravityModelQuota};

const FIVE_HOUR_MIN_SECONDS: f64 = 4.5 * 60.0 * 60.0;
const FIVE_HOUR_MAX_SECONDS: f64 = 5.5 * 60.0 * 60.0;
const WEEKLY_MIN_SECONDS: f64 = 6.5 * 24.0 * 60.0 * 60.0;
const WEEKLY_MAX_SECONDS: f64 = 7.5 * 24.0 * 60.0 * 60.0;
const INFERRED_FIVE_HOUR_MAX_SECONDS: i64 = 5 * 60 * 60 + 15 * 60;
const INFERRED_WEEKLY_MAX_SECONDS: i64 = 7 * 24 * 60 * 60 + 12 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum QuotaFamily {
    Gemini,
    ClaudeGpt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum QuotaWindow {
    FiveHour,
    Weekly,
    Other,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QuotaSource {
    AvailableModels,
    UserQuota,
}

#[derive(Debug, Clone)]
struct NormalizedQuotaBucket {
    family: QuotaFamily,
    model_id: String,
    remaining_fraction: f64,
    reset_time: Option<String>,
    window: QuotaWindow,
    disabled: bool,
    source: QuotaSource,
}

#[derive(Debug, Clone, Default)]
struct LaneAggregate {
    selected_fraction: Option<f64>,
    selected_reset: Option<String>,
    contributors: usize,
    all_disabled: bool,
}

impl LaneAggregate {
    fn consider(&mut self, bucket: &NormalizedQuotaBucket) {
        self.contributors += 1;
        if self.contributors == 1 {
            self.all_disabled = bucket.disabled;
        } else {
            self.all_disabled &= bucket.disabled;
        }

        let replace = match self.selected_fraction {
            None => true,
            Some(existing) if bucket.remaining_fraction < existing => true,
            Some(existing) if (bucket.remaining_fraction - existing).abs() < f64::EPSILON => {
                reset_is_earlier(bucket.reset_time.as_deref(), self.selected_reset.as_deref())
            }
            _ => false,
        };

        if replace {
            self.selected_fraction = Some(bucket.remaining_fraction);
            self.selected_reset = bucket.reset_time.clone();
        }
    }

    fn percent(&self) -> Option<u32> {
        self.selected_fraction
            .map(|fraction| (fraction.clamp(0.0, 1.0) * 100.0).round() as u32)
    }

    fn disabled(&self) -> Option<bool> {
        (self.contributors > 0).then_some(self.all_disabled)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct AntigravityQuotaAggregation {
    pub quotas: Vec<AntigravityModelQuota>,
    pub diagnostics: Vec<String>,
}

fn reset_is_earlier(candidate: Option<&str>, existing: Option<&str>) -> bool {
    match (candidate, existing) {
        (Some(candidate), Some(existing)) => {
            match (
                DateTime::parse_from_rfc3339(candidate),
                DateTime::parse_from_rfc3339(existing),
            ) {
                (Ok(candidate), Ok(existing)) => candidate < existing,
                _ => candidate < existing,
            }
        }
        (Some(_), None) => true,
        _ => false,
    }
}

fn value_alias<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| value.get(*key))
}

fn string_alias(value: &Value, keys: &[&str]) -> Option<String> {
    value_alias(value, keys)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_i64().map(|value| value as f64))
        .or_else(|| value.as_u64().map(|value| value as f64))
        .or_else(|| value.as_str().and_then(|value| value.parse::<f64>().ok()))
        .filter(|value| value.is_finite())
}

fn fraction_from(entry: &Value) -> Option<f64> {
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

fn reset_from(entry: &Value) -> Option<String> {
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

fn disabled_from(entry: &Value) -> bool {
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

fn family_from_text(text: &str) -> Option<QuotaFamily> {
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

fn family_for_entry(entry: &Value, fallback_id: Option<&str>, hint: Option<QuotaFamily>) -> Option<QuotaFamily> {
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

fn model_id_from(entry: &Value, fallback_id: Option<&str>) -> String {
    string_alias(
        entry,
        &[
            "modelId",
            "model_id",
            "model",
            "id",
            "bucketId",
            "bucket_id",
            "displayName",
            "display_name",
        ],
    )
    .or_else(|| fallback_id.map(str::to_string))
    .unwrap_or_else(|| "unnamed-quota-bucket".to_string())
}

fn duration_seconds_from(entry: &Value) -> Option<f64> {
    let minute_keys = [
        "windowMinutes",
        "window_minutes",
        "durationMinutes",
        "duration_minutes",
        "limitWindowMinutes",
        "limit_window_minutes",
    ];
    let second_keys = [
        "windowSeconds",
        "window_seconds",
        "durationSeconds",
        "duration_seconds",
        "limitWindowSeconds",
        "limit_window_seconds",
    ];

    for container in [Some(entry), entry.get("quotaInfo"), entry.get("window")]
        .into_iter()
        .flatten()
    {
        if let Some(value) = value_alias(container, &minute_keys).and_then(number) {
            return Some(value * 60.0);
        }
        if let Some(value) = value_alias(container, &second_keys).and_then(number) {
            return Some(value);
        }
        if let Some(value) = value_alias(container, &["minutes", "minute"]).and_then(number) {
            return Some(value * 60.0);
        }
        if let Some(value) = value_alias(container, &["seconds", "second"]).and_then(number) {
            return Some(value);
        }
    }
    None
}

fn classify_duration(seconds: f64) -> QuotaWindow {
    if (FIVE_HOUR_MIN_SECONDS..=FIVE_HOUR_MAX_SECONDS).contains(&seconds) {
        QuotaWindow::FiveHour
    } else if (WEEKLY_MIN_SECONDS..=WEEKLY_MAX_SECONDS).contains(&seconds) {
        QuotaWindow::Weekly
    } else {
        QuotaWindow::Other
    }
}

fn window_text(entry: &Value) -> String {
    let mut parts = Vec::new();
    for key in [
        "window",
        "windowType",
        "window_type",
        "quotaWindow",
        "quota_window",
        "bucketId",
        "bucket_id",
        "id",
        "description",
        "desc",
    ] {
        if let Some(value) = entry.get(key).and_then(Value::as_str) {
            parts.push(value);
        }
    }
    if let Some(quota_info) = entry.get("quotaInfo") {
        for key in ["window", "windowType", "window_type", "quotaWindow", "quota_window"] {
            if let Some(value) = quota_info.get(key).and_then(Value::as_str) {
                parts.push(value);
            }
        }
    }
    parts.join(" ").to_lowercase()
}

fn classify_text(text: &str) -> QuotaWindow {
    let normalized = text.replace('_', " ").replace('-', " ");
    if normalized.contains("weekly")
        || normalized.contains(" week")
        || normalized.starts_with("week")
        || normalized.contains("7d")
        || normalized.contains("7 day")
    {
        QuotaWindow::Weekly
    } else if normalized.contains("5h")
        || normalized.contains("5 hour")
        || normalized.contains("five hour")
        || normalized.contains("fivehour")
    {
        QuotaWindow::FiveHour
    } else {
        QuotaWindow::Unknown
    }
}

fn classify_reset(reset_time: Option<&str>, observed_at: &DateTime<Utc>) -> QuotaWindow {
    let Some(reset_time) = reset_time else {
        return QuotaWindow::Unknown;
    };
    let Ok(reset_time) = DateTime::parse_from_rfc3339(reset_time) else {
        return QuotaWindow::Unknown;
    };
    let delta = reset_time.with_timezone(&Utc).signed_duration_since(observed_at.clone());
    let seconds = delta.num_seconds();
    if seconds < 0 {
        QuotaWindow::Unknown
    } else if seconds <= INFERRED_FIVE_HOUR_MAX_SECONDS {
        QuotaWindow::FiveHour
    } else if seconds <= INFERRED_WEEKLY_MAX_SECONDS {
        QuotaWindow::Weekly
    } else {
        QuotaWindow::Unknown
    }
}

fn classify_window(entry: &Value, reset_time: Option<&str>, observed_at: &DateTime<Utc>) -> QuotaWindow {
    if let Some(seconds) = duration_seconds_from(entry) {
        return classify_duration(seconds);
    }
    let explicit = classify_text(&window_text(entry));
    if explicit != QuotaWindow::Unknown {
        return explicit;
    }

    // Google's flat retrieveUserQuota buckets often omit window identity. A
    // long reset can safely identify a weekly bucket; a short reset cannot
    // distinguish a five-hour bucket from the shared unlabeled quota shape,
    // so keep it Unknown for the shared-lane fallback below.
    match classify_reset(reset_time, observed_at) {
        QuotaWindow::Weekly => QuotaWindow::Weekly,
        _ => QuotaWindow::Unknown,
    }
}

fn normalize_entry(
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
        model_id: model_id_from(entry, fallback_id),
        remaining_fraction,
        reset_time,
        window,
        disabled: disabled_from(entry),
        source,
    })
}

fn push_collection(
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

fn normalize_available_models(
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
        if model.get("isInternal").and_then(Value::as_bool).unwrap_or(false) {
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
            Err(reason) => diagnostics.push(format!("skipped available model {model_id}: {reason}")),
        }
    }
    diagnostics.push(format!("fetchAvailableModels normalized {} buckets", buckets.len()));
    buckets
}

fn normalize_user_quota(
    value: &Value,
    observed_at: &DateTime<Utc>,
    diagnostics: &mut Vec<String>,
) -> Vec<NormalizedQuotaBucket> {
    let mut buckets = Vec::new();

    for pointer in ["/response/groups", "/groups"] {
        if let Some(groups) = value.pointer(pointer).and_then(Value::as_array) {
            for group in groups {
                let group_text = format!(
                    "{} {}",
                    string_alias(group, &["displayName", "display_name", "name"]).unwrap_or_default(),
                    string_alias(group, &["description", "desc"]).unwrap_or_default()
                );
                let family_hint = family_from_text(&group_text);
                if let Some(collection) = group.get("buckets").or_else(|| group.get("quotaBuckets")) {
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
            diagnostics.push(format!("retrieveUserQuota selected grouped shape at {pointer}"));
            break;
        }
    }

    for pointer in [
        "/response/modelBuckets",
        "/modelBuckets",
        "/response/quotaBuckets",
        "/quotaBuckets",
        "/response/buckets",
        "/buckets",
        "/quota/buckets",
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
            diagnostics.push(format!("retrieveUserQuota selected flat shape at {pointer}"));
            break;
        }
    }

    diagnostics.push(format!("retrieveUserQuota normalized {} buckets", buckets.len()));
    buckets
}

fn aggregate_lane<'a>(buckets: impl Iterator<Item = &'a NormalizedQuotaBucket>) -> LaneAggregate {
    let mut aggregate = LaneAggregate::default();
    for bucket in buckets {
        aggregate.consider(bucket);
    }
    aggregate
}

fn family_name(family: QuotaFamily) -> (&'static str, &'static str, AntigravityModelFamily) {
    match family {
        QuotaFamily::Gemini => ("gemini_pool", "Gemini Models", AntigravityModelFamily::Gemini),
        QuotaFamily::ClaudeGpt => (
            "claude_gpt_pool",
            "Claude and GPT Models",
            AntigravityModelFamily::Claude,
        ),
    }
}

fn build_pool(
    family: QuotaFamily,
    five_hour: LaneAggregate,
    weekly: LaneAggregate,
) -> AntigravityModelQuota {
    let (model_id, display_name, public_family) = family_name(family);
    let alias_fraction = five_hour
        .selected_fraction
        .or(weekly.selected_fraction)
        .unwrap_or(0.0);
    let alias_reset = five_hour
        .selected_reset
        .clone()
        .or_else(|| weekly.selected_reset.clone());
    let five_hour_percent = five_hour.percent();
    let five_hour_disabled = five_hour.disabled();
    let weekly_percent = weekly.percent();
    let weekly_disabled = weekly.disabled();

    AntigravityModelQuota {
        model_id: model_id.to_string(),
        display_name: display_name.to_string(),
        family: public_family,
        remaining_fraction: alias_fraction,
        remaining_percent: (alias_fraction * 100.0).round() as u32,
        reset_at: alias_reset,
        five_hour_percent,
        five_hour_reset: five_hour.selected_reset,
        five_hour_disabled,
        weekly_percent,
        weekly_reset: weekly.selected_reset,
        weekly_disabled,
    }
}

pub(crate) fn aggregate_antigravity_quotas(
    available_models: Option<&Value>,
    user_quota: Option<&Value>,
    observed_at: DateTime<Utc>,
) -> AntigravityQuotaAggregation {
    let mut diagnostics = Vec::new();
    let available = available_models
        .map(|value| normalize_available_models(value, &observed_at, &mut diagnostics))
        .unwrap_or_default();
    let user = user_quota
        .map(|value| normalize_user_quota(value, &observed_at, &mut diagnostics))
        .unwrap_or_default();

    let mut quotas = Vec::new();
    for family in [QuotaFamily::Gemini, QuotaFamily::ClaudeGpt] {
        let family_present = available.iter().any(|bucket| bucket.family == family)
            || user.iter().any(|bucket| bucket.family == family);
        if !family_present {
            continue;
        }

        let mut five_hour = aggregate_lane(
            user.iter()
                .filter(|bucket| bucket.family == family && bucket.window == QuotaWindow::FiveHour),
        );
        let mut weekly = aggregate_lane(
            user.iter()
                .filter(|bucket| bucket.family == family && bucket.window == QuotaWindow::Weekly),
        );

        let unknown: Vec<_> = user
            .iter()
            .filter(|bucket| bucket.family == family && bucket.window == QuotaWindow::Unknown)
            .collect();
        if !unknown.is_empty() {
            if five_hour.contributors == 0 {
                five_hour = aggregate_lane(unknown.iter().copied());
            }
            if weekly.contributors == 0 {
                weekly = aggregate_lane(unknown.iter().copied());
            }
            diagnostics.push(format!(
                "{} had {} unlabeled retrieveUserQuota bucket(s); applied as a shared five-hour and weekly quota",
                family_name(family).1,
                unknown.len()
            ));
        }

        if five_hour.contributors == 0 {
            five_hour = aggregate_lane(
                available
                    .iter()
                    .filter(|bucket| bucket.family == family && bucket.source == QuotaSource::AvailableModels),
            );
            if five_hour.contributors > 0 {
                diagnostics.push(format!(
                    "{} five-hour lane filled from fetchAvailableModels",
                    family_name(family).1
                ));
            }
        }

        if weekly.contributors == 0 {
            let unknown_count = user
                .iter()
                .filter(|bucket| bucket.family == family && bucket.window == QuotaWindow::Unknown)
                .count();
            diagnostics.push(if unknown_count > 0 {
                format!(
                    "{} weekly unavailable: {} quota bucket(s) had unrecognized window metadata",
                    family_name(family).1,
                    unknown_count
                )
            } else {
                format!(
                    "{} weekly unavailable: no weekly bucket returned",
                    family_name(family).1
                )
            });
        }

        quotas.push(build_pool(family, five_hour, weekly));
    }

    AntigravityQuotaAggregation { quotas, diagnostics }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn observed_at() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 7, 21, 7, 0, 0).unwrap()
    }

    #[test]
    fn grouped_payload_emits_two_pools() {
        let value = serde_json::json!({
            "response": {"groups": [
                {"displayName": "Gemini Models", "buckets": [
                    {"bucketId": "5h", "remainingFraction": 0.8, "windowMinutes": 300},
                    {"bucketId": "weekly", "remainingFraction": 0.4, "windowMinutes": 10080}
                ]},
                {"displayName": "Claude and GPT Models", "buckets": [
                    {"bucketId": "5h", "remainingFraction": 0.6, "windowSeconds": 18000},
                    {"bucketId": "weekly", "remainingFraction": 0.3, "limit_window_seconds": 604800}
                ]}
            ]}
        });
        let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
        assert_eq!(result.quotas.len(), 2);
        assert_eq!(result.quotas[0].display_name, "Gemini Models");
        assert_eq!(result.quotas[0].weekly_percent, Some(40));
        assert_eq!(result.quotas[1].display_name, "Claude and GPT Models");
        assert_eq!(result.quotas[1].weekly_percent, Some(30));
    }

    #[test]
    fn weekly_window_from_10080_minutes() {
        let value = serde_json::json!({"modelBuckets": [
            {"modelId": "gemini-3-pro", "remainingFraction": 0.25, "windowMinutes": 10080}
        ]});
        let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
        assert_eq!(result.quotas[0].weekly_percent, Some(25));
        assert_eq!(result.quotas[0].five_hour_percent, None);
    }

    #[test]
    fn unknown_single_bucket_populates_shared_weekly_lane() {
        let value = serde_json::json!({"modelBuckets": [
            {"modelId": "gemini-3-pro", "remainingFraction": 0.75}
        ]});
        let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
        assert_eq!(result.quotas[0].five_hour_percent, Some(75));
        assert_eq!(result.quotas[0].weekly_percent, Some(75));
    }


    #[test]
    fn multiple_unknown_verified_buckets_override_available_full_values() {
        let available = serde_json::json!({"models": {
            "gemini-3-pro": {"quotaInfo": {"remainingFraction": 1.0}},
            "gemini-3-flash": {"quotaInfo": {"remainingFraction": 1.0}}
        }});
        let verified = serde_json::json!({"modelBuckets": [
            {"modelId": "gemini-3-pro", "remainingFraction": 0.7},
            {"modelId": "gemini-3-flash", "remainingFraction": 0.25}
        ]});
        let result = aggregate_antigravity_quotas(
            Some(&available),
            Some(&verified),
            observed_at(),
        );
        assert_eq!(result.quotas[0].five_hour_percent, Some(25));
        assert_eq!(result.quotas[0].weekly_percent, Some(25));
    }

    #[test]
    fn duplicate_models_select_lowest_percentage() {
        let value = serde_json::json!({"modelBuckets": [
            {"modelId": "gemini-3-pro", "remainingFraction": 0.8, "windowMinutes": 300},
            {"modelId": "gemini-3-flash", "remainingFraction": 0.2, "windowMinutes": 300}
        ]});
        let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
        assert_eq!(result.quotas[0].five_hour_percent, Some(20));
    }

    #[test]
    fn reset_time_can_infer_weekly_window() {
        let value = serde_json::json!({"modelBuckets": [
            {"modelId": "claude-sonnet", "remainingFraction": 0.5, "resetTime": "2026-07-27T07:00:00Z"}
        ]});
        let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
        assert_eq!(result.quotas[0].weekly_percent, Some(50));
    }

    #[test]
    fn unknown_models_are_excluded() {
        let value = serde_json::json!({"modelBuckets": [
            {"modelId": "mystery-model", "remainingFraction": 0.5, "windowMinutes": 300}
        ]});
        let result = aggregate_antigravity_quotas(None, Some(&value), observed_at());
        assert!(result.quotas.is_empty());
    }
}
