use std::path::PathBuf;

fn repo_file(path: &str) -> String {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let full_path = manifest.join(path);
    let mut content = std::fs::read_to_string(&full_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {}", full_path.display(), error))
        .replace("\r\n", "\n");
    if path.ends_with("App.tsx") {
        let submodules = [
            "../src/components/app/AppModals.tsx",
            "../src/components/app/AppTabBar.tsx",
            "../src/hooks/app/useAppCoordinator.ts",
            "../src/hooks/app/useAppBackups.ts",
            "../src/hooks/codex/useCodexModelScanManager.ts",
            "../src/hooks/codex/useCodexRouterManager.ts",
            "../src/hooks/app/useAppAccountOperations.ts",
            "../src/hooks/antigravity/useAntigravityAccountOps.ts",
            "../src/hooks/codex/useCodexAccountOps.ts",
            "../src/hooks/codex/useCodexUsageFetcher.ts",
            "../src/hooks/app/useAppUsageAndOverlay.ts",
            "../src/hooks/app/useAppSessionBootstrap.ts",
            "../src/hooks/app/useAppUpdateCheck.ts",
            "../src/hooks/app/useAppEventListeners.ts",
            "../src/utils/common/app-overlay-helpers.ts",
        ];
        for sub in submodules {
            let sub_path = manifest.join(sub);
            if let Ok(sub_content) = std::fs::read_to_string(&sub_path) {
                content.push('\n');
                content.push_str(&sub_content.replace("\r\n", "\n"));
            }
        }
    }
    content
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
    assert!(
        helper.contains("isAccountPollingSuspended"),
        "auth-suspended accounts must not fall through into the exact worker fallback"
    );

    let startup = source_slice(
        &app,
        "const agAccounts = loadAntigravityAccounts();",
        "checkForUpdates();",
    );
    assert!(
        startup.contains("refreshAntigravityAccountsCloudFirst(agAccounts, false)"),
        "startup must use normal polling semantics so re-auth-suspended accounts stay out of the refresh list"
    );
    assert!(
        !startup.contains("refreshExactAntigravityAccounts(agAccounts, true)"),
        "startup must not launch exact workers before trying remote grouped quota"
    );

    let idle_poll = source_slice(
        &app,
        "const refreshVisibleIdlePlatforms = () => {",
        "const timer = window.setInterval(",
    );
    assert!(
        idle_poll
            .contains("refreshAntigravityAccountsCloudFirst(loadAntigravityAccounts(), false)"),
        "normal idle polling must use the remote-first path without bypassing re-auth suspension"
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

    let add_modal = source_slice(&app, "<AddAntigravityAccountModal", "<PassphraseModal");
    assert!(
        add_modal.contains("await refreshAntigravityAccountsCloudFirst([target], true);"),
        "a newly added Antigravity account must request grouped remote weekly quota before exact fallback"
    );
}

#[test]
fn windows_exact_worker_can_discover_non_default_antigravity_installations() {
    let executable = repo_file("src/system/session/executable.rs");

    assert!(
        executable.contains("ExecutablePath"),
        "Windows executable discovery should reuse the path of a running Antigravity process"
    );
    assert!(
        executable.contains("ProgramFiles"),
        "Windows executable discovery should search system install directories as well as LOCALAPPDATA"
    );
}
