use serde::{Deserialize, Serialize};
use std::future::Future;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexKeepAliveAccount {
    pub account_id: String,
    pub api_key: String,
    pub email: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexKeepAliveTokenUpdate {
    pub account_id: String,
    pub api_key: String,
}

pub fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn normalize_account(mut account: CodexKeepAliveAccount) -> Option<CodexKeepAliveAccount> {
    account.account_id = account.account_id.trim().to_string();
    account.api_key = account.api_key.trim().to_string();
    account.email = normalize_optional(account.email);

    if account.account_id.is_empty() || account.api_key.is_empty() {
        return None;
    }
    Some(account)
}

pub fn normalized_accounts(accounts: Vec<CodexKeepAliveAccount>) -> Vec<CodexKeepAliveAccount> {
    let mut normalized: Vec<CodexKeepAliveAccount> = Vec::new();

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
    previous: &[CodexKeepAliveAccount],
    incoming: Vec<CodexKeepAliveAccount>,
) -> (Vec<CodexKeepAliveAccount>, Vec<CodexKeepAliveAccount>) {
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

pub async fn run_each_account<F, Fut>(
    accounts: Vec<CodexKeepAliveAccount>,
    mut maintain: F,
) -> Vec<(String, Result<String, String>)>
where
    F: FnMut(CodexKeepAliveAccount) -> Fut,
    Fut: Future<Output = Result<String, String>>,
{
    let mut results = Vec::with_capacity(accounts.len());
    for account in accounts {
        let account_id = account.account_id.clone();
        results.push((account_id, maintain(account).await));
    }
    results
}
