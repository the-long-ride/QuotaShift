use crate::parser::parse_full_status;
use crate::types::{AntigravityQuotaAccuracy, AntigravityQuotaSource, FullStatus};
use serde_json::Value;

pub(crate) fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

pub(crate) fn parse_exact_status(
    expected_email: &str,
    user_status: Value,
    quota_summary: Value,
) -> Result<FullStatus, String> {
    let mut status = parse_full_status(user_status, quota_summary)?;
    let returned_email = status.email.as_deref().unwrap_or("");
    if normalize_email(expected_email).is_empty() || normalize_email(returned_email).is_empty() {
        return Err("Exact Antigravity identity verification requires both expected and returned email".to_string());
    }
    if normalize_email(expected_email) != normalize_email(returned_email) {
        return Err(format!(
            "Antigravity worker identity mismatch: expected {}, received {}",
            expected_email.trim(),
            returned_email.trim()
        ));
    }

    status.source = Some(AntigravityQuotaSource::IdeLocal);
    status.accuracy = Some(if status.quotas.iter().any(|quota| quota.weekly_percent.is_some()) {
        AntigravityQuotaAccuracy::ExactGrouped
    } else {
        AntigravityQuotaAccuracy::SessionOnly
    });
    status.online = true;
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::{normalize_email, parse_exact_status};
    use crate::types::{AntigravityQuotaAccuracy, AntigravityQuotaSource};
    use serde_json::json;

    #[test]
    fn email_normalization_is_case_and_whitespace_insensitive() {
        assert_eq!(normalize_email(" User@Example.COM "), "user@example.com");
    }

    #[test]
    fn exact_status_rejects_a_different_returned_account() {
        let raw = json!({ "userStatus": { "userInfo": { "email": "other@example.com" } } });
        let error = parse_exact_status("expected@example.com", raw, json!({})).unwrap_err();
        assert!(error.contains("identity mismatch"));
    }

    #[test]
    fn exact_status_marks_grouped_weekly_results_as_exact() {
        let raw = json!({ "userStatus": { "userInfo": { "email": "User@Example.com" } } });
        let quota = json!({
            "groups": [{
                "displayName": "Gemini Models",
                "buckets": [{ "bucketId": "gemini-week", "window": "weekly", "remainingFraction": 0.4 }]
            }]
        });
        let status = parse_exact_status(" user@example.COM ", raw, quota).unwrap();
        assert_eq!(status.source, Some(AntigravityQuotaSource::IdeLocal));
        assert_eq!(status.accuracy, Some(AntigravityQuotaAccuracy::ExactGrouped));
    }
}
