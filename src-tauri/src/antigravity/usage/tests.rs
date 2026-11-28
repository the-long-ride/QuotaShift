use super::*;
use crate::antigravity_quota::enrich_pro_plus_plan_tier;

fn quota(
    model_id: &str,
    display_name: &str,
    remaining_fraction: f64,
    reset_at: Option<&str>,
) -> AntigravityModelQuota {
    AntigravityModelQuota {
        model_id: model_id.to_string(),
        display_name: display_name.to_string(),
        family: classify_family(model_id),
        remaining_fraction,
        remaining_percent: (remaining_fraction.clamp(0.0, 1.0) * 100.0).round() as u32,
        reset_at: reset_at.map(str::to_string),
        five_hour_percent: None,
        five_hour_reset: None,
        five_hour_disabled: None,
        weekly_percent: None,
        weekly_reset: None,
        weekly_disabled: None,
    }
}

#[test]
fn all_full_detection_requires_every_quota_at_or_above_threshold() {
    assert!(!should_verify_full_quotas(&[]));
    assert!(should_verify_full_quotas(&[
        quota("gemini-a", "Gemini A", 0.999, None),
        quota("claude-b", "Claude B", 1.0, None),
    ]));
    assert!(!should_verify_full_quotas(&[
        quota("gemini-a", "Gemini A", 0.998, None),
        quota("claude-b", "Claude B", 1.0, None),
    ]));
}

#[test]
fn quota_summary_keeps_only_known_pool_bucket_ids() {
    let raw = serde_json::json!({
        "groups": [{
            "displayName": "anything",
            "buckets": [
                {"bucketId": "gemini-5h", "remainingFraction": 0.8},
                {"bucketId": "gemini-weekly", "remainingFraction": 0.7},
                {"bucketId": "3p-5h", "remainingFraction": 0.6},
                {"bucketId": "3p-weekly", "remainingFraction": 0.5},
                {"bucketId": "gemini-image-5h", "remainingFraction": 0.1}
            ]
        }]
    });
    let sanitized =
        sanitize_authoritative_quota_summary(&raw).expect("groups should be authoritative");
    let text = sanitized.to_string();
    assert!(text.contains("gemini-5h"));
    assert!(text.contains("gemini-weekly"));
    assert!(text.contains("3p-5h"));
    assert!(text.contains("3p-weekly"));
    assert!(!text.contains("gemini-image-5h"));
}

#[test]
fn empty_quota_summary_is_still_authoritative() {
    let raw = serde_json::json!({"groups": []});
    assert!(sanitize_authoritative_quota_summary(&raw).is_some());
}

#[test]
fn quota_summary_log_is_one_concise_masked_account_result() {
    assert_eq!(
        format_quota_summary_log("fa***@example.com", 2, true, Some("routine parser detail")),
        "[antigravity_quota] fa***@example.com pools=2 weekly_available=true"
    );
}

#[test]
fn degraded_quota_summary_includes_one_actionable_warning_in_same_line() {
    assert_eq!(
        format_quota_summary_log(
            "fa***@example.com",
            2,
            false,
            Some("weekly unavailable: no weekly bucket returned"),
        ),
        "[antigravity_quota] fa***@example.com pools=2 weekly_available=false warning=weekly unavailable: no weekly bucket returned"
    );
}

#[test]
fn quota_summary_preserves_argon_weekly_buckets_and_groups() {
    let raw = serde_json::json!({
        "groups": [
            {
                "displayName": "Gemini Models",
                "buckets": [
                    {"bucketId": "gemini-5h", "remainingFraction": 0.75},
                    {"bucketId": "gemini-weekly", "remainingFraction": 0.86}
                ]
            },
            {
                "displayName": "Claude and GPT models",
                "buckets": [
                    {"bucketId": "3p-5h", "remainingFraction": 1.0},
                    {"bucketId": "3p-weekly", "remainingFraction": 1.0}
                ]
            },
            {
                "displayName": "Gemini 4 Argon",
                "buckets": [
                    {"bucketId": "argon-weekly", "window": "weekly", "remainingFraction": 1.0},
                    {"bucketId": "weekly", "window": "weekly", "remainingFraction": 0.9}
                ]
            }
        ]
    });
    let sanitized =
        sanitize_authoritative_quota_summary(&raw).expect("groups should be authoritative");
    let text = sanitized.to_string();
    assert!(text.contains("argon-weekly"));
    assert!(text.contains("\"remainingFraction\":0.9"));
}

