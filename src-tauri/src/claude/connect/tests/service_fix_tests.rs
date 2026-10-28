use super::service::{binding_active, connect, disconnect, dismiss_cleanup, list_connections};
use super::test_support::{env, input, manager, no_spawn, Dirs, FakeStore, BASE_URL, GOOD};
use serde_json::json;
use std::sync::atomic::Ordering;

const THEME: &str = r#"{"theme":"dark"}"#;

#[tokio::test]
async fn failed_reconnect_leaves_no_live_older_binding() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    std::fs::write(d.settings(), THEME).unwrap();
    let e = env(&m, &s, &d, &no_spawn);
    let first = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    s.fail_save.store(true, Ordering::SeqCst);
    let err = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap_err();
    assert!(err.contains("save failed"), "{err}");
    assert!(s.live().is_empty(), "no stored binding may stay live");
    assert!(!binding_active(&m, &first).await);
    assert!(m.client_bindings.read().await.values().all(|b| b.revoked));
    assert_eq!(d.read_settings(), json!({"theme": "dark"}));
}

#[tokio::test]
async fn disconnect_store_failure_persists_revoked_and_still_reverts() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    std::fs::write(d.settings(), THEME).unwrap();
    let e = env(&m, &s, &d, &no_spawn);
    let id = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    s.fail_delete.store(true, Ordering::SeqCst);
    let err = disconnect(&e, &id).await.unwrap_err();
    assert!(err.contains("stored gateway credential"), "{err}");
    assert!(!err.contains("conflict"));
    assert_eq!(d.read_settings(), json!({"theme": "dark"}));
    assert!(s.live().is_empty(), "binding must be stored as revoked");
    assert!(!binding_active(&m, &id).await);
}

#[tokio::test]
async fn revert_restores_exact_original_settings() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    for original in [THEME, r#"{"env":{"EXISTING":"keep"}}"#] {
        std::fs::write(d.settings(), original).unwrap();
        let e = env(&m, &s, &d, &no_spawn);
        let id = connect(&e, input(&d, "persistent-profile", GOOD))
            .await
            .unwrap()
            .binding_id;
        disconnect(&e, &id).await.unwrap();
        let expected: serde_json::Value = serde_json::from_str(original).unwrap();
        assert_eq!(d.read_settings(), expected);
    }
}

#[tokio::test]
async fn existing_user_token_blocks_connect_and_is_untouched() {
    for key in ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"] {
        for mode in ["persistent-profile", "launch-once"] {
            let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
            let original = format!(r#"{{"env":{{"{key}":"plain words"}}}}"#);
            std::fs::write(d.settings(), &original).unwrap();
            let e = env(&m, &s, &d, &no_spawn);
            let err = connect(&e, input(&d, mode, GOOD)).await.unwrap_err();
            assert!(err.contains(key), "{err}");
            assert!(!err.contains("plain words"), "value must not be echoed");
            assert_eq!(std::fs::read_to_string(d.settings()).unwrap(), original);
            assert!(s.live().is_empty());
        }
    }
}

#[tokio::test]
async fn connections_list_recovers_ids_without_secrets() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let persistent = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    let once = connect(&e, input(&d, "launch-once", GOOD))
        .await
        .unwrap()
        .binding_id;
    let secrets: Vec<String> = s.live().iter().map(|b| b.secret.clone()).collect();

    let list = list_connections(&m, &s, &d.journals, Some(BASE_URL)).await;
    assert_eq!(list.len(), 2);
    let find = |id: &str| list.iter().find(|c| c.binding_id == id).unwrap();
    assert_eq!(find(&persistent).mode, "persistent-profile");
    assert_eq!(find(&once).mode, "launch-once");
    assert!(list
        .iter()
        .all(|c| c.connected && c.profile_id == "prof_test"));
    let text = serde_json::to_string(&list).unwrap();
    assert!(secrets.iter().all(|secret| !text.contains(secret)));

    // A fresh router (restart) still lists the persistent binding, not connected.
    let fresh = manager().await;
    let after_restart = list_connections(&fresh, &s, &d.journals, None).await;
    assert_eq!(after_restart.len(), 1);
    assert_eq!(after_restart[0].binding_id, persistent);
    assert!(!after_restart[0].connected);

    disconnect(&e, &persistent).await.unwrap();
    disconnect(&e, &once).await.unwrap();
    assert!(list_connections(&m, &s, &d.journals, Some(BASE_URL))
        .await
        .is_empty());
}

