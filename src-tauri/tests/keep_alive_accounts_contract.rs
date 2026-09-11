use std::path::PathBuf;

fn repo_file(path: &str) -> String {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let full_path = manifest.join(path);
    std::fs::read_to_string(&full_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {}", full_path.display(), error))
}

fn source_slice<'a>(source: &'a str, start: &str, end: &str) -> &'a str {
    let start_index = source
        .find(start)
        .unwrap_or_else(|| panic!("missing source marker: {start}"));
    let tail = &source[start_index..];
    let end_index = tail
        .find(end)
        .unwrap_or_else(|| panic!("missing source marker: {end}"));
    &tail[..end_index]
}

#[test]
fn backend_exposes_multi_account_antigravity_keep_alive_contract() {
    let keep_alive = repo_file("src/antigravity/keep_alive.rs");
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
    let bridge = repo_file("../src/utils/antigravity/antigravity-keep-alive.ts");
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

#[test]
fn frontend_prefers_remote_grouped_weekly_quota_before_exact_worker_fallback() {
    let ops = repo_file("../src/utils/antigravity/app-antigravity-ops.ts");
    let app = repo_file("../src/App.tsx");

    let helper_start = ops
        .find("export const refreshAntigravityAccountsCloudFirst = async")
        .expect("missing refreshAntigravityAccountsCloudFirst in app-antigravity-ops.ts");
    let helper = &ops[helper_start..];
    let cloud_call = helper
        .find("fetchAntigravityAccountQuota")
        .expect("cloud-first helper must request remote Antigravity quota");
    let exact_call = helper
        .find("refreshExactAntigravityAccounts")
        .expect("cloud-first helper must retain exact worker fallback");
    assert!(
        cloud_call < exact_call,
        "remote quota summary must be attempted before launching an isolated Antigravity worker"
    );
    assert!(
        helper.contains("exact_grouped"),
        "a grouped cloud summary must suppress the executable-dependent exact fallback"
    );

    let startup = source_slice(
        &app,
        "const agAccounts = loadAntigravityAccounts();",
        "checkForUpdates();",
    );
    assert!(
        startup.contains("refreshAntigravityAccountsCloudFirst(agAccounts, true)"),
        "startup must prefer remote grouped 5-hour + weekly quota for all saved accounts"
    );
    assert!(
        !startup.contains("refreshExactAntigravityAccounts(agAccounts, true)"),
        "startup must not launch exact workers before trying remote grouped quota"
    );

    let listener = source_slice(
        &app,
        "const setupListeners = async () => {",
        "const uWindow = await listen<boolean>",
    );
    assert!(
        listener.contains(
            "refreshAntigravityAccountsCloudFirst(loadAntigravityAccounts(), true).catch(console.error);"
        ),
        "normal polling must use the same remote-first quota path"
    );
}

#[test]
fn frontend_uses_remote_first_weekly_refresh_when_tracking_or_adding_an_account() {
    let app = repo_file("../src/App.tsx");

    let track = source_slice(
        &app,
        "const handleTrackAntigravityAccount = async",
        "const handleTrackCodexAccount",
    );
    assert!(
        track.contains("await refreshAntigravityAccountsCloudFirst([acc], true);"),
        "tracking an Antigravity card must request grouped remote weekly quota before exact fallback"
    );

    let add_modal = source_slice(
        &app,
        "<AddAntigravityAccountModal",
        "{/* Export / Import Passphrase Modal */}",
    );
    assert!(
        add_modal.contains("await refreshAntigravityAccountsCloudFirst([target], true);"),
        "a newly added Antigravity account must request grouped remote weekly quota before exact fallback"
    );
}

#[test]
fn windows_exact_worker_can_discover_non_default_antigravity_installations() {
    let session = repo_file("src/system/session.rs");

    assert!(
        session.contains("ExecutablePath"),
        "Windows executable discovery should reuse the path of a running Antigravity process"
    );
    assert!(
        session.contains("ProgramFiles"),
        "Windows executable discovery should search system install directories as well as LOCALAPPDATA"
    );
}
