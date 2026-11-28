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
    assert!(account.authenticated);
    assert_eq!(account.launcher_command, None);
    let _ = fs::remove_dir_all(home);
}

#[test]
fn candidate_discovery_includes_managed_quotashift_claude_profiles() {
    let home = temp_root("managed-candidates");
    let managed = home
        .join(".quotashift")
        .join("claude-profiles")
        .join("work");
    fs::create_dir_all(&managed).unwrap();

    let dirs = candidate_dirs_at(&home, None);
    assert!(dirs.contains(&managed));
    let _ = fs::remove_dir_all(home);
}

#[test]
fn scanner_emits_unauthenticated_managed_profile_and_upgrades_same_id_after_login() {
    let home = temp_root("managed-lifecycle");
    let profile = home
        .join(".quotashift")
        .join("claude-profiles")
        .join("work");
    fs::create_dir_all(&profile).unwrap();
    fs::write(profile.join("settings.json"), "{}\n").unwrap();

    let before = scan_claude_accounts_at(&home, candidate_dirs_at(&home, None));
    assert_eq!(before.len(), 1);
    assert!(!before[0].authenticated);
    assert_eq!(before[0].profile_name, "work");
    assert_eq!(before[0].subscription_type, None);
    assert_eq!(before[0].launcher_command.as_deref(), Some("claude-work"));
    assert_eq!(before[0].source, "managed");
    let unauth_id = before[0].id.clone();

    fs::write(
        profile.join(".credentials.json"),
        r#"{"claudeAiOauth":{"subscriptionType":"pro","rateLimitTier":"default_claude_pro","expiresAt":4102444800000,"accessToken":"secret"}}"#,
    )
    .unwrap();
    fs::write(
        profile.join(".claude.json"),
        r#"{"oauthAccount":{"emailAddress":"work@example.com","organizationName":"Acme"}}"#,
    )
    .unwrap();

    let after = scan_claude_accounts_at(&home, candidate_dirs_at(&home, None));
    assert_eq!(after.len(), 1);
    assert_eq!(after[0].id, unauth_id);
    assert!(after[0].authenticated);
    assert_eq!(after[0].subscription_type.as_deref(), Some("pro"));
    assert_eq!(after[0].email.as_deref(), Some("work@example.com"));
    assert_eq!(after[0].organization_name.as_deref(), Some("Acme"));
    assert_eq!(after[0].launcher_command.as_deref(), Some("claude-work"));
    assert_eq!(after[0].source, "file");
    let _ = fs::remove_dir_all(home);
}

#[test]
fn scanner_discovers_oauth_profile_when_subscription_type_is_null() {
    let home = temp_root("null-sub");
    let managed = home
        .join(".quotashift")
        .join("claude-profiles")
        .join("team-null");
    let external = home.join(".claude-nullsub");
    let empty_oauth = home.join(".claude-empty");
    fs::create_dir_all(&managed).unwrap();
    fs::create_dir_all(&external).unwrap();
    fs::create_dir_all(&empty_oauth).unwrap();
    fs::write(managed.join("settings.json"), "{}").unwrap();
    fs::write(
        managed.join(".credentials.json"),
        r#"{"claudeAiOauth":{"accessToken":"secret","refreshToken":"refresh","expiresAt":4102444800000,"subscriptionType":null}}"#,
    )
    .unwrap();
    fs::write(
        managed.join(".claude.json"),
        r#"{"oauthAccount":{"emailAddress":"user@example.com"}}"#,
    )
    .unwrap();
    fs::write(
        external.join(".credentials.json"),
        r#"{"claudeAiOauth":{"refreshToken":"refresh","subscriptionType":null}}"#,
    )
    .unwrap();
    fs::write(
        empty_oauth.join(".credentials.json"),
        r#"{"claudeAiOauth":{}}"#,
    )
    .unwrap();

    let accounts =
        scan_claude_accounts_at(&home, vec![managed.clone(), external.clone(), empty_oauth]);
    assert_eq!(accounts.len(), 2);

    let managed_acc = accounts
        .iter()
        .find(|a| a.config_dir == managed.to_string_lossy())
        .unwrap();
    assert!(managed_acc.authenticated);
    assert_eq!(managed_acc.subscription_type, None);
    assert_eq!(managed_acc.email.as_deref(), Some("user@example.com"));
    assert_eq!(
        managed_acc.launcher_command.as_deref(),
        Some("claude-team-null")
    );
    let json = serde_json::to_string(managed_acc).unwrap();
    assert!(!json.contains("accessToken"));
    assert!(!json.contains("refreshToken"));

    let ext_acc = accounts
        .iter()
        .find(|a| a.config_dir == external.to_string_lossy())
        .unwrap();
    assert!(ext_acc.authenticated);
    assert_eq!(ext_acc.subscription_type, None);
    assert_eq!(ext_acc.launcher_command, None);
    let _ = fs::remove_dir_all(home);
}

