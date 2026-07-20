use crate::types::{FullStatus, QuotaData, CreditInfo};
use crate::get_state;

#[allow(dead_code)]
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
        bucket_id: String,
        window: String,
        description: String,
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
    let groups_arr_opt = quota_summary.pointer("/response/groups")
        .or_else(|| quota_summary.get("groups"))
        .and_then(|v| v.as_array());

    if let Some(groups_arr) = groups_arr_opt {
        for g in groups_arr {
            let group_name = g.get("displayName")
                .or_else(|| g.get("display_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let desc = g.get("description")
                .or_else(|| g.get("desc"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut buckets = Vec::new();
            if let Some(buckets_arr) = g.get("buckets").and_then(|v| v.as_array()) {
                for b in buckets_arr {
                    let bucket_id = b.get("bucketId")
                        .or_else(|| b.get("bucket_id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let win = b.get("window")
                        .or_else(|| b.get("windowType"))
                        .or_else(|| b.get("window_type"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let bucket_desc = b.get("description")
                        .or_else(|| b.get("desc"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let remaining = b.pointer("/remaining/remainingFraction")
                        .or_else(|| b.pointer("/remaining/remaining_fraction"))
                        .or_else(|| b.get("remainingFraction"))
                        .or_else(|| b.get("remaining_fraction"))
                        .and_then(|v| v.as_f64())
                        .unwrap_or(1.0);
                    let reset = b.get("resetTime")
                        .or_else(|| b.get("reset_time"))
                        .or_else(|| b.get("resetTimeDescription"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let disabled = b.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
                    buckets.push(ParsedBucket { bucket_id, window: win, description: bucket_desc, remaining_fraction: remaining, reset_time: reset, disabled });
                }
            }
            groups.push(ParsedGroup { display_name: group_name, description: desc, buckets });
        }
    }

    // Cloud retrieveUserQuota returns flat modelBuckets (not grouped).
    // Aggregate per-model buckets into Gemini / Claude+GPT groups.
    if groups.is_empty() {
        let mb_arr_opt = quota_summary.pointer("/response/modelBuckets")
            .or_else(|| quota_summary.get("modelBuckets"))
            .and_then(|v| v.as_array());

        if let Some(mb_arr) = mb_arr_opt {
            let mut gemini_buckets: Vec<ParsedBucket> = Vec::new();
            let mut claude_gpt_buckets: Vec<ParsedBucket> = Vec::new();
            for mb in mb_arr {
                let model_id = mb.get("modelId")
                    .or_else(|| mb.get("model_id"))
                    .or_else(|| mb.get("bucketId"))
                    .or_else(|| mb.get("bucket_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let remaining = mb.pointer("/remaining/remainingFraction")
                    .or_else(|| mb.pointer("/remaining/remaining_fraction"))
                    .or_else(|| mb.get("remainingFraction"))
                    .or_else(|| mb.get("remaining_fraction"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(1.0);
                let reset = mb.get("resetTime")
                    .or_else(|| mb.get("reset_time"))
                    .or_else(|| mb.get("resetTimeDescription"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let disabled = mb.get("disabled").and_then(|v| v.as_bool()).unwrap_or(false);
                let window = mb.get("window")
                    .or_else(|| mb.get("windowType"))
                    .or_else(|| mb.get("window_type"))
                    .or_else(|| mb.get("quotaWindow"))
                    .or_else(|| mb.get("quota_window"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let bucket_desc = mb.get("description")
                    .or_else(|| mb.get("desc"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let bucket = ParsedBucket { bucket_id: model_id.clone(), window, description: bucket_desc, remaining_fraction: remaining, reset_time: reset, disabled };

                let model_id_lower = model_id.to_lowercase();
                if model_id_lower.contains("gemini") {
                    gemini_buckets.push(bucket.clone());
                } else if model_id_lower.contains("claude") || model_id_lower.contains("gpt") || model_id_lower.contains("openai") {
                    claude_gpt_buckets.push(bucket);
                }
            }
            if !gemini_buckets.is_empty() {
                groups.push(ParsedGroup { display_name: "Gemini Models".into(), description: String::new(), buckets: gemini_buckets });
            }
            if !claude_gpt_buckets.is_empty() {
                groups.push(ParsedGroup { display_name: "Claude and GPT Models".into(), description: String::new(), buckets: claude_gpt_buckets });
            }
        }
    }

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
        model: "Claude and GPT Models".to_string(),
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
        let mut shared_unlabeled: Option<(u32, String, bool)> = None;

        for b in &g.buckets {
            let pct = (b.remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
            let reset = if !b.reset_time.is_empty() {
                b.reset_time.clone()
            } else {
                b.description.clone()
            };
            let w = format!("{} {} {}", b.window, b.bucket_id, b.description).to_lowercase();
            let is_5h = w.contains("5h") || w.contains("hour") || w.contains("five_hour") || w.contains("fivehour");
            let is_weekly = w.contains("weekly") || w.contains("week") || w.contains("wk") || w.contains("7d");
            if is_5h {
                if target_pool.five_hour_percent.map_or(true, |current| pct < current) {
                    target_pool.five_hour_percent = Some(pct);
                    target_pool.five_hour_reset = Some(reset);
                    target_pool.five_hour_disabled = Some(b.disabled);
                }
                got_5h = true;
            } else if is_weekly {
                if target_pool.weekly_percent.map_or(true, |current| pct < current) {
                    target_pool.weekly_percent = Some(pct);
                    target_pool.weekly_reset = Some(reset);
                    target_pool.weekly_disabled = Some(b.disabled);
                }
                got_weekly = true;
            } else if shared_unlabeled
                .as_ref()
                .map_or(true, |(current, _, _)| pct < *current)
            {
                shared_unlabeled = Some((pct, reset, b.disabled));
            }
        }

        // retrieveUserQuota commonly returns one unlabeled shared bucket per
        // model. Match QuotaShift's cloud-quota contract by using the most
        // conservative shared value for whichever lane was not explicitly
        // identified, instead of leaving Weekly permanently unavailable.
        if let Some((pct, reset, disabled)) = shared_unlabeled {
            if !got_5h {
                target_pool.five_hour_percent = Some(pct);
                target_pool.five_hour_reset = Some(reset.clone());
                target_pool.five_hour_disabled = Some(disabled);
            }
            if !got_weekly {
                target_pool.weekly_percent = Some(pct);
                target_pool.weekly_reset = Some(reset);
                target_pool.weekly_disabled = Some(disabled);
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
                            gemini_pool.five_hour_percent = Some(pct);
                        }
                        if let Some(reset_time) = quota_info.get("resetTime").and_then(|v| v.as_str()) {
                            gemini_pool.five_hour_reset = Some(reset_time.to_string());
                        }
                    }
                    found_gemini = true;
                } else if is_claude_gpt && !found_claude_gpt {
                    if let Some(quota_info) = config.get("quotaInfo") {
                        if let Some(fraction) = quota_info.get("remainingFraction").and_then(|v| v.as_f64()) {
                            let pct = (fraction.clamp(0.0, 1.0) * 100.0).round() as u32;
                            claude_gpt_pool.five_hour_percent = Some(pct);
                        }
                        if let Some(reset_time) = quota_info.get("resetTime").and_then(|v| v.as_str()) {
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
    } else if gemini_pool.five_hour_reset.as_deref().unwrap_or("").is_empty() {
        "Ready".to_string()
    } else {
        gemini_pool.five_hour_reset.clone().unwrap()
    };

    claude_gpt_pool.percent = claude_gpt_pool.five_hour_percent.unwrap_or(100);
    claude_gpt_pool.refresh_time = if claude_gpt_pool.five_hour_disabled.unwrap_or(false) {
        "Disabled".to_string()
    } else if claude_gpt_pool.five_hour_reset.as_deref().unwrap_or("").is_empty() {
        "Ready".to_string()
    } else {
        claude_gpt_pool.five_hour_reset.clone().unwrap()
    };

    let mut quotas = Vec::new();
    quotas.push(gemini_pool);
    quotas.push(claude_gpt_pool);

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
