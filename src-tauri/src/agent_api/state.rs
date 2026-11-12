use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicAgentAccount {
    pub id: String,
    pub provider: String,
    pub remaining_percent: Option<u8>,
    pub used_percent: Option<u8>,
    pub reset_at: Option<String>,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicAgentPool {
    pub id: String,
    pub provider: String,
    pub account_ids: Vec<String>,
    pub enabled: bool,
    pub active: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentApiSnapshot {
    pub accounts: Vec<PublicAgentAccount>,
    pub pools: Vec<PublicAgentPool>,
    pub active_antigravity_id: Option<String>,
    pub active_codex_id: Option<String>,
}

impl AgentApiSnapshot {
    pub fn validate(&self) -> Result<(), String> {
        if self.accounts.len() > 256 || self.pools.len() > 64 {
            return Err("Too many account or pool entries".into());
        }
        let mut known = std::collections::HashSet::new();
        for acc in &self.accounts {
            if !valid_id(&acc.id) || !matches!(acc.provider.as_str(), "codex" | "antigravity") {
                return Err("Invalid account identifier or provider".into());
            }
            if acc.remaining_percent.is_some_and(|n| n > 100)
                || acc.used_percent.is_some_and(|n| n > 100)
            {
                return Err("Quota percentage out of range".into());
            }
            if !known.insert((acc.provider.clone(), acc.id.clone())) {
                return Err("Duplicate agent account ID".into());
            }
        }
        for pool in &self.pools {
            if !valid_id(&pool.id) || pool.account_ids.len() > 256
                || !matches!(pool.provider.as_str(), "codex" | "antigravity")
            {
                return Err("Invalid agent pool".into());
            }
            if pool.account_ids.iter().any(|id| !known.contains(&(pool.provider.clone(), id.clone()))) {
                return Err("Pool contains an unknown account".into());
            }
        }
        Ok(())
    }
}
pub fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 160
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOperation {
    pub operation_id: String,
    pub provider: String,
    pub account_id: String,
    pub status: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApiStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub write_enabled: bool,
    pub key_configured: bool,
}

pub struct AgentRuntime {
    pub task: JoinHandle<()>,
    pub port: u16,
    pub write_enabled: bool,
}
#[derive(Default)]
pub struct AgentApiInner {
    pub runtime: tokio::sync::Mutex<Option<AgentRuntime>>,
    pub snapshot: RwLock<AgentApiSnapshot>,
    pub operations: Mutex<HashMap<String, AgentOperation>>,
    pub active_operation: Mutex<Option<String>>,
}
#[derive(Clone, Default)]
pub struct AgentApiManager {
    pub inner: Arc<AgentApiInner>,
}
pub fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_account_schema_rejects_alias_and_email_leaks() {
        let valid = serde_json::json!({
            "accounts": [{
                "id": "codex-1", "provider": "codex", "remainingPercent": 40,
                "usedPercent": 60, "resetAt": null, "updatedAt": 1
            }],
            "pools": [], "activeAntigravityId": null, "activeCodexId": "codex-1"
        });
        assert!(serde_json::from_value::<AgentApiSnapshot>(valid.clone()).unwrap().validate().is_ok());
        let mut invalid = valid;
        invalid["accounts"][0]["email"] = serde_json::json!("private@example.com");
        assert!(serde_json::from_value::<AgentApiSnapshot>(invalid).is_err());
    }
    #[test]
    fn rejects_non_opaque_identifiers() {
        assert!(!valid_id("person@example.com"));
        assert!(!valid_id(""));
        assert!(valid_id("acct-oauth-123_ABC"));
    }
}