#[test]
fn extract_premium_models_detects_codenames_and_future_gemini_4_plus_only() {
    let available = serde_json::json!({
        "imageGenerationModelIds": ["gemini-4-image"],
        "models": {
            "gemini-3-pro": {"displayName": "Gemini 3 Pro"},
            "claude-sonnet-4-6": {"displayName": "Claude Sonnet 4.6 (Thinking)"},
            "gemini-4-hydrogen": {"displayName": "Gemini 4 Hydrogen"},
            "gemini-4-flash": {"displayName": "Gemini 4 Flash"},
            "gemini-4-lite": {"displayName": "Gemini 4 Lite"},
            "gemini-4-image": {"displayName": "Gemini 4 Image"},
            "chat_neon_internal": {"displayName": "Neon Internal", "isInternal": true},
            "tab_carbon_complete": {"displayName": "Carbon Tab"},
            "gemini-4-argon-high": {"displayName": "Gemini 4 Argon (High)"},
            "gemini-4-argon-low": {"displayName": "Gemini 4 Argon (Low)"},
            "gemini-4-neon": {"displayName": "Gemini 4 Neon (Thinking)"},
            "carbon-reasoning": {"displayName": "Carbon (Medium)"},
            "gemini-4.5-pro": {"displayName": "Gemini 4.5 Pro (High)"},
            "gemini-5-krypton": {"displayName": "Gemini 5 Krypton"}
        }
    });

    let models = crate::antigravity_quota::extract_premium_models(&available)
        .expect("valid models catalog should yield Some");
    assert_eq!(
        models,
        vec![
            "Carbon",
            "Gemini 4 Argon",
            "Gemini 4 Neon",
            "Gemini 4.5 Pro",
            "Gemini 5 Krypton",
        ]
    );
}

#[test]
fn extract_premium_models_distinguishes_empty_catalog_from_missing_catalog() {
    let empty_catalog = serde_json::json!({
        "models": {
            "gemini-3-pro": {"displayName": "Gemini 3 Pro"},
            "claude-sonnet-4-6": {"displayName": "Claude Sonnet 4.6"}
        }
    });
    assert_eq!(
        crate::antigravity_quota::extract_premium_models(&empty_catalog),
        Some(Vec::new())
    );
    assert_eq!(
        crate::antigravity_quota::extract_premium_models(&serde_json::json!({})),
        None
    );
}

#[test]
fn enrich_pro_plus_plan_tier_only_upgrades_pro_accounts() {
    let models = vec!["Gemini 4 Neon".to_string()];
    assert_eq!(
        enrich_pro_plus_plan_tier(Some("Google AI Pro".to_string()), Some(&models), None),
        Some("Google AI Pro+".to_string())
    );
    assert_eq!(
        enrich_pro_plus_plan_tier(Some("Google AI Pro".to_string()), Some(&[]), None),
        Some("Google AI Pro".to_string())
    );
    assert_eq!(
        enrich_pro_plus_plan_tier(Some("Google AI Ultra".to_string()), Some(&models), None),
        Some("Google AI Ultra".to_string())
    );
    assert_eq!(
        enrich_pro_plus_plan_tier(Some("Free".to_string()), Some(&models), None),
        Some("Free".to_string())
    );
    assert_eq!(
        enrich_pro_plus_plan_tier(Some("Paid".to_string()), Some(&models), None),
        Some("Paid".to_string())
    );
}

