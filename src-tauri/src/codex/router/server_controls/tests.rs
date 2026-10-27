use super::*;

fn free_port() -> u16 {
    let probe = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    probe.local_addr().unwrap().port()
}

async fn current_key(manager: &CodexRouterManager) -> String {
    manager
        .listener
        .lock()
        .await
        .as_ref()
        .unwrap()
        .secret
        .to_string()
}

#[test]
fn rejects_privileged_ports_only() {
    assert!(validate_router_port(Some(80)).is_err());
    assert!(validate_router_port(Some(1024)).is_ok());
    assert!(validate_router_port(None).is_ok());
}

#[test]
fn keeps_router_tags_and_newest_lines() {
    let lines: Vec<String> = vec![
        "[10:00:00] [INFO] [window] moved".into(),
        "[10:00:01] [INFO] [codex_pool] request in method=POST path=/responses".into(),
        "[10:00:02] [WARN] [codex_router] event=precommit_failover".into(),
        "[10:00:03] [INFO] [router_server] Router stopped".into(),
    ];
    let all = filter_router_logs(&lines, None);
    assert_eq!(all.len(), 3);
    assert!(all.iter().all(|line| !line.contains("[window]")));
    assert_eq!(filter_router_logs(&lines, Some(1)), vec![lines[3].clone()]);
}

#[tokio::test]
async fn restart_moves_to_requested_port_with_new_key() {
    let manager = CodexRouterManager::default();
    manager.start_listener().await.unwrap();
    let old_key = current_key(&manager).await;
    let port = free_port();

    let status = manager
        .restart_listener(Some(port), true, Some(true))
        .await
        .unwrap();
    assert_eq!(status.port, Some(port));
    assert_eq!(status.base_url, Some(format!("http://127.0.0.1:{port}")));
    assert_ne!(current_key(&manager).await, old_key);

    manager.stop_listener().await.unwrap();
}

#[tokio::test]
async fn plain_restart_keeps_port_and_key() {
    let manager = CodexRouterManager::default();
    let before = manager.start_listener().await.unwrap();
    let old_key = current_key(&manager).await;

    let after = manager
        .restart_listener(before.port, false, None)
        .await
        .unwrap();
    assert_eq!(after.port, before.port);
    assert_eq!(current_key(&manager).await, old_key);

    manager.stop_listener().await.unwrap();
}

#[tokio::test]
async fn taken_saved_port_falls_back_to_random() {
    let manager = CodexRouterManager::default();
    let holder = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let taken = holder.local_addr().unwrap().port();

    let status = manager
        .start_listener_preferring(Some(taken))
        .await
        .unwrap();
    assert!(status.running);
    assert_ne!(status.port, Some(taken));

    manager.stop_listener().await.unwrap();
}

#[tokio::test]
async fn only_an_explicit_free_port_is_fixed() {
    let manager = CodexRouterManager::default();
    assert!(!manager.has_fixed_port().await);
    let random = manager.start_listener().await.unwrap();
    assert!(!manager.has_fixed_port().await);

    // Restarting on the current random port keeps it random.
    manager
        .restart_listener(random.port, false, None)
        .await
        .unwrap();
    assert!(!manager.has_fixed_port().await);

    manager
        .restart_listener(Some(free_port()), false, Some(true))
        .await
        .unwrap();
    assert!(manager.has_fixed_port().await);
    let fixed = manager.status().await.port;
    manager.restart_listener(fixed, true, None).await.unwrap();
    assert!(
        manager.has_fixed_port().await,
        "plain restart keeps it fixed"
    );

    manager.stop_listener().await.unwrap();
    assert!(!manager.has_fixed_port().await);
}

#[tokio::test]
async fn fallback_after_taken_saved_port_is_not_fixed() {
    let manager = CodexRouterManager::default();
    let holder = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let taken = holder.local_addr().unwrap().port();
    manager
        .start_listener_preferring(Some(taken))
        .await
        .unwrap();
    assert!(!manager.has_fixed_port().await);
    manager.stop_listener().await.unwrap();

    let free = free_port();
    manager.start_listener_preferring(Some(free)).await.unwrap();
    assert!(manager.has_fixed_port().await);
    manager.stop_listener().await.unwrap();
}

#[tokio::test]
async fn taken_port_leaves_running_router_untouched() {
    let manager = CodexRouterManager::default();
    let before = manager.start_listener().await.unwrap();
    let old_key = current_key(&manager).await;
    let holder = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let taken = holder.local_addr().unwrap().port();

    let error = manager
        .restart_listener(Some(taken), true, Some(true))
        .await
        .unwrap_err();
    assert!(error.contains("unavailable"), "{error}");
    let after = manager.status().await;
    assert_eq!(after.port, before.port);
    assert_eq!(current_key(&manager).await, old_key);

    manager.stop_listener().await.unwrap();
}

#[tokio::test]
async fn apply_pins_the_current_random_port_and_restarts_keep_the_state() {
    let manager = CodexRouterManager::default();
    let random = manager.start_listener().await.unwrap();
    assert!(!manager.has_fixed_port().await);

    // Typing the port that is already live and clicking Apply pins it.
    manager
        .restart_listener(random.port, false, Some(true))
        .await
        .unwrap();
    assert!(manager.has_fixed_port().await);
    assert_eq!(manager.status().await.port, random.port);

    // Restart and Regenerate send no intent and keep the pinned state.
    manager
        .restart_listener(random.port, false, None)
        .await
        .unwrap();
    assert!(manager.has_fixed_port().await);
    manager
        .restart_listener(random.port, true, None)
        .await
        .unwrap();
    assert!(manager.has_fixed_port().await);

    // Apply with an empty port unpins; later plain restarts stay unpinned.
    manager
        .restart_listener(None, false, Some(false))
        .await
        .unwrap();
    assert!(!manager.has_fixed_port().await);
    let live = manager.status().await.port;
    manager.restart_listener(live, false, None).await.unwrap();
    assert!(!manager.has_fixed_port().await);

    let (base_url, fixed) = manager.endpoint().await.unwrap();
    assert!(base_url.starts_with("http://127.0.0.1:") && !fixed);
    manager.stop_listener().await.unwrap();
    assert!(manager.endpoint().await.is_none());
}
