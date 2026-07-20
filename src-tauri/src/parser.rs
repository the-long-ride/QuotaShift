use crate::types::{FullStatus, QuotaData, CreditInfo};
use crate::get_state;

pub(crate) fn build_status_from_models_response(
    models_resp: serde_json::Value,
    plan_info: Option<&serde_json::Value>,
) -> serde_json::Value {
    let mut client_model_configs = Vec::new();
    if let Some(models_map) = models_resp.get("models").and_then(|v| v.as_object()) {
        for (model_name, model_info) in models_map {
            let quota_info = model_info.get("quotaInfo").cloned().unwrap_or(serde_json::Value::Null);
            client_model_configs.push(serde_json::json!({
                "label": model_name,
                "modelId": model_name,
                "quotaInfo": quota_info,
                "displayName": model_info.get("displayName"),
            }));
        }
    }

    // Cloud-driven plan info comes from the loadCodeAssist response.
    // Prefer planInfo.planType (matches CodexBar's resolvePlan()).
    let plan_name = plan_info
        .and_then(|pi| pi.get("planType"))
        .and_then(|v| v.as_str())
        .map(|s| resolve_plan_name(s).to_string())
        .or_else(|| {
            let tier = models_resp.get("paidTier")
                .or_else(|| models_resp.get("currentTier"));
            let id = tier.and_then(|t| t.get("id")).and_then(|v| v.as_str());
            let name = tier.and_then(|t| t.get("name")).and_then(|v| v.as_str());
            let derived = match id {
                Some("standard-tier") => Some("Paid".to_string()),
                Some("free-tier") => Some("Free".to_string()),
                Some("legacy-tier") => Some("Legacy".to_string()),
                Some("advanced-tier") => Some("Google AI Pro".to_string()),
                _ => id.map(|tid| resolve_plan_name(tid).to_string()),
            };
            derived.or_else(|| name.map(|s| resolve_plan_name(&s).to_string()))
        });

    fn resolve_plan_name(raw: &str) -> &str {
        match raw {
            "free-tier" | "free" => "Free",
            "standard-tier" | "standard" => "Paid",
            "legacy-tier" | "legacy" => "Legacy",
            "advanced-tier" | "advanced" | "google_ai_pro" | "google-ai-pro" | "ai-pro" => "Google AI Pro",
            "ultra-tier" | "ultra" | "google_ai_ultra" | "google-ai-ultra" | "ai-ultra" => "Google AI Ultra",
            s => s,
        }
    }

    serde_json::json!({
        "userStatus": {
            "userTier": {
                "name": plan_name
            },
            "planInfo": plan_info.cloned().unwrap_or(serde_json::Value::Null),
            "cascadeModelConfigData": {
                "clientModelConfigs": client_model_configs
            },
            "userInfo": {
                "email": null,
                "creditInfo": null
            }
        }
    })
}