#[test]
fn enrich_pro_plus_falls_back_to_explicit_summary_bucket_only_when_catalog_missing() {
    let explicit_summary = serde_json::json!({
        "groups": [
            {
                "displayName": "Gemini 4 Argon",
                "buckets": [{"bucketId": "argon-weekly", "remainingFraction": 0.8}]
            }
        ]
    });
    let generic_description_summary = serde_json::json!({
        "groups": [
            {
                "displayName": "Gemini Models",
                "description": "Models within this group: Gemini Flash, Gemini 4 Argon",
                "buckets": [{"bucketId": "gemini-5h", "remainingFraction": 0.8}]
            }
        ]
    });

    assert_eq!(
        enrich_pro_plus_plan_tier(
            Some("Google AI Pro".to_string()),
            None,
            Some(&explicit_summary)
        ),
        Some("Google AI Pro+".to_string())
    );
    assert_eq!(
        enrich_pro_plus_plan_tier(
            Some("Google AI Pro".to_string()),
            None,
            Some(&generic_description_summary)
        ),
        Some("Google AI Pro".to_string())
    );
    // Authoritative empty catalog overrides stale summary bucket
    assert_eq!(
        enrich_pro_plus_plan_tier(
            Some("Google AI Pro".to_string()),
            Some(&[]),
            Some(&explicit_summary)
        ),
        Some("Google AI Pro".to_string())
    );
}

#[test]
fn extract_premium_models_honors_agent_model_sorts_quota_info_disabled_and_media_exclusions() {
    // Regular Pro catalog where next-gen models appear in `models` outside `agentModelSorts`
    // plus an image-preview variant that doesn't end with `-image`.
    let regular_pro = serde_json::json!({
        "agentModelSorts": [{
            "displayName": "Recommended",
            "groups": [{
                "modelIds": ["gemini-3.8-flash-high", "claude-sonnet-4-6", "gemini-4-pro-image-preview"]
            }]
        }],
        "models": {
            "gemini-3.8-flash-high": {
                "displayName": "Gemini 3.8 Flash (High)",
                "quotaInfo": {"remainingFraction": 1.0}
            },
            "claude-sonnet-4-6": {
                "displayName": "Claude Sonnet 4.6",
                "quotaInfo": {"remainingFraction": 1.0}
            },
            "gemini-4-pro-image-preview": {
                "displayName": "Gemini 4 Pro Image (Preview)",
                "quotaInfo": {"remainingFraction": 1.0}
            },
            "gemini-4-neon": {
                "displayName": "Gemini 4 Neon (High)",
                "quotaInfo": {"remainingFraction": 1.0}
            },
            "gemini-4-argon-high": {
                "displayName": "Gemini 4 Argon (High)",
                "quotaInfo": {"remainingFraction": 1.0}
            }
        }
    });
    assert_eq!(
        crate::antigravity_quota::extract_premium_models(&regular_pro),
        Some(Vec::new())
    );

    // Without agentModelSorts: skip disabled, recommended: false, and missing quotaInfo when
    // other models carry quotaInfo; still keep exhausted (0% / resetTime-only) entitled models.
    let mixed = serde_json::json!({
        "models": {
            "gemini-3.8-pro": {
                "displayName": "Gemini 3.8 Pro",
                "quotaInfo": {"remainingFraction": 0.9}
            },
            "gemini-4-neon-disabled": {
                "displayName": "Gemini 4 Neon",
                "quotaInfo": {"remainingFraction": 1.0, "disabled": true}
            },
            "gemini-4-carbon-unrecommended": {
                "displayName": "Gemini 4 Carbon",
                "recommended": false,
                "quotaInfo": {"remainingFraction": 1.0}
            },
            "gemini-4-argon-no-quota": {
                "displayName": "Gemini 4 Argon"
            },
            "gemini-4-argon-exhausted": {
                "displayName": "Gemini 4 Argon (High)",
                "quotaInfo": {"resetTime": "2026-11-30T16:16:00Z"}
            }
        }
    });
    assert_eq!(
        crate::antigravity_quota::extract_premium_models(&mixed),
        Some(vec!["Gemini 4 Argon".to_string()])
    );
}
