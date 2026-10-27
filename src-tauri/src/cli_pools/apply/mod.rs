use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;

use super::types::CliProvider;
use crate::codex_sync::write_codex_auth_value_at;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedIdentity {
    pub provider: CliProvider,
    pub account_id: String,
    pub applied_at: u64,
    pub previous_account_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApplyError {
    RuntimeIntegrationUnavailable(CliProvider),
    AccountNotFound(String),
    CredentialsMissingOrInvalid(String),
    AuthDomainConflict(String),
    PersistenceFailed(String),
    EffectiveIdentityMismatch { expected: String, actual: String },
}

pub fn apply_codex_credentials_at(
    path: &Path,
    account_id: &str,
    creds: &Value,
) -> Result<(), ApplyError> {
    if creds.is_null() {
        return Err(ApplyError::CredentialsMissingOrInvalid(
            account_id.to_string(),
        ));
    }

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    write_codex_auth_value_at(path, creds).map_err(ApplyError::PersistenceFailed)
}

pub fn apply_cli_credentials(
    provider: CliProvider,
    account_id: &str,
    _previous_account_id: Option<&str>,
    creds: &Value,
    _now: u64,
) -> Result<AppliedIdentity, ApplyError> {
    if creds.is_null() {
        return Err(ApplyError::CredentialsMissingOrInvalid(
            account_id.to_string(),
        ));
    }

    // A safe handoff needs the secure account service and verified effective identity.
    // Until that adapter exists, never write the user's global auth file or claim success.
    Err(ApplyError::RuntimeIntegrationUnavailable(provider))
}

#[cfg(test)]
mod tests;
