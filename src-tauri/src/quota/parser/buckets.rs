#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BucketWindow {
    FiveHour,
    Weekly,
    Unknown,
}

pub fn extract_window_seconds(value: &serde_json::Value) -> Option<u64> {
    value
        .get("limitWindowSeconds")
        .or_else(|| value.get("limit_window_seconds"))
        .or_else(|| value.get("windowSeconds"))
        .or_else(|| value.get("window_seconds"))
        .or_else(|| value.get("durationSeconds"))
        .or_else(|| value.get("duration_seconds"))
        .and_then(|v| {
            v.as_u64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .or_else(|| {
            value
                .get("windowMinutes")
                .or_else(|| value.get("window_minutes"))
                .and_then(|v| {
                    v.as_u64()
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                })
                .map(|minutes| minutes.saturating_mul(60))
        })
}

pub fn classify_bucket_window(
    window: &str,
    bucket_id: &str,
    description: &str,
    duration_seconds: Option<u64>,
) -> BucketWindow {
    let text = format!("{} {} {}", window, bucket_id, description).to_lowercase();
    if text.contains("weekly")
        || text.contains("week")
        || text.contains("7d")
        || text.contains("10080")
    {
        return BucketWindow::Weekly;
    }
    if text.contains("5h")
        || text.contains("five_hour")
        || text.contains("fivehour")
        || text.contains("session")
    {
        return BucketWindow::FiveHour;
    }
    if let Some(seconds) = duration_seconds {
        if (seconds as i64 - 604_800).abs() <= 3_600 {
            return BucketWindow::Weekly;
        }
        if (seconds as i64 - 18_000).abs() <= 1_800 {
            return BucketWindow::FiveHour;
        }
    }
    BucketWindow::Unknown
}

pub fn should_replace_lane(
    current: Option<u32>,
    current_reset: Option<&str>,
    candidate: u32,
    candidate_reset: &str,
) -> bool {
    match current {
        None => true,
        Some(existing) if candidate < existing => true,
        Some(existing) if candidate == existing => {
            let old = current_reset.unwrap_or("");
            !candidate_reset.is_empty() && candidate_reset > old
        }
        _ => false,
    }
}

#[derive(Debug, Clone)]
pub struct ParsedBucket {
    pub bucket_id: String,
    pub window: String,
    pub description: String,
    pub remaining_fraction: Option<f64>,
    pub reset_time: String,
    pub disabled: bool,
    pub duration_seconds: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ParsedGroup {
    pub display_name: String,
    pub description: String,
    pub buckets: Vec<ParsedBucket>,
}

pub fn parse_groups_and_model_buckets(quota_summary: &serde_json::Value) -> Vec<ParsedGroup> {
    let mut groups = Vec::new();
    let groups_arr_opt = quota_summary
        .pointer("/response/groups")
        .or_else(|| quota_summary.get("groups"))
        .and_then(|v| v.as_array());

    if let Some(groups_arr) = groups_arr_opt {
        for g in groups_arr {
            let group_name = g
                .get("displayName")
                .or_else(|| g.get("display_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let desc = g
                .get("description")
                .or_else(|| g.get("desc"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut buckets = Vec::new();
            if let Some(buckets_arr) = g.get("buckets").and_then(|v| v.as_array()) {
                for b in buckets_arr {
                    let bucket_id = b
                        .get("bucketId")
                        .or_else(|| b.get("bucket_id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let win = b
                        .get("window")
                        .or_else(|| b.get("windowType"))
                        .or_else(|| b.get("window_type"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let bucket_desc = b
                        .get("description")
                        .or_else(|| b.get("desc"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let remaining = b
                        .pointer("/remaining/remainingFraction")
                        .or_else(|| b.pointer("/remaining/remaining_fraction"))
                        .or_else(|| b.get("remainingFraction"))
                        .or_else(|| b.get("remaining_fraction"))
                        .and_then(|v| v.as_f64());
                    let reset = b
                        .get("resetTime")
                        .or_else(|| b.get("reset_time"))
                        .or_else(|| b.get("resetTimeDescription"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let disabled = b
                        .get("disabled")
                        .or_else(|| b.get("isExhausted"))
                        .or_else(|| b.get("is_exhausted"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let duration_seconds = extract_window_seconds(b);
                    buckets.push(ParsedBucket {
                        bucket_id,
                        window: win,
                        description: bucket_desc,
                        remaining_fraction: remaining,
                        reset_time: reset,
                        disabled,
                        duration_seconds,
                    });
                }
            }
            groups.push(ParsedGroup {
                display_name: group_name,
                description: desc,
                buckets,
            });
        }
    }

    if groups.is_empty() {
        let mb_arr_opt = quota_summary
            .pointer("/response/modelBuckets")
            .or_else(|| quota_summary.get("modelBuckets"))
            .and_then(|v| v.as_array());

        if let Some(mb_arr) = mb_arr_opt {
            let mut gemini_buckets: Vec<ParsedBucket> = Vec::new();
            let mut claude_gpt_buckets: Vec<ParsedBucket> = Vec::new();
            for mb in mb_arr {
                let model_id = mb
                    .get("modelId")
                    .or_else(|| mb.get("model_id"))
                    .or_else(|| mb.get("bucketId"))
                    .or_else(|| mb.get("bucket_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let remaining = mb
                    .pointer("/remaining/remainingFraction")
                    .or_else(|| mb.pointer("/remaining/remaining_fraction"))
                    .or_else(|| mb.get("remainingFraction"))
                    .or_else(|| mb.get("remaining_fraction"))
                    .and_then(|v| v.as_f64());
                let reset = mb
                    .get("resetTime")
                    .or_else(|| mb.get("reset_time"))
                    .or_else(|| mb.get("resetTimeDescription"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let disabled = mb
                    .get("disabled")
                    .or_else(|| mb.get("isExhausted"))
                    .or_else(|| mb.get("is_exhausted"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let window = mb
                    .get("window")
                    .or_else(|| mb.get("windowType"))
                    .or_else(|| mb.get("window_type"))
                    .or_else(|| mb.get("quotaWindow"))
                    .or_else(|| mb.get("quota_window"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let bucket_desc = mb
                    .get("description")
                    .or_else(|| mb.get("desc"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let duration_seconds = extract_window_seconds(mb);
                let bucket = ParsedBucket {
                    bucket_id: model_id.clone(),
                    window,
                    description: bucket_desc,
                    remaining_fraction: remaining,
                    reset_time: reset,
                    disabled,
                    duration_seconds,
                };

                let model_id_lower = model_id.to_lowercase();
                if model_id_lower.contains("gemini") {
                    gemini_buckets.push(bucket.clone());
                } else if model_id_lower.contains("claude")
                    || model_id_lower.contains("gpt")
                    || model_id_lower.contains("openai")
                {
                    claude_gpt_buckets.push(bucket);
                }
            }
            if !gemini_buckets.is_empty() {
                groups.push(ParsedGroup {
                    display_name: "Gemini Models".into(),
                    description: String::new(),
                    buckets: gemini_buckets,
                });
            }
            if !claude_gpt_buckets.is_empty() {
                groups.push(ParsedGroup {
                    display_name: "Claude & OpenAI Models".into(),
                    description: String::new(),
                    buckets: claude_gpt_buckets,
                });
            }
        }
    }

    groups
}
