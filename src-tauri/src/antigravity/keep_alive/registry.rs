use crate::types::AntigravityRefreshedTokens;
use serde::{Deserialize, Serialize};
use std::future::Future;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityKeepAliveAccount {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub auth_method: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityKeepAliveTokenUpdate {
    pub account_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub auth_method: Option<String>,
}

pub fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn normalize_account(
    mut account: AntigravityKeepAliveAccount,
) -> Option<AntigravityKeepAliveAccount> {
    account.account_id = account.account_id.trim().to_string();
    account.access_token = account.access_token.trim().to_string();
    account.refresh_token = normalize_optional(account.refresh_token);
    account.auth_method = normalize_optional(account.auth_method);

    if account.account_id.is_empty()
        || (account.access_token.is_empty() && account.refresh_token.is_none())
    {
        return None;
    }
    Some(account)
}

pub fn normalized_accounts(
    accounts: Vec<AntigravityKeepAliveAccount>,
) -> Vec<AntigravityKeepAliveAccount> {
    let mut normalized: Vec<AntigravityKeepAliveAccount> = Vec::new();

    for account in accounts.into_iter().filter_map(normalize_account) {
        if let Some(index) = normalized
            .iter()
            .position(|existing| existing.account_id == account.account_id)
        {
            normalized[index] = account;
        } else {
            normalized.push(account);
        }
    }

    normalized
}

pub fn reconcile_accounts(
    previous: &[AntigravityKeepAliveAccount],
    incoming: Vec<AntigravityKeepAliveAccount>,
) -> (
    Vec<AntigravityKeepAliveAccount>,
    Vec<AntigravityKeepAliveAccount>,
) {
    let next = normalized_accounts(incoming);
    let changed = next
        .iter()
        .filter(|account| {
            previous
                .iter()
                .find(|existing| existing.account_id == account.account_id)
                != Some(*account)
        })
        .cloned()
        .collect();
    (next, changed)
}

pub fn merge_refreshed_tokens(
    account: &mut AntigravityKeepAliveAccount,
    refreshed: AntigravityRefreshedTokens,
) -> Option<AntigravityKeepAliveTokenUpdate> {
    let access_token = refreshed.access_token.trim().to_string();
    if access_token.is_empty() {
        return None;
    }

    account.access_token = access_token.clone();
    let refresh_token = normalize_optional(refreshed.refresh_token);
    if let Some(value) = refresh_token.clone() {
        account.refresh_token = Some(value);
    }
    let auth_method = normalize_optional(refreshed.auth_method);
    if let Some(value) = auth_method.clone() {
        account.auth_method = Some(value);
    }

    Some(AntigravityKeepAliveTokenUpdate {
        account_id: account.account_id.clone(),
        access_token,
        refresh_token,
        auth_method,
    })
}

pub async fn run_each_account<F, Fut>(
    accounts: Vec<AntigravityKeepAliveAccount>,
    mut maintain: F,
) -> Vec<(String, Result<String, String>)>
where
    F: FnMut(AntigravityKeepAliveAccount) -> Fut,
    Fut: Future<Output = Result<String, String>>,
{
    let mut results = Vec::with_capacity(accounts.len());
    for account in accounts {
        let account_id = account.account_id.clone();
        results.push((account_id, maintain(account).await));
    }
    results
}
