//! Signature-verified SIWC OIDC identities. Never accept decoded JWT payloads as proof.
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;

pub const SIWC_ISSUER: &str = "https://auth.openai.com";
const JWKS_URI: &str = "https://auth.openai.com/.well-known/jwks.json";

#[derive(Debug, Default, Deserialize)]
struct OpenAiProfileClaims {
    #[serde(default)]
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IdTokenPayload {
    sub: String,
    nonce: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(rename = "https://api.openai.com/profile", default)]
    openai_profile: Option<OpenAiProfileClaims>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedSiwcIdentity {
    subject: String,
    email: Option<String>,
}

impl VerifiedSiwcIdentity {
    pub fn subject(&self) -> &str {
        &self.subject
    }
    pub fn email(&self) -> Option<&str> {
        self.email.as_deref()
    }
    #[cfg(test)]
    pub fn new_for_test(subject: &str, email: Option<String>) -> Self {
        Self {
            subject: subject.to_owned(),
            email,
        }
    }
}

/// Strictly limited to OpenAI's fixed issuer JWKS; no JWT-provided key URLs.
pub async fn fetch_openai_jwks(client: &reqwest::Client) -> Result<JwkSet, String> {
    let response = client
        .get(JWKS_URI)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| "OpenAI identity keys cannot be reached")?;
    if !response.status().is_success() {
        return Err(format!(
            "OpenAI identity keys unavailable (HTTP {})",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Cannot read identity keys")?;
    if bytes.len() > 256 * 1024 {
        return Err("OpenAI key set exceeds size limit".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid OpenAI identity key set".into())
}

/// Validation binds a signed ID token to this *specific* issued client and nonce.
/// Success is required before registration or token persistence.
pub fn verify_siwc_id_token(
    compact_jwt: &str,
    keys: &JwkSet,
    issued_client_id: &str,
    expected_nonce: &str,
) -> Result<VerifiedSiwcIdentity, String> {
    if issued_client_id.trim().is_empty()
        || issued_client_id == "dynamic_agent_client"
        || expected_nonce.trim().is_empty()
    {
        return Err("Issued client ID and transaction nonce required".into());
    }
    let header = decode_header(compact_jwt).map_err(|_| "Invalid SIWC ID-token header")?;
    if header.alg != Algorithm::RS256 {
        return Err("Unsupported SIWC ID-token signature algorithm".into());
    }
    let kid = header.kid.as_deref().ok_or("Missing SIWC signing key ID")?;
    let jwk = keys
        .keys
        .iter()
        .find(|key| key.common.key_id.as_deref() == Some(kid))
        .ok_or("SIWC signing key was not found in OpenAI JWKS")?;
    let decoding_key =
        DecodingKey::from_jwk(jwk).map_err(|_| "Unsupported SIWC identity signing key")?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[SIWC_ISSUER]);
    validation.set_audience(&[issued_client_id]);
    validation.set_required_spec_claims(&["iss", "aud", "exp", "sub"]);
    validation.validate_exp = true;
    validation.validate_nbf = true;
    validation.leeway = 30;

    let token = decode::<IdTokenPayload>(compact_jwt, &decoding_key, &validation)
        .map_err(|_| "SIWC ID-token signature or identity claims invalid")?;
    if token.claims.sub.trim().is_empty() || token.claims.nonce != expected_nonce {
        return Err("SIWC ID token subject or nonce mismatch".into());
    }
    let email = token
        .claims
        .email
        .or_else(|| token.claims.openai_profile.and_then(|p| p.email))
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    Ok(VerifiedSiwcIdentity {
        subject: token.claims.sub,
        email,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unsigned_or_wrong_algorithm_tokens() {
        let keys = JwkSet { keys: vec![] };
        assert!(verify_siwc_id_token("a.b.c", &keys, "issued", "nonce").is_err());
        // HS256 must never be accepted even if an attacker controls a matching key ID.
        let hdr = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            br#"{"alg":"HS256","kid":"k1"}"#,
        );
        assert!(
            verify_siwc_id_token(&format!("{hdr}.e30.signature"), &keys, "issued", "nonce")
                .unwrap_err()
                .contains("algorithm")
        );
    }
    #[test]
    fn requires_issued_client_and_transaction_nonce() {
        let keys = JwkSet { keys: vec![] };
        assert!(verify_siwc_id_token("bad", &keys, "dynamic_agent_client", "nonce").is_err());
        assert!(verify_siwc_id_token("bad", &keys, "issued", "").is_err());
    }
    #[test]
    fn does_not_accept_arbitrary_jwks_key_sources() {
        // The decoder uses the fixed JWKS_URI and only the selected kid.
        assert!(JWKS_URI.starts_with(SIWC_ISSUER));
    }
}
