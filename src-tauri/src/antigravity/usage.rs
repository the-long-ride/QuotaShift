// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1

use crate::antigravity_quota::aggregate_antigravity_quotas;
use crate::antigravity_remote::AntigravityRemoteClient;
use crate::antigravity_token::{ensure_access_token, AccessTokenInput};
use crate::types::{
    AntigravityAccountUsage, AntigravityModelQuota, AntigravityQuotaAccuracy,
    AntigravityUsageCommandError, AntigravityUsageSource, AntigravityUsageWarning,
};
use chrono::Utc;
use serde_json::Value;

pub(crate) mod parser;
pub(crate) use parser::*;

const SUMMARY_GEMINI_FIVE_HOUR: &str = "gemini-5h";
const SUMMARY_GEMINI_WEEKLY: &str = "gemini-weekly";
const SUMMARY_THIRD_PARTY_FIVE_HOUR: &str = "3p-5h";
const SUMMARY_THIRD_PARTY_WEEKLY: &str = "3p-weekly";

fn is_argon_text(text: &str) -> bool {
    crate::antigravity_quota::family_from_text(text)
        == Some(crate::antigravity_quota::QuotaFamily::Argon)
}

fn bucket_is_argon(group_is_argon: bool, bucket: &Value, bucket_id: &str) -> bool {
    if is_argon_text(bucket_id) {
        return true;
    }
    for key in [
        "displayName",
        "display_name",
        "modelId",
        "model_id",
        "description",
        "desc",
    ] {
        if bucket
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(is_argon_text)
        {
            return true;
        }
    }
    group_is_argon
        && (bucket.get("remainingFraction").is_some()
            || bucket.get("remaining_fraction").is_some()
            || bucket.pointer("/remaining/remainingFraction").is_some()
            || bucket.pointer("/remaining/remaining_fraction").is_some()
            || bucket.get("window").is_some()
            || bucket.get("resetTime").is_some()
            || bucket.get("reset_time").is_some())
}