#[test]
fn scanner_skips_managed_gateway_only_profiles_without_oauth() {
    let home = temp_root("managed-gateway");
    let root = home.join(".quotashift").join("claude-profiles");
    let gw_helper = root.join("gw-helper");
    let gw_url = root.join("gw-url");
    let no_settings = root.join("no-settings");
    let fresh = root.join("fresh");
    for dir in [&gw_helper, &gw_url, &no_settings, &fresh] {
        fs::create_dir_all(dir).unwrap();
    }
    fs::write(
        gw_helper.join("settings.json"),
        r#"{"apiKeyHelper":"\"C:/QuotaShift/quotashift.exe\" --claude-gateway-token prof_1"}"#,
    )
    .unwrap();
    fs::write(
        gw_url.join("settings.json"),
        r#"{"env":{"ANTHROPIC_BASE_URL":"http://127.0.0.1:4567"}}"#,
    )
    .unwrap();
    fs::write(fresh.join("settings.json"), r#"{"theme":"dark"}"#).unwrap();

    let accounts = scan_claude_accounts_at(&home, candidate_dirs_at(&home, None));
    assert_eq!(accounts.len(), 1);
    assert_eq!(accounts[0].profile_name, "fresh");
    assert!(!accounts[0].authenticated);
    assert_eq!(
        accounts[0].launcher_command.as_deref(),
        Some("claude-fresh")
    );
    let _ = fs::remove_dir_all(home);
}

#[test]
fn claude_account_serde_defaults_authenticated_true_and_omits_none_launcher() {
    let legacy = r#"{"id":"claude-1234","configDir":"/tmp/a","profileName":"a","subscriptionType":"pro","rateLimitTier":null,"expiresAt":null,"expired":null,"email":null,"organizationName":null,"source":"file"}"#;
    let parsed: ClaudeAccount = serde_json::from_str(legacy).unwrap();
    assert!(parsed.authenticated);
    assert_eq!(parsed.launcher_command, None);
    let serialized = serde_json::to_string(&parsed).unwrap();
    assert!(!serialized.contains("launcherCommand"));
    assert!(serialized.contains(r#""authenticated":true"#));
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
            false,
        ),
        None
    );
}

#[test]
fn processing_accounts_only_use_idle_cadence_for_inactive_profiles() {
    let active = HashSet::from(["c:/profiles/active".to_string()]);

    assert_eq!(
        profile_refresh_interval_secs(
            "idle-account",
            "c:/profiles/idle",
            false,
            Some("idle-account"),
            None,
            &active,
            20,
            600,
            true,
            false,
        ),
        Some(600)
    );
    assert_eq!(
        profile_refresh_interval_secs(
            "active-account",
            "c:/profiles/active",
            false,
            None,
            None,
            &active,
            20,
            600,
            true,
            false,
        ),
        Some(20)
    );
    assert_eq!(
        profile_refresh_interval_secs(
            "idle-account",
            "c:/profiles/idle",
            false,
            Some("idle-account"),
            None,
            &active,
            20,
            600,
            false,
            false,
        ),
        Some(20)
    );
}

#[test]
fn scanner_prefers_user_rate_limit_tier_over_org_rate_limit_tier() {
    let home = temp_root("user-rate-limit-tier");
    let profile = home.join(".claude-team");
    fs::create_dir_all(&profile).unwrap();
    fs::write(
        profile.join(".credentials.json"),
        r#"{"claudeAiOauth":{"subscriptionType":"team","rateLimitTier":"default_raven","userRateLimitTier":"default_claude_max_5x","expiresAt":4102444800000,"accessToken":"secret"}}"#,
    )
    .unwrap();

    let accounts = scan_claude_accounts_at(&home, vec![profile]);
    assert_eq!(accounts.len(), 1);
    assert_eq!(accounts[0].subscription_type.as_deref(), Some("team"));
    assert_eq!(
        accounts[0].rate_limit_tier.as_deref(),
        Some("default_claude_max_5x")
    );
    let _ = fs::remove_dir_all(home);
}

#[test]
fn auto_bridge_scope_excludes_third_party_profile_stores() {
    let home = temp_root("bridge-scope");
    let default_dir = home.join(".claude");
    let managed = home
        .join(".quotashift")
        .join("claude-profiles")
        .join("work");
    let third_party = home.join(".ccs").join("work");
    fs::create_dir_all(&default_dir).unwrap();
    fs::create_dir_all(&managed).unwrap();
    fs::create_dir_all(&third_party).unwrap();
    fs::write(managed.join("settings.json"), "{}").unwrap();
    fs::write(third_party.join("settings.json"), "{}").unwrap();

    assert!(crate::claude::monitor::profile_snapshots::is_default_config_dir(&default_dir, &home));
    assert!(discovery::is_managed_profile_dir_at(&managed, &home));
    assert!(!crate::claude::monitor::profile_snapshots::is_default_config_dir(&third_party, &home));
    assert!(!discovery::is_managed_profile_dir_at(&third_party, &home));
    let _ = fs::remove_dir_all(home);
}
