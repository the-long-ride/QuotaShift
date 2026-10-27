use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TrustedSessionKey {
    profile_id: String,
    conversation_id: String,
    hash: String,
}

impl TrustedSessionKey {
    pub fn new(profile_id: &str, conversation_id: &str) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(profile_id.as_bytes());
        hasher.update(b"::");
        hasher.update(conversation_id.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        Self {
            profile_id: profile_id.to_string(),
            conversation_id: conversation_id.to_string(),
            hash,
        }
    }

    pub fn profile_id(&self) -> &str {
        &self.profile_id
    }

    pub fn conversation_id(&self) -> &str {
        &self.conversation_id
    }
}

#[derive(Clone, Default)]
pub struct AffinityRegistry {
    pins: HashMap<(String, String), (String, Instant)>,
}

impl AffinityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_pin(
        &mut self,
        session: &TrustedSessionKey,
        model: &str,
        account_id: &str,
        ttl: Duration,
    ) {
        let key = (session.hash.clone(), model.to_string());
        self.pins
            .insert(key, (account_id.to_string(), Instant::now() + ttl));
    }

    pub fn get_pinned_account(&self, session: &TrustedSessionKey, model: &str) -> Option<String> {
        let key = (session.hash.clone(), model.to_string());
        let (account_id, expires_at) = self.pins.get(&key)?;
        if Instant::now() <= *expires_at {
            Some(account_id.clone())
        } else {
            None
        }
    }

    pub fn is_cache_hit(&self, session: &TrustedSessionKey, model: &str) -> bool {
        self.get_pinned_account(session, model).is_some()
    }

    pub fn drop_pin(&mut self, session: &TrustedSessionKey, model: &str) {
        let key = (session.hash.clone(), model.to_string());
        self.pins.remove(&key);
    }

    pub fn get_pinned_account_raw(
        &self,
        profile_id: Option<&str>,
        conv_id: &str,
        model: &str,
    ) -> Option<String> {
        let profile = profile_id?.trim();
        if profile.is_empty() || conv_id.trim().is_empty() {
            return None;
        }
        let session = TrustedSessionKey::new(profile, conv_id);
        self.get_pinned_account(&session, model)
    }
}
