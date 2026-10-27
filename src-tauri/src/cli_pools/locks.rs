use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::types::CliProvider;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LockError {
    AlreadyLocked { holder_op_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PreflightBlockedReason {
    RouterInFlightRequests(u64),
    GlobalRouterActiveConflict,
    MultipleUnmanagedProcesses(usize),
    CandidateAccountInvalid,
    CandidateAlreadyActive,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightCheckParams {
    pub provider: CliProvider,
    pub auth_domain: String,
    pub router_active: bool,
    pub router_in_flight: u64,
    pub has_isolated_codex_home: bool,
    pub candidate_account_id: String,
    pub candidate_valid: bool,
    pub active_account_id: String,
    pub managed_cli_instances: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct LockKey {
    provider: CliProvider,
    auth_domain: String,
}

#[derive(Debug, Clone)]
struct LockInfo {
    op_id: String,
    #[allow(dead_code)]
    acquired_at: u64,
}

#[derive(Debug, Default, Clone)]
pub struct RotationLockManager {
    inner: Arc<Mutex<HashMap<LockKey, LockInfo>>>,
}

pub struct RotationLockGuard {
    manager: RotationLockManager,
    key: LockKey,
    op_id: String,
}

impl Drop for RotationLockGuard {
    fn drop(&mut self) {
        if let Ok(mut map) = self.manager.inner.lock() {
            if let Some(info) = map.get(&self.key) {
                if info.op_id == self.op_id {
                    map.remove(&self.key);
                }
            }
        }
    }
}

impl RotationLockManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn acquire(
        &self,
        provider: CliProvider,
        auth_domain: &str,
        op_id: &str,
        now: u64,
    ) -> Result<RotationLockGuard, LockError> {
        let key = LockKey {
            provider,
            auth_domain: auth_domain.to_string(),
        };
        let mut map = self.inner.lock().map_err(|_| LockError::AlreadyLocked {
            holder_op_id: "poisoned".to_string(),
        })?;

        if let Some(existing) = map.get(&key) {
            return Err(LockError::AlreadyLocked {
                holder_op_id: existing.op_id.clone(),
            });
        }
        map.insert(
            key.clone(),
            LockInfo {
                op_id: op_id.to_string(),
                acquired_at: now,
            },
        );

        Ok(RotationLockGuard {
            manager: self.clone(),
            key,
            op_id: op_id.to_string(),
        })
    }

    pub fn is_locked(&self, provider: CliProvider, auth_domain: &str) -> bool {
        let key = LockKey {
            provider,
            auth_domain: auth_domain.to_string(),
        };
        self.inner
            .lock()
            .map(|map| map.contains_key(&key))
            .unwrap_or(false)
    }
}

pub fn preflight_rotation_compatibility(
    params: &PreflightCheckParams,
) -> Result<(), PreflightBlockedReason> {
    if params.router_active && params.router_in_flight > 0 {
        return Err(PreflightBlockedReason::RouterInFlightRequests(
            params.router_in_flight,
        ));
    }
    if params.router_active && !params.has_isolated_codex_home {
        return Err(PreflightBlockedReason::GlobalRouterActiveConflict);
    }
    if params.managed_cli_instances > 1 {
        return Err(PreflightBlockedReason::MultipleUnmanagedProcesses(
            params.managed_cli_instances,
        ));
    }
    if !params.candidate_valid {
        return Err(PreflightBlockedReason::CandidateAccountInvalid);
    }
    if params.candidate_account_id == params.active_account_id {
        return Err(PreflightBlockedReason::CandidateAlreadyActive);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