pub(crate) fn parse_full_status(raw: serde_json::Value, quota_summary: serde_json::Value) -> Result<FullStatus, String> {
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

    #[derive(Debug, Clone)]
    struct ParsedBucket {
        window: String,
        remaining_fraction: f64,
        reset_time: String,
        disabled: bool,
    }

    #[derive(Debug, Clone)]
    struct ParsedGroup {
        display_name: String,
        description: String,
        buckets: Vec<ParsedBucket>,
    }

    let mut groups = Vec::new();
    if let Some(groups_arr) = quota_summary.pointer("/response/groups").and_then(|v| v.as_array()) {
        for g in groups_arr {
            let group_name = g.get("displayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let desc = g.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut buckets = Vec::new();
            if let Some(buckets_arr) = g.get("buckets").and_then(|v| v.as_array()) {
                for b in buckets_arr {
                    let win = b.get("window").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let remaining = b.get("remainingFraction").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let reset = b.get("resetTime").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let disabled = b.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
                    buckets.push(ParsedBucket { window: win, remaining_fraction: remaining, reset_time: reset, disabled });
                }
            }
            groups.push(ParsedGroup { display_name: group_name, description: desc, buckets });
        }
    }

    // Cloud retrieveUserQuota returns flat modelBuckets (not grouped).
    // Aggregate per-model buckets into Gemini / Claude+GPT groups.
    if groups.is_empty() {
        if let Some(mb_arr) = quota_summary.pointer("/response/modelBuckets").and_then(|v| v.as_array()) {
            let mut gemini_buckets: Vec<ParsedBucket> = Vec::new();
            let mut claude_gpt_buckets: Vec<ParsedBucket> = Vec::new();
            for mb in mb_arr {
                let model_id = mb.get("modelId").or_else(|| mb.get("bucketId"))
                    .and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                let remaining = mb.get("remainingFraction").and_then(|v| v.as_f64()).unwrap_or(1.0);
                let reset = mb.get("resetTime").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let disabled = mb.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
                let window = mb.get("window")
                    .or_else(|| mb.get("windowType"))
                    .or_else(|| mb.get("quotaWindow"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let bucket = ParsedBucket { window, remaining_fraction: remaining, reset_time: reset, disabled };

                if model_id.contains("gemini") {
                    gemini_buckets.push(bucket.clone());
                } else if model_id.contains("claude") || model_id.contains("gpt") || model_id.contains("openai") {
                    claude_gpt_buckets.push(bucket);
                }
            }
            if !gemini_buckets.is_empty() {
                groups.push(ParsedGroup { display_name: "Gemini Models".into(), description: String::new(), buckets: gemini_buckets });
            }
            if !claude_gpt_buckets.is_empty() {
                groups.push(ParsedGroup { display_name: "Claude & OpenAI Models".into(), description: String::new(), buckets: claude_gpt_buckets });
            }
        }
    }

    let mut gemini_pool = QuotaData {
        model: "Google Gemini Models".to_string(),
        percent: 100,
        refresh_time: "Ready".to_string(),
        five_hour_percent: 100,
        five_hour_reset: "".to_string(),
        five_hour_disabled: false,
        weekly_percent: 100,
        weekly_reset: "".to_string(),
        weekly_disabled: false,
    };

    let mut claude_gpt_pool = QuotaData {
        model: "Claude & OpenAI Models".to_string(),
        percent: 100,
        refresh_time: "Ready".to_string(),
        five_hour_percent: 100,
        five_hour_reset: "".to_string(),
        five_hour_disabled: false,
        weekly_percent: 100,
        weekly_reset: "".to_string(),
        weekly_disabled: false,
    };

    let mut found_gemini = false;
    let mut found_claude_gpt = false;

    for g in &groups {
        let name_lower = g.display_name.to_lowercase();
        let desc_lower = g.description.to_lowercase();
        
        let is_gemini = name_lower.contains("gemini") || desc_lower.contains("gemini");
        let is_claude_gpt = name_lower.contains("claude") || name_lower.contains("gpt") || name_lower.contains("openai") ||
                            desc_lower.contains("claude") || desc_lower.contains("gpt") || desc_lower.contains("openai");

        let target_pool: &mut QuotaData = if is_gemini {
            found_gemini = true;
            &mut gemini_pool
        } else if is_claude_gpt {
            found_claude_gpt = true;
            &mut claude_gpt_pool
        } else {
            continue;
        };

        let mut got_5h = false;
        let mut got_weekly = false;
        for b in &g.buckets {
            let pct = (b.remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
            let w = b.window.to_lowercase();
            let is_5h = w == "5h" || w.contains("5h") || w.contains("hour") || w == "five_hour" || w == "fivehour";
            let is_weekly = w == "weekly" || w.contains("week") || w == "wk" || w == "7d" || w.contains("7d");
            if is_5h {
                target_pool.five_hour_percent = pct;
                target_pool.five_hour_reset = b.reset_time.clone();
                target_pool.five_hour_disabled = b.disabled;
                got_5h = true;
            } else if is_weekly {
                target_pool.weekly_percent = pct;
                target_pool.weekly_reset = b.reset_time.clone();
                target_pool.weekly_disabled = b.disabled;
                got_weekly = true;
            } else {
                // Window unknown or empty (cloud retrieveUserQuota doesn't return a window field).
                // The bucket represents the model's overall remaining — apply to whichever
                // windows are still unset so the UI surfaces the real number instead of 100%.
                if !got_5h {
                    target_pool.five_hour_percent = pct;
                    if target_pool.five_hour_reset.is_empty() {
                        target_pool.five_hour_reset = b.reset_time.clone();
                    }
                    if !b.disabled {
                        target_pool.five_hour_disabled = false;
                    }
                }
                if !got_weekly {
                    target_pool.weekly_percent = pct;
                    if target_pool.weekly_reset.is_empty() {
                        target_pool.weekly_reset = b.reset_time.clone();
                    }
                    if !b.disabled {
                        target_pool.weekly_disabled = false;
                    }
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
                let is_claude_gpt = model_lower.contains("claude") || model_lower.contains("gpt") || model_lower.contains("openai");

                if is_gemini && !found_gemini {
                    if let Some(quota_info) = config.get("quotaInfo") {
                        if let Some(fraction) = quota_info.get("remainingFraction").and_then(|v| v.as_f64()) {
                            let pct = (fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                            gemini_pool.five_hour_percent = pct;
                            gemini_pool.weekly_percent = pct;
                        }
                        if let Some(reset_time) = quota_info.get("resetTime").and_then(|v| v.as_str()) {
                            gemini_pool.five_hour_reset = reset_time.to_string();
                            gemini_pool.weekly_reset = reset_time.to_string();
                        }
                    }
                    found_gemini = true;
                } else if is_claude_gpt && !found_claude_gpt {
                    if let Some(quota_info) = config.get("quotaInfo") {
                        if let Some(fraction) = quota_info.get("remainingFraction").and_then(|v| v.as_f64()) {
                            let pct = (fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                            claude_gpt_pool.five_hour_percent = pct;
                            claude_gpt_pool.weekly_percent = pct;
                        }
                        if let Some(reset_time) = quota_info.get("resetTime").and_then(|v| v.as_str()) {
                            claude_gpt_pool.five_hour_reset = reset_time.to_string();
                            claude_gpt_pool.weekly_reset = reset_time.to_string();
                        }
                    }
                    found_claude_gpt = true;
                }
            }
        }
    }

    if gemini_pool.weekly_percent == 0 {
        gemini_pool.five_hour_percent = 0;
    }
    gemini_pool.percent = gemini_pool.five_hour_percent;
    gemini_pool.refresh_time = if gemini_pool.five_hour_disabled {
        "Disabled".to_string()
    } else if gemini_pool.five_hour_reset.is_empty() {
        "Exhausted".to_string()
    } else {
        gemini_pool.five_hour_reset.clone()
    };

    if claude_gpt_pool.weekly_percent == 0 {
        claude_gpt_pool.five_hour_percent = 0;
    }
    claude_gpt_pool.percent = claude_gpt_pool.five_hour_percent;
    claude_gpt_pool.refresh_time = if claude_gpt_pool.five_hour_disabled {
        "Disabled".to_string()
    } else if claude_gpt_pool.five_hour_reset.is_empty() {
        "Exhausted".to_string()
    } else {
        claude_gpt_pool.five_hour_reset.clone()
    };

    let mut quotas = Vec::new();
    quotas.push(gemini_pool);
    quotas.push(claude_gpt_pool);

    quotas.sort_by(|a, b| {
        let cmp = b.percent.cmp(&a.percent);
        if cmp == std::cmp::Ordering::Equal {
            a.model.cmp(&b.model)
        } else {
            cmp
        }
    });

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
    })
}