fn sanitize_authoritative_quota_summary(value: &Value) -> Option<Value> {
    let groups = value
        .pointer("/response/groups")
        .or_else(|| value.get("groups"))
        .and_then(Value::as_array)?;

    let mut gemini = Vec::new();
    let mut third_party = Vec::new();
    let mut argon = Vec::new();

    for group in groups {
        let Some(buckets) = group.get("buckets").and_then(Value::as_array) else {
            continue;
        };
        let group_name = group
            .get("displayName")
            .or_else(|| group.get("display_name"))
            .or_else(|| group.get("label"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let group_desc = group
            .get("description")
            .or_else(|| group.get("desc"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let group_is_argon = if !group_name.is_empty() {
            is_argon_text(group_name)
        } else {
            is_argon_text(group_desc)
        };
        for bucket in buckets {
            let bucket_id = bucket
                .get("bucketId")
                .or_else(|| bucket.get("bucket_id"))
                .and_then(Value::as_str)
                .unwrap_or("");
            match bucket_id {
                SUMMARY_GEMINI_FIVE_HOUR | SUMMARY_GEMINI_WEEKLY => {
                    gemini.push(bucket.clone());
                }
                SUMMARY_THIRD_PARTY_FIVE_HOUR | SUMMARY_THIRD_PARTY_WEEKLY => {
                    third_party.push(bucket.clone());
                }
                _ if bucket_is_argon(group_is_argon, bucket, bucket_id) => {
                    argon.push(bucket.clone());
                }
                _ => {}
            }
        }
    }

    let mut out_groups = vec![
        serde_json::json!({
            "displayName": "Gemini Models",
            "buckets": gemini,
        }),
        serde_json::json!({
            "displayName": "Claude & OpenAI Models",
            "buckets": third_party,
        }),
    ];
    if !argon.is_empty() {
        out_groups.push(serde_json::json!({
            "displayName": "Gemini 4 Argon",
            "buckets": argon,
        }));
    }

    Some(serde_json::json!({ "groups": out_groups }))
}

struct FetchedUsagePayload {
    plan_tier: Option<String>,
    quotas: Vec<AntigravityModelQuota>,
    warnings: Vec<AntigravityUsageWarning>,
    accuracy: AntigravityQuotaAccuracy,
    premium_models: Option<Vec<String>>,
}

async fn fetch_usage_with_token(
    remote: &AntigravityRemoteClient,
    access_token: &str,
) -> Result<FetchedUsagePayload, AntigravityUsageCommandError> {
    let load_response = remote.load_code_assist(access_token).await?;
    let project_id = extract_project_id(&load_response);
    let plan_tier = resolve_plan_tier(&load_response);
    let observed_at = Utc::now();

    if let Some(raw_summary) = remote
        .retrieve_user_quota_summary(access_token, project_id.as_deref())
        .await?
    {
        if let Some(summary) = sanitize_authoritative_quota_summary(&raw_summary) {
            // Quota summaries can retain buckets for models no longer offered.
            // A failed catalog request leaves the authoritative summary usable.
            let models_response = remote
                .fetch_available_models(access_token, project_id.as_deref())
                .await
                .ok();
            let premium_models = models_response
                .as_ref()
                .and_then(crate::antigravity_quota::extract_premium_models);
            let plan_tier = crate::antigravity_quota::enrich_pro_plus_plan_tier(
                plan_tier,
                premium_models.as_deref(),
                Some(&raw_summary),
            );
            let aggregation =
                aggregate_antigravity_quotas(models_response.as_ref(), Some(&summary), observed_at);
            let weekly_available = aggregation
                .quotas
                .iter()
                .any(|quota| quota.weekly_percent.is_some());
            let mut warnings = Vec::new();
            if aggregation.quotas.is_empty() {
                warnings.push(AntigravityUsageWarning::NoQuotaModelsReturned);
            }
            if !weekly_available {
                warnings.push(AntigravityUsageWarning::WeeklyQuotaUnavailable);
            }
            crate::log_eprintln!(
                "{}",
                format_quota_summary_log(
                    remote.diagnostic_identity(),
                    aggregation.quotas.len(),
                    weekly_available,
                    aggregation.diagnostics.first().map(String::as_str),
                )
            );
            return Ok(FetchedUsagePayload {
                plan_tier,
                quotas: aggregation.quotas,
                warnings,
                accuracy: AntigravityQuotaAccuracy::ExactGrouped,
                premium_models,
            });
        }
    }

    let models_response = remote
        .fetch_available_models(access_token, project_id.as_deref())
        .await?;
    let premium_models = crate::antigravity_quota::extract_premium_models(&models_response);
    let plan_tier = crate::antigravity_quota::enrich_pro_plus_plan_tier(
        plan_tier,
        premium_models.as_deref(),
        None,
    );

    let (primary_quotas, mut warnings) = match normalize_available_models(&models_response) {
        Ok(result) => result,
        Err(_) => (Vec::new(), vec![AntigravityUsageWarning::SomeModelsSkipped]),
    };
    let suspicious_full = should_verify_full_quotas(&primary_quotas);
    let aggregation = aggregate_antigravity_quotas(Some(&models_response), None, observed_at);
    let weekly_available = aggregation
        .quotas
        .iter()
        .any(|quota| quota.weekly_percent.is_some());
    crate::log_eprintln!(
        "{}",
        format_quota_summary_log(
            remote.diagnostic_identity(),
            aggregation.quotas.len(),
            weekly_available,
            aggregation.diagnostics.first().map(String::as_str),
        )
    );

    if suspicious_full {
        warnings.push(AntigravityUsageWarning::UnverifiedFullQuotaResponse);
    }
    if aggregation.quotas.is_empty() {
        warnings.push(AntigravityUsageWarning::NoQuotaModelsReturned);
    }
    if !weekly_available {
        warnings.push(AntigravityUsageWarning::WeeklyQuotaUnavailable);
    }

    Ok(FetchedUsagePayload {
        plan_tier,
        quotas: aggregation.quotas,
        warnings,
        accuracy: AntigravityQuotaAccuracy::SessionOnly,
        premium_models,
    })
}

pub(crate) async fn fetch_account_usage(
    remote: &AntigravityRemoteClient,
    token_input: AccessTokenInput,
) -> Result<AntigravityAccountUsage, AntigravityUsageCommandError> {
    let (mut active_token, mut refreshed_tokens) = ensure_access_token(&token_input, false).await?;

    let payload = match fetch_usage_with_token(remote, &active_token).await {
        Ok(result) => result,
        Err(error) if error.code == "ANTIGRAVITY_REAUTH_REQUIRED" => {
            let (new_token, new_refreshed_tokens) = ensure_access_token(&token_input, true).await?;
            active_token = new_token;
            refreshed_tokens = new_refreshed_tokens;
            fetch_usage_with_token(remote, &active_token).await?
        }
        Err(error) => return Err(error),
    };

    Ok(AntigravityAccountUsage {
        plan_tier: payload.plan_tier,
        quotas: payload.quotas,
        source: AntigravityUsageSource::CloudCode,
        accuracy: payload.accuracy,
        fetched_at: Utc::now().to_rfc3339(),
        warnings: payload.warnings,
        refreshed_tokens,
        premium_models: payload.premium_models,
    })
}

#[tauri::command]
pub(crate) async fn fetch_antigravity_account_usage(
    access_token: String,
    refresh_token: Option<String>,
    auth_method: Option<String>,
    email: Option<String>,
) -> Result<AntigravityAccountUsage, AntigravityUsageCommandError> {
    let remote = AntigravityRemoteClient::production()?.with_diagnostic_email(email.as_deref());
    let token_input = AccessTokenInput {
        access_token,
        refresh_token,
        auth_method,
    };
    fetch_account_usage(&remote, token_input).await
}

#[cfg(test)]
mod tests;
