use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ClientBindingId(pub String);

#[derive(Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientBinding {
    pub id: ClientBindingId,
    pub profile_id: String,
    pub installation_id: Option<String>,
    pub secret: String,
    pub allowed_aliases: HashSet<String>,
    /// Alias used for Claude Code models that match no pool (the Default slot).
    #[serde(default)]
    pub fallback_alias: Option<String>,
    pub created_at: u64,
    pub revoked: bool,
}

impl std::fmt::Debug for ClientBinding {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientBinding")
            .field("id", &self.id)
            .field("profile_id", &self.profile_id)
            .field("installation_id", &self.installation_id)
            .field("secret", &"<redacted>")
            .field("allowed_aliases", &self.allowed_aliases)
            .field("fallback_alias", &self.fallback_alias)
            .field("created_at", &self.created_at)
            .field("revoked", &self.revoked)
            .finish()
    }
}

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

impl ClientBinding {
    pub fn new(
        profile_id: String,
        installation_id: Option<String>,
        allowed_aliases: HashSet<String>,
    ) -> Self {
        let binding_id = format!("bind_{}", generate_id());
        let secret = crate::codex_sync::generate_router_secret();
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            id: ClientBindingId(binding_id),
            profile_id,
            installation_id,
            secret,
            allowed_aliases,
            fallback_alias: None,
            created_at,
            revoked: false,
        }
    }

    pub fn with_secret(
        profile_id: String,
        installation_id: Option<String>,
        secret: String,
        allowed_aliases: HashSet<String>,
    ) -> Self {
        let binding_id = format!("bind_{}", generate_id());
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            id: ClientBindingId(binding_id),
            profile_id,
            installation_id,
            secret,
            allowed_aliases,
            fallback_alias: None,
            created_at,
            revoked: false,
        }
    }

    pub fn verify_secret(&self, candidate: &str) -> bool {
        if self.revoked {
            return false;
        }
        constant_time_eq(self.secret.as_bytes(), candidate.as_bytes())
    }

    pub fn allows_alias(&self, alias: &str) -> bool {
        if self.revoked {
            return false;
        }
        if self.allowed_aliases.is_empty() {
            return false;
        }
        let normalized = alias.trim().to_ascii_lowercase();
        self.allowed_aliases
            .iter()
            .any(|a| a.trim().to_ascii_lowercase() == normalized)
    }

    pub fn revoke(&mut self) {
        self.revoked = true;
    }
}

fn generate_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut hex = String::with_capacity(32);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(hex, "{:02x}", b);
    }
    hex
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_binding_secret_verification_and_constant_time() {
        let binding = ClientBinding::new(
            "default-profile".to_string(),
            Some("inst-1".to_string()),
            HashSet::from(["gpt-4o".to_string()]),
        );

        assert!(binding.verify_secret(&binding.secret));
        assert!(!binding.verify_secret("invalid-secret"));
        assert!(!binding.verify_secret(""));
    }

    #[test]
    fn debug_output_redacts_secret() {
        let binding = ClientBinding::with_secret(
            "profile".to_string(),
            None,
            "test-gateway-value".to_string(),
            HashSet::new(),
        );
        let text = format!("{binding:?}");
        assert!(!text.contains("test-gateway-value"));
        assert!(text.contains("<redacted>"));
    }

    #[test]
    fn test_client_binding_alias_allowlist() {
        let binding = ClientBinding::new(
            "default-profile".to_string(),
            None,
            HashSet::from(["gpt-4o".to_string(), "o1-mini".to_string()]),
        );

        assert!(binding.allows_alias("gpt-4o"));
        assert!(binding.allows_alias("GPT-4O")); // Case-insensitive
        assert!(binding.allows_alias("o1-mini"));
        assert!(!binding.allows_alias("claude-3-5-sonnet"));
    }

    #[test]
    fn test_client_binding_revocation() {
        let mut binding = ClientBinding::new(
            "default-profile".to_string(),
            None,
            HashSet::from(["gpt-4o".to_string()]),
        );

        assert!(binding.verify_secret(&binding.secret));
        assert!(binding.allows_alias("gpt-4o"));

        binding.revoke();

        assert!(!binding.verify_secret(&binding.secret));
        assert!(!binding.allows_alias("gpt-4o"));
    }
}
