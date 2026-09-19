use super::*;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_root(label: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("quotashift-claude-accounts-{label}-{suffix}"))
}

#[test]
fn candidate_discovery_includes_default_siblings_profile_store_and_shell_assignment() {
    let home = temp_root("candidates");
    fs::create_dir_all(home.join(".claude")).unwrap();
    fs::create_dir_all(home.join(".claude-work")).unwrap();
    fs::create_dir_all(home.join("claude-profiles").join("partner")).unwrap();
    fs::write(
        home.join(".zshrc"),
        "export CLAUDE_CONFIG_DIR=\"~/.claude-shell\"\n",
    )
    .unwrap();

    let dirs = candidate_dirs_at(&home, None);
    assert!(dirs.contains(&home.join(".claude")));
    assert!(dirs.contains(&home.join(".claude-work")));
    assert!(dirs.contains(&home.join("claude-profiles").join("partner")));
    assert!(dirs.contains(&home.join(".claude-shell")));
    let _ = fs::remove_dir_all(home);
}

#[test]
fn scanner_returns_only_subscription_metadata_and_stable_config_identity() {
    let home = temp_root("scan");
    let profile = home.join(".claude-work");
    fs::create_dir_all(&profile).unwrap();
    fs::write(
        profile.join(".credentials.json"),
        r#"{"claudeAiOauth":{"subscriptionType":"max","rateLimitTier":"tier_1","expiresAt":4102444800000,"accessToken":"secret","email":"work@example.com"}}"#,
    ).unwrap();

    let accounts = scan_claude_accounts_at(&home, vec![profile.clone()]);
    assert_eq!(accounts.len(), 1);
    let account = &accounts[0];
    assert_eq!(account.profile_name, "work");
    assert_eq!(account.subscription_type.as_deref(), Some("max"));
    assert_eq!(account.email.as_deref(), Some("work@example.com"));
    let json = serde_json::to_string(account).unwrap();
    assert!(!json.contains("accessToken"));
    assert!(account.id.starts_with("claude-"));
    assert_eq!(account.config_dir, profile.to_string_lossy());
    let _ = fs::remove_dir_all(home);
}

#[test]
fn visible_profiles_use_fast_or_idle_polling_instead_of_stopping() {
    let active = HashSet::from(["c:/profiles/a".to_string()]);

    assert_eq!(
        profile_refresh_interval_secs(
            "account-a",
            "c:/profiles/a",
            false,
            None,
            None,
            &active,
            20,
            600,
            false,
        ),
        Some(20)
    );
    assert_eq!(
        profile_refresh_interval_secs(
            "account-b",
            "c:/profiles/b",
            false,
            None,
            None,
            &active,
            20,
            600,
            false,
        ),
        Some(600)
    );
    assert_eq!(
        profile_refresh_interval_secs(
            "account-a",
            "c:/profiles/a",
            true,
            None,
            None,
            &active,
            20,
            600,
            false,
        ),
        Some(600)
    );
}

#[test]
fn monitored_profile_uses_fast_rate_while_other_profiles_stay_on_idle_rate() {
    let active = HashSet::new();

    assert_eq!(
        profile_refresh_interval_secs(
            "account-a",
            "c:/profiles/a",
            false,
            Some("account-a"),
            None,
            &active,
            30,
            900,
            false,
        ),
        Some(30)
    );
    assert_eq!(
        profile_refresh_interval_secs(
            "account-b",
            "c:/profiles/b",
            false,
            Some("account-a"),
            None,
            &active,
            30,
            900,
            false,
        ),
        Some(900)
    );
}

#[test]
fn manual_refresh_targets_only_requested_profile_and_still_skips_suspended_profiles() {
    let active = HashSet::from(["c:/profiles/a".to_string(), "c:/profiles/b".to_string()]);

    assert_eq!(
        profile_refresh_interval_secs(
            "account-a",
            "c:/profiles/a",
            false,
            None,
            Some("account-b"),
            &active,
            1,
            600,
            false,
        ),
        None
    );
    assert_eq!(
        profile_refresh_interval_secs(
            "account-b",
            "c:/profiles/b",
            false,
            None,
            Some("account-b"),
            &active,
            1,
            600,
            false,
        ),
        Some(1)
    );
    assert_eq!(
        profile_refresh_interval_secs(
            "account-b",
            "c:/profiles/b",
            true,
            None,
            Some("account-b"),
            &active,
            1,
            600,
            false,
        ),
        None
    );
}
