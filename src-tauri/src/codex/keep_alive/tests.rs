use super::registry::*;

#[test]
fn normalize_account_discards_empty_ids_or_keys() {
    let empty_id = CodexKeepAliveAccount {
        account_id: "".to_string(),
        api_key: "sk-test".to_string(),
        email: None,
    };
    assert!(normalize_account(empty_id).is_none());

    let empty_key = CodexKeepAliveAccount {
        account_id: "acc-1".to_string(),
        api_key: "   ".to_string(),
        email: None,
    };
    assert!(normalize_account(empty_key).is_none());

    let valid = CodexKeepAliveAccount {
        account_id: "  acc-1  ".to_string(),
        api_key: "  sk-valid  ".to_string(),
        email: Some("  test@example.com  ".to_string()),
    };
    let normalized = normalize_account(valid).unwrap();
    assert_eq!(normalized.account_id, "acc-1");
    assert_eq!(normalized.api_key, "sk-valid");
    assert_eq!(normalized.email.as_deref(), Some("test@example.com"));
}

#[test]
fn reconcile_accounts_identifies_new_and_changed_entries() {
    let initial = vec![CodexKeepAliveAccount {
        account_id: "acc-1".to_string(),
        api_key: "key-1".to_string(),
        email: None,
    }];

    let incoming = vec![
        CodexKeepAliveAccount {
            account_id: "acc-1".to_string(),
            api_key: "key-1-updated".to_string(),
            email: None,
        },
        CodexKeepAliveAccount {
            account_id: "acc-2".to_string(),
            api_key: "key-2".to_string(),
            email: Some("acc2@test.com".to_string()),
        },
    ];

    let (next, changed) = reconcile_accounts(&initial, incoming);
    assert_eq!(next.len(), 2);
    assert_eq!(changed.len(), 2);
    assert_eq!(changed[0].account_id, "acc-1");
    assert_eq!(changed[0].api_key, "key-1-updated");
    assert_eq!(changed[1].account_id, "acc-2");
}
