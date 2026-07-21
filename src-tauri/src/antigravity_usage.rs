// QUOTASHIFT_QUOTA_OAUTH_MAINTENANCE_V1

use crate::antigravity_quota::aggregate_antigravity_quotas;
use crate::antigravity_remote::AntigravityRemoteClient;
use crate::antigravity_token::{ensure_access_token, AccessTokenInput};
use crate::types::{
    AntigravityAccountUsage, AntigravityModelFamily, AntigravityModelQuota,
    AntigravityUsageCommandError, AntigravityUsageSource, AntigravityUsageWarning,
};
use chrono::Utc;
use serde_json::Value;

pub(crate) fn extract_project_id(value: &Value) -> Option<String> {
    let v = value.get("cloudaicompanionProject")?;
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    if let Some(obj) = v.as_object() {
        if let Some(s) = obj.get("id").and_then(Value::as_str) {
            return Some(s.to_string());
        }
        if let Some(s) = obj.get("projectId").and_then(Value::as_str) {
            return Some(s.to_string());
        }
        if let Some(s) = obj.get("projectID").and_then(Value::as_str) {
            return Some(s.to_string());
        }
    }
    None
}

pub(crate) fn resolve_plan_tier(value: &Value) -> Option<String> {
    let raw = value
        .pointer("/planInfo/planType")
        .or_else(|| value.pointer("/paidTier/name"))
        .or_else(|| value.pointer("/paidTier/id"))
        .or_else(|| value.pointer("/currentTier/name"))
        .or_else(|| value.pointer("/currentTier/id"))
        .and_then(Value::as_str)?;

    let name = match raw.to_lowercase().as_str() {
        "free-tier" | "free" => "Free",
        "standard-tier" | "standard" => "Paid",
        "legacy-tier" | "legacy" => "Legacy",
        "advanced-tier" | "google_ai_pro" | "google-ai-pro" => "Google AI Pro",
        "ultra-tier" | "google_ai_ultra" | "google-ai-ultra" => "Google AI Ultra",
        _ => raw,
    };
    Some(name.to_string())
}

pub(crate) fn classify_family(model_id: &str) -> AntigravityModelFamily {
    let id_lower = model_id.to_lowercase();
    if id_lower.contains("gemini") {
        AntigravityModelFamily::Gemini
    } else if id_lower.contains("claude") {
        AntigravityModelFamily::Claude
    } else if id_lower.contains("gpt")
        || id_lower.contains("openai")
        || id_lower.contains("o1")
        || id_lower.contains("o3")
        || id_lower.contains("o4")
    {
        AntigravityModelFamily::OpenAi
    } else {
        AntigravityModelFamily::Other
    }
}

pub(crate) fn family_priority(family: &AntigravityModelFamily) -> u32 {
    match family {
        AntigravityModelFamily::Gemini => 1,
        AntigravityModelFamily::Claude => 2,
        AntigravityModelFamily::OpenAi => 3,
        AntigravityModelFamily::Other => 4,
    }
}

fn sort_quotas(quotas: &mut [AntigravityModelQuota]) {
    quotas.sort_by(|a, b| {
        family_priority(&a.family)
            .cmp(&family_priority(&b.family))
            .then_with(|| a.display_name.cmp(&b.display_name))
            .then_with(|| a.model_id.cmp(&b.model_id))
    });
}

fn parse_fraction(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .filter(|f| f.is_finite())
        .map(|f| f.clamp(0.0, 1.0))
}

fn read_string_alias<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn build_quota(
    model_id: String,
    display_name: String,
    remaining_fraction: f64,
    reset_at: Option<String>,
) -> AntigravityModelQuota {
    AntigravityModelQuota {
        family: classify_family(&model_id),
        model_id,
        display_name,
        remaining_fraction,
        remaining_percent: (remaining_fraction * 100.0).round() as u32,
        reset_at,
        five_hour_percent: None,
        five_hour_reset: None,
        five_hour_disabled: None,
        weekly_percent: None,
        weekly_reset: None,
        weekly_disabled: None,
    }
}

pub(crate) fn normalize_available_models(
    value: &Value,
) -> Result<(Vec<AntigravityModelQuota>, Vec<AntigravityUsageWarning>), AntigravityUsageCommandError> {
    let models_obj = value
        .get("models")
        .and_then(Value::as_object)
        .ok_or_else(|| AntigravityUsageCommandError {
            code: "ANTIGRAVITY_USAGE_INVALID_RESPONSE".to_string(),
            message: "Missing 'models' object in fetchAvailableModels response".to_string(),
            retryable: true,
        })?;

    let mut quotas = Vec::new();
    let mut warnings = Vec::new();
    let mut skipped_some = false;

    for (model_id, model_value) in models_obj {
        if model_value
            .get("isInternal")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }

        let quota_info = match model_value.get("quotaInfo") {
            Some(info) => info,
            None => {
                skipped_some = true;
                continue;
            }
        };

        let remaining_fraction = match parse_fraction(
            quota_info
                .get("remainingFraction")
                .or_else(|| quota_info.get("remaining_fraction")),
        ) {
            Some(fraction) => fraction,
            None => {
                skipped_some = true;
                continue;
            }
        };

        let display_name = read_string_alias(model_value, &["displayName", "display_name", "label"])
            .unwrap_or(model_id)
            .to_string();
        let reset_at = read_string_alias(quota_info, &["resetTime", "reset_time"])
            .map(str::to_string);

        quotas.push(build_quota(
            model_id.clone(),
            display_name,
            remaining_fraction,
            reset_at,
        ));
    }

    if skipped_some {
        warnings.push(AntigravityUsageWarning::SomeModelsSkipped);
    }
    if quotas.is_empty() {
        warnings.push(AntigravityUsageWarning::NoQuotaModelsReturned);
    } else {
        sort_quotas(&mut quotas);
    }

    Ok((quotas, warnings))
}

