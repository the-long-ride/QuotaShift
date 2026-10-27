use std::collections::HashSet;
use std::fmt;

use super::types::{CliProvider, CliRotationBindingsV1, CliRotationPoolV1};

#[derive(Debug, PartialEq, Eq)]
pub enum PoolValidationError {
    MissingId,
    MissingName,
    DuplicateAccount(String),
    InvalidAccount(String),
    InsufficientAccounts(usize),
    ConflictingActiveBinding(CliProvider),
    InactivePoolBound,
}

impl fmt::Display for PoolValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingId => write!(f, "Pool ID cannot be empty"),
            Self::MissingName => write!(f, "Pool name cannot be empty"),
            Self::DuplicateAccount(id) => write!(f, "Duplicate account ID found: {id}"),
            Self::InvalidAccount(id) => {
                write!(f, "Account not found or belongs to another provider: {id}")
            }
            Self::InsufficientAccounts(count) => {
                write!(
                    f,
                    "Enabled auto-switching pool requires at least 2 accounts, found {count}"
                )
            }
            Self::ConflictingActiveBinding(provider) => {
                write!(f, "Multiple active pools bound for provider {provider:?}")
            }
            Self::InactivePoolBound => write!(f, "Active pool must be enabled"),
        }
    }
}

impl std::error::Error for PoolValidationError {}

pub struct AccountMeta<'a> {
    pub id: &'a str,
    pub provider: CliProvider,
}

pub fn validate_cli_pool(
    pool: &CliRotationPoolV1,
    known_accounts: &[AccountMeta],
    active_bindings: Option<&CliRotationBindingsV1>,
) -> Result<(), PoolValidationError> {
    if pool.id.trim().is_empty() {
        return Err(PoolValidationError::MissingId);
    }
    if pool.name.trim().is_empty() {
        return Err(PoolValidationError::MissingName);
    }

    let mut seen = HashSet::new();
    for acc_id in &pool.account_ids {
        if !seen.insert(acc_id.as_str()) {
            return Err(PoolValidationError::DuplicateAccount(acc_id.clone()));
        }
        let matching = known_accounts
            .iter()
            .find(|a| a.id == acc_id && a.provider == pool.provider);
        if matching.is_none() {
            return Err(PoolValidationError::InvalidAccount(acc_id.clone()));
        }
    }

    if pool.enabled && pool.auto_switch && pool.account_ids.len() < 2 {
        return Err(PoolValidationError::InsufficientAccounts(
            pool.account_ids.len(),
        ));
    }

    if let Some(bindings) = active_bindings {
        let is_bound = match pool.provider {
            CliProvider::Agy => bindings.agy_active_pool_id.as_deref() == Some(&pool.id),
            CliProvider::Codex => bindings.codex_active_pool_id.as_deref() == Some(&pool.id),
        };
        if is_bound && !pool.enabled {
            return Err(PoolValidationError::InactivePoolBound);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests;
