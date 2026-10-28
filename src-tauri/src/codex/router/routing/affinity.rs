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

const SESSION_PIN_TTL: Duration = Duration::from_secs(900);

const SESSION_HEADER_CANDIDATES: &[&str] = &[
    "x-claude-code-session-id",
    "session-id",
    "session_id",
    "thread-id",
    "thread_id",
    "conversation_id",
    "x-session-id",
];

#[derive(serde::Deserialize)]
struct BodySessionHint {
    #[serde(default)]
    prompt_cache_key: Option<String>,
}

pub fn extract_session_header_value(headers: &axum::http::HeaderMap) -> Option<&str> {
    SESSION_HEADER_CANDIDATES.iter().find_map(|name| {
        headers
            .get(*name)
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    })
}

fn extract_body_prompt_cache_key(body: &[u8]) -> Option<String> {
    if body.is_empty() {
        return None;
    }
    let hint: BodySessionHint = serde_json::from_slice(body).ok()?;
    let trimmed = hint.prompt_cache_key?.trim().to_string();
    (!trimmed.is_empty()).then_some(trimmed)
}

pub fn extract_request_session(
    headers: &axum::http::HeaderMap,
    client_ctx: &super::route_context::ClientContext,
) -> Option<TrustedSessionKey> {
    extract_request_session_with_body(headers, client_ctx, &[])
}

pub fn extract_request_session_with_body(
    headers: &axum::http::HeaderMap,
    client_ctx: &super::route_context::ClientContext,
    body: &[u8],
) -> Option<TrustedSessionKey> {
    let profile = client_ctx.binding_id.as_deref().unwrap_or("default");
    if let Some(conv_id) = extract_session_header_value(headers) {
        return Some(TrustedSessionKey::new(profile, conv_id));
    }
    let cache_key = extract_body_prompt_cache_key(body)?;
    Some(TrustedSessionKey::new(profile, &cache_key))
}

pub async fn select_account_with_affinity(
    state: &super::types::RouterAppState,
    config: &super::types::CodexRouterConfig,
    route: Option<&super::route_context::ResolvedRoute>,
    session: Option<&TrustedSessionKey>,
    attempted: &std::collections::HashSet<String>,
) -> Option<super::types::CodexRouterAccount> {
    if let (Some(r), Some(sess)) = (route, session) {
        let pinned = state
            .affinity
            .lock()
            .await
            .get_pinned_account(sess, &r.upstream_model_id);
        if let Some(pinned_id) = pinned {
            if !attempted.contains(&pinned_id) && r.member_account_ids.contains(&pinned_id) {
                let eligible = {
                    let mut runtime = state.selection_state.lock().await;
                    !runtime.is_account_blocked(&pinned_id, &r.upstream_model_id)
                };
                if eligible {
                    if let Some(acc) = config.accounts.iter().find(|a| a.id == pinned_id) {
                        return Some(acc.clone());
                    }
                }
            }
        }
    }
    if let Some(r) = route {
        super::selection::select_account_for_route_excluding(state, config, r, attempted).await
    } else {
        super::selection::select_account_excluding(state, config, None, attempted).await
    }
}

pub async fn pin_session_account(
    state: &super::types::RouterAppState,
    route: Option<&super::route_context::ResolvedRoute>,
    session: Option<&TrustedSessionKey>,
    account_id: &str,
) {
    if let (Some(r), Some(sess)) = (route, session) {
        state.affinity.lock().await.set_pin(
            sess,
            &r.upstream_model_id,
            account_id,
            SESSION_PIN_TTL,
        );
    }
}

pub async fn drop_session_account_pin(
    state: &super::types::RouterAppState,
    route: Option<&super::route_context::ResolvedRoute>,
    session: Option<&TrustedSessionKey>,
) {
    if let (Some(r), Some(sess)) = (route, session) {
        state
            .affinity
            .lock()
            .await
            .drop_pin(sess, &r.upstream_model_id);
    }
}
