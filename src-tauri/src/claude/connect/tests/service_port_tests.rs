use super::service::{binding_active, binding_moved, connect, list_connections};
use super::settings_patch::FIXED_PORT_REQUIRED;
use super::test_support::{env, input, manager, no_spawn, Dirs, FakeStore, BASE_URL, GOOD};

#[tokio::test]
async fn persistent_connect_is_refused_without_a_fixed_port() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let mut e = env(&m, &s, &d, &no_spawn);
    e.fixed_port = false;
    let err = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap_err();
    assert_eq!(err, FIXED_PORT_REQUIRED);
    assert!(err.contains("Router Server"), "{err}");
    assert!(!d.settings().exists(), "settings.json must stay untouched");
    assert!(s.live().is_empty());
    assert!(m.client_bindings.read().await.values().all(|b| b.revoked));
}

#[tokio::test]
async fn launch_once_is_allowed_on_any_port() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let mut e = env(&m, &s, &d, &no_spawn);
    e.fixed_port = false;
    let result = connect(&e, input(&d, "launch-once", GOOD)).await.unwrap();
    assert!(result.launched);
}

#[tokio::test]
async fn persistent_connect_is_allowed_on_a_fixed_port() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let id = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    assert!(binding_active(&m, &id).await);
}

#[tokio::test]
async fn list_reports_moved_when_router_address_changed() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap();

    let same = list_connections(&m, &s, &d.journals, Some(BASE_URL)).await;
    assert_eq!(same.len(), 1);
    assert!(same[0].connected && !same[0].gateway_moved);

    let moved = list_connections(&m, &s, &d.journals, Some("http://127.0.0.1:9999")).await;
    assert_eq!(moved.len(), 1);
    assert!(
        moved[0].gateway_moved,
        "journal URL differs from the router"
    );
    assert!(!moved[0].connected, "must not show Connected");
    assert!(!moved[0].cleanup_pending);

    // A stopped router is reported as stopped, not as moved.
    let stopped = list_connections(&m, &s, &d.journals, None).await;
    assert!(!stopped[0].connected && !stopped[0].gateway_moved);
    // The user's settings are never rewritten by listing.
    assert_eq!(d.read_settings()["env"]["ANTHROPIC_BASE_URL"], BASE_URL);
}

#[tokio::test]
async fn launch_once_is_never_reported_as_moved() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    connect(&e, input(&d, "launch-once", GOOD)).await.unwrap();
    let rows = list_connections(&m, &s, &d.journals, Some("http://127.0.0.1:9999")).await;
    assert_eq!(rows.len(), 1);
    assert!(rows[0].connected && !rows[0].gateway_moved);
}

#[tokio::test]
async fn binding_moved_follows_the_patched_address() {
    let (m, s, d) = (manager().await, FakeStore::default(), Dirs::new());
    let e = env(&m, &s, &d, &no_spawn);
    let id = connect(&e, input(&d, "persistent-profile", GOOD))
        .await
        .unwrap()
        .binding_id;
    assert!(!binding_moved(&d.journals, &id, Some(BASE_URL)));
    assert!(binding_moved(
        &d.journals,
        &id,
        Some("http://127.0.0.1:9999")
    ));
    assert!(
        !binding_moved(&d.journals, &id, None),
        "stopped is not moved"
    );
    let once = connect(&e, input(&d, "launch-once", GOOD))
        .await
        .unwrap()
        .binding_id;
    assert!(!binding_moved(
        &d.journals,
        &once,
        Some("http://127.0.0.1:9999")
    ));
}
