use chrono::{DateTime, Utc};
use serde_json::Value;

pub const FIVE_HOUR_MIN_SECONDS: f64 = 4.5 * 60.0 * 60.0;
pub const FIVE_HOUR_MAX_SECONDS: f64 = 5.5 * 60.0 * 60.0;
pub const WEEKLY_MIN_SECONDS: f64 = 6.5 * 24.0 * 60.0 * 60.0;
pub const WEEKLY_MAX_SECONDS: f64 = 7.5 * 24.0 * 60.0 * 60.0;
pub const INFERRED_FIVE_HOUR_MAX_SECONDS: i64 = 5 * 60 * 60 + 15 * 60;
pub const INFERRED_WEEKLY_MAX_SECONDS: i64 = 7 * 24 * 60 * 60 + 12 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum QuotaFamily {
    Gemini,
    ClaudeGpt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum QuotaWindow {
    FiveHour,
    Weekly,
    Other,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuotaSource {
    AvailableModels,
    UserQuota,
}

#[derive(Debug, Clone)]
pub struct NormalizedQuotaBucket {
    pub family: QuotaFamily,
    pub remaining_fraction: f64,
    pub reset_time: Option<String>,
    pub window: QuotaWindow,
    pub disabled: bool,
    pub source: QuotaSource,
}

pub fn value_alias<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| value.get(*key))
}

pub fn string_alias(value: &Value, keys: &[&str]) -> Option<String> {
    value_alias(value, keys)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub fn number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_i64().map(|value| value as f64))
        .or_else(|| value.as_u64().map(|value| value as f64))
        .or_else(|| value.as_str().and_then(|value| value.parse::<f64>().ok()))
        .filter(|value| value.is_finite())
}

pub fn reset_is_earlier(candidate: Option<&str>, existing: Option<&str>) -> bool {
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

pub fn duration_seconds_from(entry: &Value) -> Option<f64> {
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
        if let Some(value) = find_alias_number(container, &minute_keys) {
            return Some(value * 60.0);
        }
        if let Some(value) = find_alias_number(container, &second_keys) {
            return Some(value);
        }
        if let Some(value) = find_alias_number(container, &["minutes", "minute"]) {
            return Some(value * 60.0);
        }
        if let Some(value) = find_alias_number(container, &["seconds", "second"]) {
            return Some(value);
        }
    }
    None
}

fn find_alias_number(container: &Value, keys: &[&str]) -> Option<f64> {
    for key in keys {
        if let Some(v) = container.get(*key) {
            if let Some(n) = v
                .as_f64()
                .or_else(|| v.as_i64().map(|i| i as f64))
                .or_else(|| v.as_u64().map(|u| u as f64))
            {
                return Some(n);
            }
            if let Some(s) = v.as_str().and_then(|s| s.parse::<f64>().ok()) {
                return Some(s);
            }
        }
    }
    None
}

pub fn classify_duration(seconds: f64) -> QuotaWindow {
    if (FIVE_HOUR_MIN_SECONDS..=FIVE_HOUR_MAX_SECONDS).contains(&seconds) {
        QuotaWindow::FiveHour
    } else if (WEEKLY_MIN_SECONDS..=WEEKLY_MAX_SECONDS).contains(&seconds) {
        QuotaWindow::Weekly
    } else {
        QuotaWindow::Other
    }
}

pub fn window_text(entry: &Value) -> String {
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
        for key in [
            "window",
            "windowType",
            "window_type",
            "quotaWindow",
            "quota_window",
        ] {
            if let Some(value) = quota_info.get(key).and_then(Value::as_str) {
                parts.push(value);
            }
        }
    }
    parts.join(" ").to_lowercase()
}

pub fn classify_text(text: &str) -> QuotaWindow {
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

pub fn classify_reset(reset_time: Option<&str>, observed_at: &DateTime<Utc>) -> QuotaWindow {
    let Some(reset_time) = reset_time else {
        return QuotaWindow::Unknown;
    };
    let Ok(reset_time) = DateTime::parse_from_rfc3339(reset_time) else {
        return QuotaWindow::Unknown;
    };
    let delta = reset_time
        .with_timezone(&Utc)
        .signed_duration_since(observed_at.clone());
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

pub fn classify_window(
    entry: &Value,
    reset_time: Option<&str>,
    observed_at: &DateTime<Utc>,
) -> QuotaWindow {
    if let Some(seconds) = duration_seconds_from(entry) {
        return classify_duration(seconds);
    }
    let explicit = classify_text(&window_text(entry));
    if explicit != QuotaWindow::Unknown {
        return explicit;
    }

    match classify_reset(reset_time, observed_at) {
        QuotaWindow::Weekly => QuotaWindow::Weekly,
        _ => QuotaWindow::Unknown,
    }
}
