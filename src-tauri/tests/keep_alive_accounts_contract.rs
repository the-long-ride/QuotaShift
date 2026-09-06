use std::path::PathBuf;

fn repo_file(path: &str) -> String {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let full_path = manifest.join(path);
    std::fs::read_to_string(&full_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {}", full_path.display(), error))
}

#[test]
fn backend_exposes_multi_account_antigravity_keep_alive_contract() {
    let keep_alive = repo_file("src/antigravity_keep_alive.rs");
    let lib = repo_file("src/lib.rs");

    assert!(
        keep_alive.contains("AntigravityKeepAliveAccount"),
        "backend must define a monitored Antigravity account payload"
    );
    assert!(
        keep_alive.contains("sync_antigravity_accounts"),
        "backend must expose account-registry synchronization"
    );
    assert!(
        keep_alive.contains("maintain_registered_antigravity_accounts"),
        "backend must maintain every registered Antigravity account"
    );
    assert!(
        keep_alive.contains("antigravity-keep-alive-tokens"),
        "backend must emit refreshed monitored-account credentials"
    );
    assert!(
        lib.contains("sync_antigravity_keep_alive_accounts"),
        "Tauri must expose account-registry synchronization to the frontend"
    );
}

#[test]
fn frontend_syncs_saved_accounts_and_consumes_refreshed_tokens() {
    let bridge = repo_file("../src/utils/antigravity-keep-alive.ts");
    let main = repo_file("../src/main.tsx");

    assert!(
        bridge.contains("sync_antigravity_keep_alive_accounts"),
        "frontend bridge must synchronize all saved Antigravity accounts"
    );
    assert!(
        bridge.contains("antigravity-keep-alive-tokens"),
        "frontend bridge must persist credentials refreshed by background keep-alive"
    );
    assert!(
        main.contains("notifyAntigravityKeepAliveStorageChange"),
        "storage writes must notify the keep-alive registry bridge"
    );
}
