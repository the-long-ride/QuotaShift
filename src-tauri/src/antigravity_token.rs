use crate::types::{AntigravityRefreshedTokens, AntigravityUsageCommandError};
use crate::quota::{do_refresh_antigravity_token, is_token_near_expiry};

#[derive(Debug, Clone)]
pub(crate) struct AccessTokenInput {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub auth_method: Option<String>,
}

pub(crate) async fn ensure_access_token(
    input: &AccessTokenInput,
    force: bool,
) -> Result<(String, Option<AntigravityRefreshedTokens>), AntigravityUsageCommandError> {
    let near_expiry = is_token_near_expiry(&input.access_token);
    let is_empty = input.access_token.trim().is_empty();

    if !force && !near_expiry && !is_empty {
        return Ok((input.access_token.clone(), None));
    }

    let rt = match &input.refresh_token {
        Some(rt) if !rt.trim().is_empty() => rt.trim(),
        _ => {
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_REAUTH_REQUIRED".to_string(),
                message: "No refresh token available".to_string(),
                retryable: false,
            });
        }
    };

    let refreshed = do_refresh_antigravity_token(rt, input.auth_method.as_deref())
        .await
        .map_err(|e| AntigravityUsageCommandError {
            code: "ANTIGRAVITY_REAUTH_REQUIRED".to_string(),
            message: format!("Token refresh failed: {}", e),
            retryable: false,
        })?;

    let new_access_token = refreshed
        .get("access_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AntigravityUsageCommandError {
            code: "ANTIGRAVITY_REAUTH_REQUIRED".to_string(),
            message: "Response did not contain access_token".to_string(),
            retryable: false,
        })?;

    let new_refresh_token = refreshed
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let expires_in = refreshed.get("expires_in").and_then(|v| v.as_u64());
    let auth_method = refreshed
        .get("authMethod")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| input.auth_method.clone());

    let tokens = AntigravityRefreshedTokens {
        access_token: new_access_token.clone(),
        refresh_token: new_refresh_token,
        expires_in,
        auth_method,
    };

    Ok((new_access_token, Some(tokens)))
}
