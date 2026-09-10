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

#[path = "antigravity_usage_parser.rs"]
pub(crate) mod parser;
pub(crate) use parser::*;

const SUMMARY_GEMINI_FIVE_HOUR: &str = "gemini-5h";
const SUMMARY_GEMINI_WEEKLY: &str = "gemini-weekly";
const SUMMARY_THIRD_PARTY_FIVE_HOUR: &str = "3p-5h";
const SUMMARY_THIRD_PARTY_WEEKLY: &str = "3p-weekly";

/// Convert only the four documented Antigravity pool buckets into the existing
/// grouped quota shape. Presence of a `groups` array means the summary endpoint
/// answered authoritatively, even when none of its buckets are usable. Unknown
/// future buckets are deliberately ignored instead of being guessed into a pool.
fn sanitize_authoritative_quota_summary(value: &Value) -> Option<Value> {
    let groups = value
        .pointer("/response/groups")
        .or_else(|| value.get("groups"))
        .and_then(Value::as_array)?;

    let mut gemini = Vec::new();
    let mut third_party = Vec::new();

    for group in groups {
        let Some(buckets) = group.get("buckets").and_then(Value::as_array) else {
            continue;
        };
        for bucket in buckets {
            let Some(bucket_id) = bucket
                .get("bucketId")
                .or_else(|| bucket.get("bucket_id"))
                .and_then(Value::as_str)
            else {
                continue;
            };
            match bucket_id {
                SUMMARY_GEMINI_FIVE_HOUR | SUMMARY_GEMINI_WEEKLY => {
                    gemini.push(bucket.clone());
                }
                SUMMARY_THIRD_PARTY_FIVE_HOUR | SUMMARY_THIRD_PARTY_WEEKLY => {
                    third_party.push(bucket.clone());
                }
                _ => {}
            }
        }
    }

    Some(serde_json::json!({
        "groups": [
            {
                "displayName": "Gemini Models",
                "buckets": gemini,
            },
            {
                "displayName": "Claude & OpenAI Models",
                "buckets": third_party,
            }
        ]
    }))
}

async fn fetch_usage_with_token(
    remote: &AntigravityRemoteClient,
    access_token: &str,
) -> Result<
    (
        Option<String>,
        Vec<AntigravityModelQuota>,
        Vec<AntigravityUsageWarning>,
        AntigravityQuotaAccuracy,
    ),
    AntigravityUsageCommandError,
> {
    let load_response = remote.load_code_assist(access_token).await?;
    let project_id = extract_project_id(&load_response);
    let plan_tier = resolve_plan_tier(&load_response);
    let observed_at = Utc::now();

    // Current Antigravity builds expose merged Gemini and third-party quota
    // pools through retrieveUserQuotaSummary. It is the only remote source that
    // can independently report both rolling five-hour and weekly windows.
    if let Some(raw_summary) = remote.retrieve_user_quota_summary(access_token).await? {
        if let Some(summary) = sanitize_authoritative_quota_summary(&raw_summary) {
            let aggregation =
                aggregate_antigravity_quotas(None, Some(&summary), observed_at);
            for diagnostic in &aggregation.diagnostics {
                eprintln!("[antigravity_quota] summary {diagnostic}");
            }

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
            eprintln!(
                "[antigravity_quota] cloud source=retrieveUserQuotaSummary pools={} weekly_available={}",
                aggregation.quotas.len(),
                weekly_available
            );
            return Ok((
                plan_tier,
                aggregation.quotas,
                warnings,
                AntigravityQuotaAccuracy::ExactGrouped,
            ));
        }
    }

    // Older builds/accounts may not expose the grouped summary. Fall back to
    // the model catalog for current/five-hour quota only; never manufacture a
    // weekly lane from its single quotaInfo value.
    let models_response = remote
        .fetch_available_models(access_token, project_id.as_deref())
        .await?;

    let (primary_quotas, mut warnings) = match normalize_available_models(&models_response) {
        Ok(result) => result,
        Err(_) => (Vec::new(), vec![AntigravityUsageWarning::SomeModelsSkipped]),
    };
    let suspicious_full = should_verify_full_quotas(&primary_quotas);
    let aggregation = aggregate_antigravity_quotas(Some(&models_response), None, observed_at);
    for diagnostic in &aggregation.diagnostics {
        eprintln!("[antigravity_quota] {diagnostic}");
    }

    let weekly_available = aggregation
        .quotas
        .iter()
        .any(|quota| quota.weekly_percent.is_some());
    eprintln!(
        "[antigravity_quota] cloud source=fetchAvailableModels project_present={} raw_models={} pools={} weekly_available={}",
        project_id.is_some(),
        primary_quotas.len(),
        aggregation.quotas.len(),
        weekly_available
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

    Ok((
        plan_tier,
        aggregation.quotas,
        warnings,
        AntigravityQuotaAccuracy::SessionOnly,
    ))
}

pub(crate) async fn fetch_account_usage(
    remote: &AntigravityRemoteClient,
    token_input: AccessTokenInput,
) -> Result<AntigravityAccountUsage, AntigravityUsageCommandError> {
    let (mut active_token, mut refreshed_tokens) = ensure_access_token(&token_input, false).await?;

    let result = match fetch_usage_with_token(remote, &active_token).await {
        Ok(result) => result,
        Err(error) if error.code == "ANTIGRAVITY_REAUTH_REQUIRED" => {
            let (new_token, new_refreshed_tokens) = ensure_access_token(&token_input, true).await?;
            active_token = new_token;
            refreshed_tokens = new_refreshed_tokens;
            fetch_usage_with_token(remote, &active_token).await?
        }
        Err(error) => return Err(error),
    };

    let (plan_tier, quotas, warnings, accuracy) = result;
    Ok(AntigravityAccountUsage {
        plan_tier,
        quotas,
        source: AntigravityUsageSource::CloudCode,
        accuracy,
        fetched_at: Utc::now().to_rfc3339(),
        warnings,
        refreshed_tokens,
    })
}

#[tauri::command]
pub(crate) async fn fetch_antigravity_account_usage(
    access_token: String,
    refresh_token: Option<String>,
    auth_method: Option<String>,
) -> Result<AntigravityAccountUsage, AntigravityUsageCommandError> {
    let remote = AntigravityRemoteClient::production()?;
    let token_input = AccessTokenInput {
        access_token,
        refresh_token,
        auth_method,
    };
    fetch_account_usage(&remote, token_input).await
}

#[cfg(test)]
#[path = "antigravity_usage_test.rs"]
mod tests;