#[tokio::test]
async fn revert_failure_on_disconnect_stays_listed_as_cleanup_pending_until_retried() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    std::fs::write(d.settings(), THEME).unwrap();
    let e = env(&m, &s, &d, &no_spawn);
    let id = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    let patched = std::fs::read_to_string(d.settings()).unwrap();
    std::fs::write(d.settings(), "not json").unwrap();

    let err = disconnect(&e, &id).await.unwrap_err();
    assert!(!err.contains("conflict"), "{err}");
    assert!(!binding_active(&m, &id).await, "token is revoked first");
    assert!(s.live().is_empty());
    let rows = list_connections(&m, &s, &d.journals, Some(BASE_URL)).await;
    assert_eq!(rows.len(), 1);
    assert!(rows[0].cleanup_pending && !rows[0].connected);
    assert_eq!(
        (rows[0].binding_id.as_str(), rows[0].profile_id.as_str()),
        (id.as_str(), "prof_test")
    );

    // Retry with only the journal id (no binding exists any more).
    std::fs::write(d.settings(), patched).unwrap();
    disconnect(&e, &rows[0].binding_id).await.unwrap();
    assert_eq!(d.read_settings(), json!({"theme": "dark"}));
    assert!(list_connections(&m, &s, &d.journals, Some(BASE_URL))
        .await
        .is_empty());
}

#[tokio::test]
async fn failed_rollback_returns_combined_error_and_keeps_journal() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    std::fs::write(d.settings(), THEME).unwrap();
    *s.corrupt_on_save.lock().unwrap() = Some(d.settings());
    let e = env(&m, &s, &d, &no_spawn);
    let err = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap_err();
    assert!(
        err.contains("save failed") && err.contains("reverting"),
        "{err}"
    );
    let rows = list_connections(&m, &s, &d.journals, Some(BASE_URL)).await;
    assert_eq!(rows.len(), 1);
    assert!(rows[0].cleanup_pending);
}

#[tokio::test]
async fn dismiss_unblocks_a_conflicted_profile_without_touching_settings() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let id = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    let mut edited = d.read_settings();
    edited["apiKeyHelper"] = json!("user-owned-helper");
    std::fs::write(d.settings(), edited.to_string()).unwrap();

    let err = disconnect(&e, &id).await.unwrap_err();
    assert!(
        err.contains("apiKeyHelper") && err.contains("Dismiss"),
        "{err}"
    );
    assert!(
        !err.contains("user-owned-helper"),
        "values are never echoed"
    );
    let blocked = connect(&e, input(&d, "persistent-profile", GOOD)).await;
    assert!(blocked.unwrap_err().contains("could not be undone"));

    let before = std::fs::read(d.settings()).unwrap();
    dismiss_cleanup(&e, &id).await.unwrap();
    assert_eq!(std::fs::read(d.settings()).unwrap(), before);
    assert!(list_connections(&m, &s, &d.journals, Some(BASE_URL))
        .await
        .is_empty());
    assert!(!d.journals.join(format!("{id}.json")).exists());

    connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .expect("profile can be reconnected after Dismiss");
}

#[tokio::test]
async fn dismiss_rejects_unsafe_ids() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    for bad in ["../evil", "a/b", "", "a b"] {
        assert!(dismiss_cleanup(&e, bad).await.is_err(), "{bad}");
    }
}
