use crate::get_state;
use crate::types::{CreditInfo, FullStatus, QuotaData};

pub(crate) mod buckets;
pub(crate) use buckets::*;
// Contract references: classify_bucket_window, remaining_fraction: Option<f64>

pub(crate) mod models;
#[allow(unused_imports)]
pub(crate) use models::*;

pub(crate) fn parse_full_status(
    raw: serde_json::Value,
    quota_summary: serde_json::Value,
) -> Result<FullStatus, String> {
    let mut credits = None;
    let credit_info_raw = raw.pointer("/userStatus/userInfo/creditInfo");
    let alt_credit_info_raw = raw.pointer("/userStatus/userTier/availableCredits/0");
    let src = credit_info_raw.or(alt_credit_info_raw);

    if let Some(s) = src {
        let balance = s
            .get("currentBalance")
            .or(s.get("balance"))
            .or(s.get("creditAmount"))
            .and_then(|v| {
                v.as_f64()
                    .or_else(|| v.as_str().and_then(|st| st.parse::<f64>().ok()))
                    .or_else(|| v.as_i64().map(|i| i as f64))
            })
            .unwrap_or(0.0);
        let credit_type = s
            .get("creditType")
            .or(s.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("UNKNOWN")
            .to_string();
        credits = Some(CreditInfo {
            balance,
            credit_type,
        });
    }

    let plan_tier = raw
        .pointer("/userStatus/userTier/name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let email = raw
        .pointer("/userStatus/userInfo/email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let groups = parse_groups_and_model_buckets(&quota_summary);

    let mut gemini_pool = QuotaData {
        model: "Gemini Models".to_string(),
        percent: 100,
        refresh_time: "Ready".to_string(),
        five_hour_percent: None,
        five_hour_reset: None,
        five_hour_disabled: None,
        weekly_percent: None,
        weekly_reset: None,
        weekly_disabled: None,
    };

    let mut claude_gpt_pool = QuotaData {
        model: "Claude & OpenAI Models".to_string(),
        percent: 100,
        refresh_time: "Ready".to_string(),
        five_hour_percent: None,
        five_hour_reset: None,
        five_hour_disabled: None,
        weekly_percent: None,
        weekly_reset: None,
        weekly_disabled: None,
    };

    let mut found_gemini = false;
    let mut found_claude_gpt = false;

    for g in &groups {
        let name_lower = g.display_name.to_lowercase();
        let desc_lower = g.description.to_lowercase();

        let is_gemini = name_lower.contains("gemini") || desc_lower.contains("gemini");
        let is_claude_gpt = name_lower.contains("claude")
            || name_lower.contains("gpt")
            || name_lower.contains("openai")
            || desc_lower.contains("claude")
            || desc_lower.contains("gpt")
            || desc_lower.contains("openai");

        let target_pool: &mut QuotaData = if is_gemini {
            found_gemini = true;
            &mut gemini_pool
        } else if is_claude_gpt {
            found_claude_gpt = true;
            &mut claude_gpt_pool
        } else {
            continue;
        };

        for bucket in &g.buckets {
            let window = classify_bucket_window(
                &bucket.window,
                &bucket.bucket_id,
                &bucket.description,
                bucket.duration_seconds,
            );
            if window == BucketWindow::Unknown {
                continue;
            }

            let pct = match bucket.remaining_fraction {
                Some(fraction) => (fraction.clamp(0.0, 1.0) * 100.0).round() as u32,
                None if bucket.disabled => 0,
                None => continue,
            };
            let reset = if !bucket.reset_time.is_empty() {
                bucket.reset_time.clone()
            } else {
                bucket.description.clone()
            };

            match window {
                BucketWindow::FiveHour => {
                    if should_replace_lane(
                        target_pool.five_hour_percent,
                        target_pool.five_hour_reset.as_deref(),
                        pct,
                        &reset,
                    ) {
                        target_pool.five_hour_percent = Some(pct);
                        target_pool.five_hour_reset =
                            if reset.is_empty() { None } else { Some(reset) };
                        target_pool.five_hour_disabled = Some(bucket.disabled);
                    }
                }
                BucketWindow::Weekly => {
                    if should_replace_lane(
                        target_pool.weekly_percent,
                        target_pool.weekly_reset.as_deref(),
                        pct,
                        &reset,
                    ) {
                        target_pool.weekly_percent = Some(pct);
                        target_pool.weekly_reset =
                            if reset.is_empty() { None } else { Some(reset) };
                        target_pool.weekly_disabled = Some(bucket.disabled);
                    }
                }
                BucketWindow::Unknown => {
                    unreachable!("unknown windows are filtered before aggregation")
                }
            }
        }
    }

    if !found_gemini || !found_claude_gpt {
        if let Some(configs) = raw
            .pointer("/userStatus/cascadeModelConfigData/clientModelConfigs")
            .and_then(|v| v.as_array())
        {
            for config in configs {
                let label = match config.get("label").and_then(|v| v.as_str()) {
                    Some(l) => l.to_string(),
                    None => continue,
                };
                let model_lower = label.to_lowercase();
                let is_gemini = model_lower.contains("gemini");
                let is_claude_gpt = model_lower.contains("claude")
                    || model_lower.contains("gpt")
                    || model_lower.contains("openai");

                if is_gemini && !found_gemini {
                    if let Some(quota_info) = config.get("quotaInfo") {
                        if let Some(fraction) =
                            quota_info.get("remainingFraction").and_then(|v| v.as_f64())
                        {
                            let pct = (fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                            gemini_pool.five_hour_percent = Some(pct);
                        }
                        if let Some(reset_time) =
                            quota_info.get("resetTime").and_then(|v| v.as_str())
                        {
                            gemini_pool.five_hour_reset = Some(reset_time.to_string());
                        }
                    }
                    found_gemini = true;
                } else if is_claude_gpt && !found_claude_gpt {
                    if let Some(quota_info) = config.get("quotaInfo") {
                        if let Some(fraction) =
                            quota_info.get("remainingFraction").and_then(|v| v.as_f64())
                        {
                            let pct = (fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                            claude_gpt_pool.five_hour_percent = Some(pct);
                        }
                        if let Some(reset_time) =
                            quota_info.get("resetTime").and_then(|v| v.as_str())
                        {
                            claude_gpt_pool.five_hour_reset = Some(reset_time.to_string());
                        }
                    }
                    found_claude_gpt = true;
                }
            }
        }
    }

    gemini_pool.percent = gemini_pool.five_hour_percent.unwrap_or(100);
    gemini_pool.refresh_time = if gemini_pool.five_hour_disabled.unwrap_or(false) {
        "Disabled".to_string()
    } else if gemini_pool
        .five_hour_reset
        .as_deref()
        .unwrap_or("")
        .is_empty()
    {
        "Ready".to_string()
    } else {
        gemini_pool.five_hour_reset.clone().unwrap()
    };

    claude_gpt_pool.percent = claude_gpt_pool.five_hour_percent.unwrap_or(100);
    claude_gpt_pool.refresh_time = if claude_gpt_pool.five_hour_disabled.unwrap_or(false) {
        "Disabled".to_string()
    } else if claude_gpt_pool
        .five_hour_reset
        .as_deref()
        .unwrap_or("")
        .is_empty()
    {
        "Ready".to_string()
    } else {
        claude_gpt_pool.five_hour_reset.clone().unwrap()
    };

    let quotas = vec![gemini_pool, claude_gpt_pool];

    let recently_used_model = quotas.first().map(|q| q.model.clone());

    let monitored_codex = {
        let state = get_state().lock().unwrap();
        state.monitored_codex.clone()
    };

    Ok(FullStatus {
        credits,
        quotas,
        plan_tier,
        recently_used_model,
        monitored_codex,
        email,
        online: true,
        source: None,
        accuracy: None,
    })
}

#[cfg(test)]
mod tests;
