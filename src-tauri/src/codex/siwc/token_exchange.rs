//! OpenAI public OAuth token exchange and refresh. Never log request/response bodies.
use super::oidc::VerifiedSiwcIdentity;
use serde::Deserialize;

const TOKEN_ENDPOINT: &str = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE: &str = "https://api.openai.com/v1";
const DIRECT_SCOPE: &str = "chatgpt.tokens.use.direct";

#[derive(Deserialize)]
pub struct TokenGrant {
    access_token: String,
    refresh_token: String,
    id_token: Option<String>,
    token_type: String,
    expires_in: u64,
    scope: String,
}

impl TokenGrant {
    pub fn has_direct_scope(&self) -> bool {
        self.scope.split_whitespace().any(|s| s == DIRECT_SCOPE)
    }
    pub fn validate(&self, requires_id_token: bool) -> Result<(), String> {
        if self.token_type != "Bearer"
            || self.access_token.is_empty()
            || self.refresh_token.is_empty()
            || self.expires_in == 0
        {
            return Err("Incomplete SIWC OAuth token response".into());
        }
        if requires_id_token && self.id_token.as_deref().unwrap_or("").is_empty() {
            return Err("SIWC registration requires a signed ID token".into());
        }
        Ok(())
    }
    pub fn rotate_session(self, old: NativeSiwcSession) -> Result<NativeSiwcSession, String> {
        self.validate(false)?;
        // A rotating refresh token belongs to the previously verified registration.
        // A new ID token, if returned, is not trusted without OIDC verification.
        Ok(NativeSiwcSession {
            client_id: old.client_id,
            subject: old.subject,
            email: old.email,
            scopes: self.scope.split_whitespace().map(str::to_owned).collect(),
            access_token: self.access_token,
            refresh_token: self.refresh_token,
            id_token: old.id_token,
            linked_codex_account_id: old.linked_codex_account_id,
            expires_at: chrono::Utc::now().timestamp() + self.expires_in as i64,
        })
    }
    pub fn id_token(&self) -> Option<&str> {
        self.id_token.as_deref()
    }
    /// Only native code may construct a persisted session from a *verified* ID token.
    pub fn into_session(
        self,
        client_id: String,
        identity: &VerifiedSiwcIdentity,
    ) -> Result<NativeSiwcSession, String> {
        self.validate(true)?;
        Ok(NativeSiwcSession {
            client_id,
            subject: identity.subject().to_string(),
            email: identity.email().unwrap_or("").to_string(),
            scopes: self.scope.split_whitespace().map(str::to_owned).collect(),
            access_token: self.access_token,
            refresh_token: self.refresh_token,
            id_token: self.id_token.unwrap_or_default(),
            linked_codex_account_id: None,
            expires_at: chrono::Utc::now().timestamp() + (self.expires_in as i64),
        })
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct NativeSiwcSession {
    client_id: String,
    subject: String,
    email: String,
    scopes: Vec<String>,
    access_token: String,
    refresh_token: String,
    id_token: String,
    #[serde(default)]
    linked_codex_account_id: Option<String>,
    expires_at: i64,
}

impl NativeSiwcSession {
    pub fn linked_codex_account_id(&self) -> Option<&str> {
        self.linked_codex_account_id.as_deref()
    }

    pub fn bind_codex_account(&mut self, account_id: Option<String>) {
        self.linked_codex_account_id = account_id;
    }

    pub fn bind_subject(&mut self, subject: String) {
        if !subject.trim().is_empty() {
            self.subject = subject;
        }
    }

    pub fn requires_refresh(&self) -> bool {
        self.expires_at <= chrono::Utc::now().timestamp() + 60
    }
    pub fn refresh_token(&self) -> &str {
        &self.refresh_token
    }
    pub fn client_id(&self) -> &str {
        &self.client_id
    }
    pub fn subject(&self) -> &str {
        &self.subject
    }
    pub fn email(&self) -> &str {
        &self.email
    }
    pub fn is_routable(&self) -> bool {
        self.scopes.iter().any(|s| s == DIRECT_SCOPE) && !self.refresh_token.is_empty()
    }
    pub fn access_token(&self) -> Option<&str> {
        if self.is_routable() && !self.requires_refresh() {
            Some(&self.access_token)
        } else {
            None
        }
    }
}

pub async fn exchange_authorization_code(
    client: &reqwest::Client,
    issued_client_id: &str,
    authorization_code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<TokenGrant, String> {
    let params = [
        ("grant_type", "authorization_code"),
        ("client_id", issued_client_id),
        ("code", authorization_code),
        ("code_verifier", verifier),
        ("redirect_uri", redirect_uri),
        ("resource", RESOURCE),
    ];
    exchange(client, &params, true).await
}

async fn exchange(
    client: &reqwest::Client,
    params: &[(&str, &str)],
    need_identity: bool,
) -> Result<TokenGrant, String> {
    let response = client
        .post(TOKEN_ENDPOINT)
        .timeout(std::time::Duration::from_secs(20))
        .form(params)
        .send()
        .await
        .map_err(|_| "SIWC OAuth token server unreachable")?;
    let status = response.status();
    if !status.is_success() {
        // Never include returned bodies: only the standard OAuth error code is surfaced.
        let request_id = response_request_id(response.headers());
        let body = response.bytes().await.unwrap_or_default();
        let small = body.len() <= 16 * 1024;
        let code = small.then(|| oauth_error_code(&body)).flatten();
        crate::logger::log_warn(
            "siwc",
            &format!(
                "SIWC token endpoint rejected: status={status} error={} request_id={} body_bytes={}",
                code.as_deref().unwrap_or("none"),
                request_id.as_deref().unwrap_or("none"),
                body.len()
            ),
        );
        // OpenAI's own explanation goes to the local log only, sanitized and capped.
        if let Some(description) = small.then(|| oauth_error_description(&body)).flatten() {
            crate::logger::log_warn("siwc", &format!("SIWC token endpoint said: {description}"));
        }
        return Err(token_error_message(status, code.as_deref(), need_identity));
    }
    let payload = response
        .bytes()
        .await
        .map_err(|_| "SIWC token payload unreadable")?;
    if payload.len() > 128 * 1024 {
        return Err("SIWC token payload too large".into());
    }
    let grant: TokenGrant =
        serde_json::from_slice(&payload).map_err(|_| "SIWC token payload invalid")?;
    grant.validate(need_identity)?;
    Ok(grant)
}

/// OpenAI's sign-in guide: an `invalid_grant` code exchange means the code was rejected or spent;
/// if retrying with the retained issued client ID still fails, note that ChatGPT Free accounts can
/// pass consent and receive OpenAI's email, while direct routing tokens require ChatGPT Plus/Pro.
fn token_error_message(
    status: reqwest::StatusCode,
    code: Option<&str>,
    initial_sign_in: bool,
) -> String {
    match code {
        Some("invalid_grant") if initial_sign_in => format!(
            "OpenAI rejected this sign-in token exchange. Note: ChatGPT Free accounts can pass the consent screen and receive OpenAI's email, but OpenAI requires a ChatGPT Plus or Pro plan to issue Model Routing tokens. If you are on Plus/Pro, start the authorization again and finish it in one pass. (HTTP {status}: invalid_grant)"
        ),
        Some(code) => format!("SIWC OAuth token exchange failed (HTTP {status}: {code})"),
        None => format!("SIWC OAuth token exchange failed (HTTP {status})"),
    }
}

pub fn is_invalid_grant_error(error: &str) -> bool {
    error.contains("invalid_grant")
}
/// Request correlation header for OpenAI support, printable ASCII and capped. Not a credential.
fn response_request_id(headers: &reqwest::header::HeaderMap) -> Option<String> {
    ["x-request-id", "openai-request-id", "cf-ray"]
        .iter()
        .find_map(|name| {
            let value = headers.get(*name)?.to_str().ok()?;
            let clean: String = value
                .chars()
                .filter(|c| c.is_ascii_graphic())
                .take(100)
                .collect();
            (!clean.is_empty()).then(|| format!("{name}:{clean}"))
        })
}

/// Server-written `error_description`, reduced to printable ASCII and capped. Never echoes
/// request values; the endpoint only describes why the grant was refused.
fn oauth_error_description(body: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    let desc_key = "error_description";
    let text = value
        .get(desc_key)
        .and_then(|d| d.as_str())
        .or_else(|| value.get("error")?.get("message")?.as_str())?;
    let clean: String = text
        .chars()
        .filter(|c| c.is_ascii_graphic() || *c == ' ')
        .take(200)
        .collect();
    let clean = clean.trim().to_owned();
    (!clean.is_empty()).then_some(clean)
}

/// Extracts an OAuth `error` code (RFC 6749 5.2), never its description.
fn oauth_error_code(body: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    let error = value.get("error")?;
    let code = error
        .as_str()
        .or_else(|| error.get("code").and_then(|c| c.as_str()))?;
    let safe = !code.is_empty()
        && code.len() <= 64
        && code.bytes().all(|b| {
            b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'_' | b'.' | b'-')
        });
    safe.then(|| code.to_owned())
}

pub async fn refresh_token(
    client: &reqwest::Client,
    issued_client_id: &str,
    current_refresh_token: &str,
) -> Result<TokenGrant, String> {
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", issued_client_id),
        ("refresh_token", current_refresh_token),
        ("resource", RESOURCE),
    ];
    exchange(client, &params, false).await
}

#[cfg(test)]
#[path = "token_exchange_test.rs"]
mod tests;
