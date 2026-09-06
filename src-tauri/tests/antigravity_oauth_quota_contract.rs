use std::path::PathBuf;

fn repo_file(path: &str) -> String {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let full_path = manifest.join(path);
    std::fs::read_to_string(&full_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {}", full_path.display(), error))
}

#[test]
fn oauth_requests_antigravity_cloud_scopes() {
    let oauth = repo_file("src/oauth.rs");

    for scope in [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/cclog",
        "https://www.googleapis.com/auth/experimentsandconfigs",
    ] {
        assert!(oauth.contains(scope), "missing Antigravity OAuth scope: {scope}");
    }
}

#[test]
fn token_refresh_preserves_original_antigravity_scopes() {
    let quota = repo_file("src/quota.rs");

    assert!(
        !quota.contains("params.push((\"scope\""),
        "refreshing an Antigravity OAuth token must not narrow the original grant scopes"
    );
}

#[test]
fn cloud_code_uses_prod_for_project_discovery_and_daily_for_quota() {
    let remote = repo_file("src/antigravity_remote.rs");

    assert!(
        remote.contains("https://cloudcode-pa.googleapis.com"),
        "loadCodeAssist must use PROD Cloud Code"
    );
    assert!(
        remote.contains("https://daily-cloudcode-pa.googleapis.com"),
        "fetchAvailableModels must use DAILY Cloud Code"
    );
    assert!(
        remote.contains("FULL_ELIGIBILITY_CHECK"),
        "loadCodeAssist must request full Antigravity eligibility"
    );
    assert!(
        remote.contains("antigravity/ide/"),
        "quota calls must use an Antigravity IDE user-agent"
    );
    assert!(
        !remote.contains("antigravity/cli/2.0"),
        "QuotaShift must not identify OAuth quota calls as antigravity/cli/2.0"
    );
}

#[test]
fn oauth_cloud_quota_does_not_fabricate_weekly_from_retrieve_user_quota() {
    let usage = repo_file("src/antigravity_usage.rs");
    let aggregation = repo_file("src/antigravity_quota.rs");
    let frontend = repo_file("../src/components/AntigravityTab.tsx");

    assert!(
        !usage.contains(".retrieve_user_quota("),
        "saved-account OAuth cloud quota must not depend on retrieveUserQuota"
    );
    assert!(
        !aggregation.contains("applied as a shared five-hour and weekly quota"),
        "an unlabeled quota bucket must not be copied into the weekly lane"
    );
    assert!(
        frontend.contains("Unavailable") && frontend.contains("Not available"),
        "missing quota windows must render as unavailable"
    );
}
