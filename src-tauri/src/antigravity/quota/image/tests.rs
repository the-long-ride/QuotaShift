use super::*;
use serde_json::json;

#[test]
fn declared_image_model_stays_separate_from_gemini_models() {
    let catalog = json!({
        "imageGenerationModelIds": ["gemini-3.1-flash-image"],
        "models": {
            "gemini-3.1-pro": {"quotaInfo": {"remainingFraction": 0.8}},
            "gemini-3.1-flash-image": {
                "quotaInfo": {"remainingFraction": 0.25, "resetTime": "2026-11-20T21:00:00Z"}
            }
        }
    });
    let quota = extract_image_quota(&catalog).unwrap();
    assert_eq!(quota.model_id, "image_generation_pool");
    assert_eq!(quota.remaining_percent, 25);
    assert_eq!(quota.reset_at.as_deref(), Some("2026-11-20T21:00:00Z"));
    assert!(is_image_model(&catalog, "gemini-3.1-flash-image"));
    assert!(!is_image_model(&catalog, "gemini-3.1-pro"));
}

#[test]
fn unknown_or_internal_image_models_do_not_create_fake_quota() {
    let response = json!({
        "imageGenerationModelIds": ["image-private"],
        "models": {"image-private": {"isInternal": true, "quotaInfo": {"remainingFraction": 1.0}}}
    });
    assert!(extract_image_quota(&response).is_none());
    assert!(extract_image_quota(&json!({"models": {"gemini-3-pro": {
        "quotaInfo": {"remainingFraction": 0.8}
    }}})).is_none());
}

#[test]
fn most_restrictive_image_model_is_used() {
    let response = json!({"models": {
        "imagen-4": {"quotaInfo": {"remainingFraction": 0.9}},
        "gemini-3.1-flash-image": {"quotaInfo": {"remainingFraction": 0.1}}
    }});
    assert_eq!(extract_image_quota(&response).unwrap().remaining_percent, 10);
}

#[test]
fn image_models_do_not_modify_gemini_pool_quota() {
    let catalog = json!({
        "imageGenerationModelIds": ["gemini-3.1-flash-image"],
        "models": {
            "gemini-3.1-pro": {"quotaInfo": {"remainingFraction": 0.8}},
            "gemini-3.1-flash-image": {"quotaInfo": {"remainingFraction": 0.2}}
        }
    });
    let aggregation = super::super::aggregate_antigravity_quotas(
        Some(&catalog),
        None,
        chrono::Utc::now(),
    );
    assert_eq!(aggregation.quotas.len(), 2);
    assert_eq!(aggregation.quotas[0].model_id, "gemini_pool");
    assert_eq!(aggregation.quotas[0].five_hour_percent, Some(80));
    assert_eq!(aggregation.quotas[1].model_id, "image_generation_pool");
    assert_eq!(aggregation.quotas[1].remaining_percent, 20);
}

#[test]
fn image_only_catalog_does_not_create_false_gemini_pool() {
    let catalog = json!({
        "models": {
            "imagen-4": {"quotaInfo": {"remainingFraction": 0.6}}
        }
    });
    let aggregation = super::super::aggregate_antigravity_quotas(
        Some(&catalog),
        None,
        chrono::Utc::now(),
    );
    assert_eq!(aggregation.quotas.len(), 1);
    assert_eq!(aggregation.quotas[0].model_id, "image_generation_pool");
}
