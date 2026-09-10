use super::*;
use std::sync::{Arc, Mutex as TestMutex};

fn account(id: &str, access_token: &str) -> AntigravityKeepAliveAccount {
    AntigravityKeepAliveAccount {
        account_id: id.to_string(),
        access_token: access_token.to_string(),
        refresh_token: Some(format!("refresh-{id}")),
        auth_method: Some("oauth".to_string()),
    }
}

#[test]
fn normalized_registry_deduplicates_and_drops_empty_credentials() {
    let normalized = normalized_accounts(vec![
        account("a", "token-1"),
        account("a", "token-2"),
        AntigravityKeepAliveAccount {
            account_id: "empty".to_string(),
            access_token: "".to_string(),
            refresh_token: None,
            auth_method: None,
        },
    ]);

    assert_eq!(normalized.len(), 1);
    assert_eq!(normalized[0].account_id, "a");
    assert_eq!(normalized[0].access_token, "token-2");
}

#[test]
fn reconciliation_removes_deleted_accounts_and_only_marks_changes() {
    let previous = vec![account("removed", "old"), account("kept", "same")];
    let incoming = vec![account("kept", "same"), account("added", "new")];
    let (next, changed) = reconcile_accounts(&previous, incoming);

    assert_eq!(
        next.iter()
            .map(|account| account.account_id.as_str())
            .collect::<Vec<_>>(),
        vec!["kept", "added"]
    );
    assert_eq!(changed.len(), 1);
    assert_eq!(changed[0].account_id, "added");
}

#[test]
fn refreshed_credentials_update_access_and_preserve_unrotated_refresh_token() {
    let mut account = account("a", "old-access");
    let update = merge_refreshed_tokens(
        &mut account,
        AntigravityRefreshedTokens {
            access_token: "new-access".to_string(),
            refresh_token: None,
            expires_in: Some(3600),
            auth_method: None,
        },
    )
    .expect("refresh update");

    assert_eq!(account.access_token, "new-access");
    assert_eq!(account.refresh_token.as_deref(), Some("refresh-a"));
    assert_eq!(update.access_token, "new-access");
    assert_eq!(update.refresh_token, None);
}

#[test]
fn refreshed_credentials_propagate_rotated_refresh_token_and_auth_method() {
    let mut account = account("a", "old-access");
    let update = merge_refreshed_tokens(
        &mut account,
        AntigravityRefreshedTokens {
            access_token: "new-access".to_string(),
            refresh_token: Some("new-refresh".to_string()),
            expires_in: Some(3600),
            auth_method: Some("google".to_string()),
        },
    )
    .expect("refresh update");

    assert_eq!(account.refresh_token.as_deref(), Some("new-refresh"));
    assert_eq!(account.auth_method.as_deref(), Some("google"));
    assert_eq!(update.refresh_token.as_deref(), Some("new-refresh"));
    assert_eq!(update.auth_method.as_deref(), Some("google"));
}

#[tokio::test]
async fn failed_account_does_not_skip_following_accounts() {
    let seen = Arc::new(TestMutex::new(Vec::new()));
    let seen_for_run = Arc::clone(&seen);
    let results = run_each_account(
        vec![account("bad", "x"), account("good", "y")],
        move |account| {
            let seen = Arc::clone(&seen_for_run);
            async move {
                seen.lock().unwrap().push(account.account_id.clone());
                if account.account_id == "bad" {
                    Err("expired".to_string())
                } else {
                    Ok("ok".to_string())
                }
            }
        },
    )
    .await;

    assert_eq!(
        &*seen.lock().unwrap(),
        &["bad".to_string(), "good".to_string()]
    );
    assert!(results[0].1.is_err());
    assert!(results[1].1.is_ok());
}