pub(crate) fn should_verify_full_quotas(quotas: &[AntigravityModelQuota]) -> bool {
    !quotas.is_empty()
        && quotas
            .iter()
            .all(|quota| quota.remaining_fraction >= 0.999)
}

async fn fetch_usage_with_token(
    remote: &AntigravityRemoteClient,
    access_token: &str,
) -> Result<
    (
        Option<String>,
        Vec<AntigravityModelQuota>,
        Vec<AntigravityUsageWarning>,
    ),
    AntigravityUsageCommandError,
> {
    let load_response = remote.load_code_assist(access_token).await?;
    let project_id = extract_project_id(&load_response);
    let plan_tier = resolve_plan_tier(&load_response);
    let observed_at = Utc::now();

    match remote
        .fetch_available_models(access_token, project_id.as_deref())
        .await
    {
        Ok(models_response) => {
            let (primary_quotas, mut warnings) = match normalize_available_models(&models_response) {
                Ok(result) => result,
                Err(_) => (Vec::new(), vec![AntigravityUsageWarning::SomeModelsSkipped]),
            };
            let suspicious_full = should_verify_full_quotas(&primary_quotas);

            let quota_response = match remote
                .retrieve_user_quota(access_token, project_id.as_deref())
                .await
            {
                Ok(value) => Some(value),
                Err(error) if error.code == "ANTIGRAVITY_REAUTH_REQUIRED" => return Err(error),
                Err(error) => {
                    eprintln!(
                        "[antigravity_quota] retrieveUserQuota unavailable: {}",
                        error.code
                    );
                    if suspicious_full {
                        warnings.push(AntigravityUsageWarning::UnverifiedFullQuotaResponse);
                    }
                    warnings.push(AntigravityUsageWarning::WeeklyQuotaUnavailable);
                    None
                }
            };

            let aggregation = aggregate_antigravity_quotas(
                Some(&models_response),
                quota_response.as_ref(),
                observed_at,
            );
            for diagnostic in &aggregation.diagnostics {
                eprintln!("[antigravity_quota] {diagnostic}");
            }

            if suspicious_full && quota_response.is_some() && aggregation.quotas.is_empty() {
                warnings.push(AntigravityUsageWarning::UnverifiedFullQuotaResponse);
            }
            if aggregation.quotas.is_empty() {
                warnings.push(AntigravityUsageWarning::NoQuotaModelsReturned);
            }
            if !aggregation
                .quotas
                .iter()
                .any(|quota| quota.weekly_percent.is_some())
                && !warnings.contains(&AntigravityUsageWarning::WeeklyQuotaUnavailable)
            {
                warnings.push(AntigravityUsageWarning::WeeklyQuotaUnavailable);
            }

            Ok((plan_tier, aggregation.quotas, warnings))
        }
        Err(error) if error.code == "ANTIGRAVITY_USAGE_FORBIDDEN" => {
            let quota_response = remote
                .retrieve_user_quota(access_token, project_id.as_deref())
                .await
                .map_err(|fallback_error| {
                    if fallback_error.code == "ANTIGRAVITY_USAGE_FORBIDDEN" {
                        AntigravityUsageCommandError {
                            code: fallback_error.code,
                            message: "Both fetchAvailableModels and retrieveUserQuota were forbidden"
                                .to_string(),
                            retryable: false,
                        }
                    } else {
                        fallback_error
                    }
                })?;
            let aggregation =
                aggregate_antigravity_quotas(None, Some(&quota_response), observed_at);
            for diagnostic in &aggregation.diagnostics {
                eprintln!("[antigravity_quota] {diagnostic}");
            }
            let mut warnings = Vec::new();
            if aggregation.quotas.is_empty() {
                warnings.push(AntigravityUsageWarning::NoQuotaModelsReturned);
            }
            if !aggregation
                .quotas
                .iter()
                .any(|quota| quota.weekly_percent.is_some())
            {
                warnings.push(AntigravityUsageWarning::WeeklyQuotaUnavailable);
            }
            Ok((plan_tier, aggregation.quotas, warnings))
        }
        Err(error) => Err(error),
    }
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

    let (plan_tier, quotas, warnings) = result;
    Ok(AntigravityAccountUsage {
        plan_tier,
        quotas,
        source: AntigravityUsageSource::CloudCode,
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
mod tests {
    use super::*;

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

}
