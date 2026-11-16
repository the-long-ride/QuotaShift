use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};

const SERVICE: &str = "com.the-long-ride.quotashift.agent-api";
const USER: &str = "agent-api-key-v1";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, USER).map_err(|e| format!("Agent keyring: {e}"))
}

pub fn load_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("Agent API key unavailable: {err}")),
    }
}

pub fn generate_key() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let key = URL_SAFE_NO_PAD.encode(bytes);
    entry()?
        .set_password(&key)
        .map_err(|e| format!("Cannot save API key: {e}"))?;
    Ok(key)
}

pub fn validate_manual_key(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.len() < 16 {
        return Err("API key must be at least 16 characters".into());
    }
    if trimmed.len() > 512 {
        return Err("API key is too long (maximum 512 characters)".into());
    }
    if trimmed.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("API key cannot contain whitespace or control characters".into());
    }
    Ok(trimmed.to_string())
}

pub fn set_key(raw: &str) -> Result<String, String> {
    let validated = validate_manual_key(raw)?;
    entry()?
        .set_password(&validated)
        .map_err(|e| format!("Cannot save API key: {e}"))?;
    Ok(validated)
}

pub fn matches_bearer(received: &str, expected: &str) -> bool {
    let supplied = Sha256::digest(received.as_bytes());
    let actual = Sha256::digest(expected.as_bytes());
    supplied
        .iter()
        .zip(actual.iter())
        .fold(0u8, |v, (a, b)| v | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bearer_compare_rejects_prefixes_and_invalid_keys() {
        assert!(matches_bearer("Bearer abc", "Bearer abc"));
        assert!(!matches_bearer("Bearer abc", "Bearer abcd"));
        assert!(!matches_bearer("", "Bearer abc"));
    }

    #[test]
    fn manual_key_validation_enforces_length_and_characters() {
        assert!(validate_manual_key("short").is_err());
        assert!(validate_manual_key("has space inside 12345").is_err());
        assert!(validate_manual_key("has\nnewline_1234567890").is_err());
        assert_eq!(
            validate_manual_key("  custom-secret-key-123456  ").unwrap(),
            "custom-secret-key-123456"
        );
    }
}
