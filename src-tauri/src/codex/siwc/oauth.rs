use crate::auth::oauth::utils::{pkce_challenge, random_base64url};

#[derive(Debug, Clone)]
pub struct PkceParams {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
    pub nonce: String,
}

pub fn generate_pkce_params() -> PkceParams {
    let verifier = random_base64url(32);
    let challenge = pkce_challenge(&verifier);
    let state = random_base64url(16);
    let nonce = random_base64url(16);

    PkceParams {
        verifier,
        challenge,
        state,
        nonce,
    }
}

pub fn validate_oauth_callback(
    code: &str,
    state: &str,
    expected_state: &str,
) -> Result<String, String> {
    if state != expected_state {
        return Err("State mismatch in OAuth callback".to_string());
    }
    if code.trim().is_empty() {
        return Err("Missing authorization code in OAuth callback".to_string());
    }
    Ok(code.to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TokenClaims {
    pub iss: String,
    pub aud: String,
    pub nonce: Option<String>,
    pub sub: String,
    pub scope: String,
}

impl TokenClaims {
    /// Scope hint only; a verified identity and the token endpoint grant are required.
    pub fn is_routable(&self) -> bool {
        self.scope
            .split_whitespace()
            .any(|s| s == "chatgpt.tokens.use.direct")
    }
}

/// Performs field-only preflight on untrusted claim data. This DOES NOT verify
/// the JWT signature, expiration, or JWKS key. Never use this function as the
/// final authentication/registration decision.
pub fn validate_token_claims(
    claims: &TokenClaims,
    expected_iss: &str,
    expected_aud: &str,
    expected_nonce: Option<&str>,
) -> Result<(), String> {
    if claims.iss != expected_iss {
        return Err(format!(
            "Token issuer mismatch: expected '{}', got '{}'",
            expected_iss, claims.iss
        ));
    }

    if claims.aud != expected_aud {
        return Err(format!(
            "Token audience mismatch: expected '{}', got '{}'",
            expected_aud, claims.aud
        ));
    }

    if let Some(expected_nonce_val) = expected_nonce {
        match &claims.nonce {
            Some(actual_nonce) if actual_nonce == expected_nonce_val => (),
            Some(actual_nonce) => {
                return Err(format!(
                    "Token nonce mismatch: expected '{}', got '{}'",
                    expected_nonce_val, actual_nonce
                ));
            }
            None => {
                return Err("Missing required nonce in token claims".to_string());
            }
        }
    }

    Ok(())
}

const SIWC_SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

/// Constructs an authorization URL only. The caller must start the IPv4 callback
/// listener before opening the browser and persist the per-attempt PKCE state.
pub fn build_siwc_authorization_url(
    host_id: &str,
    port: u16,
    issued_client_id: Option<&str>,
    params: &PkceParams,
) -> Result<String, String> {
    if port == 0 || !host_id.starts_with("urn:uuid:") {
        return Err("SIWC requires a stable urn:uuid host ID and an active callback port".into());
    }
    let client_id = issued_client_id.unwrap_or("dynamic_agent_client");
    if client_id.trim().is_empty() || issued_client_id == Some("dynamic_agent_client") {
        return Err("Returning sign-in must use the issued client ID".into());
    }
    let mut url = reqwest::Url::parse("https://auth.openai.com/api/accounts/authorize")
        .map_err(|err| err.to_string())?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("client_id", client_id);
        if issued_client_id.is_none() {
            query.append_pair("agent_name_hint", "QuotaShift");
        }
        query
            .append_pair("ext_agent_host_id", host_id)
            .append_pair("response_type", "code")
            .append_pair(
                "redirect_uri",
                &format!("http://127.0.0.1:{port}/auth/callback"),
            )
            .append_pair("scope", SIWC_SCOPES)
            .append_pair("resource", "https://api.openai.com/v1")
            .append_pair("state", &params.state)
            .append_pair("nonce", &params.nonce)
            .append_pair("code_challenge_method", "S256")
            .append_pair("code_challenge", &params.challenge);
    }
    Ok(url.into())
}

/// Resolves the registered client ID from an already state-validated callback.
/// Does not exchange the code or validate OIDC identity: neither operation
/// may be skipped by a caller.
pub fn validate_siwc_callback(
    code: &str,
    state: &str,
    expected_state: &str,
    callback_client_id: Option<&str>,
    returning_issued_id: Option<&str>,
) -> Result<String, String> {
    validate_oauth_callback(code, state, expected_state)?;
    match returning_issued_id {
        Some(issued) if !issued.is_empty() && issued != "dynamic_agent_client" => {
            if let Some(received) = callback_client_id {
                if received != issued {
                    return Err("SIWC reauthorization returned a different client ID".into());
                }
            }
            Ok(issued.to_owned())
        }
        Some(_) => Err("Saved SIWC issued client ID is invalid".into()),
        None => match callback_client_id {
            Some(received) if !received.trim().is_empty() && received != "dynamic_agent_client" => {
                Ok(received.to_owned())
            }
            _ => Err("Initial SIWC registration did not return an issued client ID".into()),
        },
    }
}
