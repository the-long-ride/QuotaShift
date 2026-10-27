use super::installations::{
    canonical_windows_path, discover_claude_installations, inspect_installation_candidate, is_shim,
    is_wsl_path,
};
use super::profiles::{discover_claude_profiles, inspect_profile_dir};
use std::path::{Path, PathBuf};

#[test]
fn finds_two_different_claude_executables() {
    let exe1 = PathBuf::from(r"C:\Program Files\Anthropic\claude.exe");
    let exe2 = PathBuf::from(r"C:\Users\Developer\AppData\Roaming\npm\claude.cmd");

    let candidates = vec![exe1, exe2];
    let discovered = discover_claude_installations(&candidates);

    assert_eq!(discovered.len(), 2);
    assert_ne!(discovered[0].canonical_path, discovered[1].canonical_path);
}

#[test]
fn finds_profile_without_subscription_credentials() {
    let temp_dir = std::env::temp_dir().join(format!("claude_prof_test_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let settings_file = temp_dir.join("settings.json");
    // Write settings without any subscription / OAuth keys
    let _ = std::fs::write(&settings_file, "{\"theme\": \"dark\"}");

    let profile = inspect_profile_dir(&temp_dir).expect("inspect");
    assert!(!profile.has_subscription_credentials);
    assert!(profile.is_gateway_only);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn canonical_windows_path_idempotent() {
    let raw = Path::new(r"C:/Users/TestUser/AppData/Local/../Roaming/npm/claude.cmd");
    let c1 = canonical_windows_path(raw).expect("first");
    let c2 = canonical_windows_path(&c1).expect("second");

    assert_eq!(c1, c2);
    assert!(!c1.to_string_lossy().contains('/'));
}

#[test]
fn wsl_executable_rejected() {
    let wsl1 = Path::new(r"\\wsl$\Ubuntu\usr\bin\claude");
    let wsl2 = Path::new(r"\\wsl.localhost\Debian\usr\local\bin\claude");
    let wsl3 = Path::new("/usr/bin/claude");

    assert!(is_wsl_path(wsl1));
    assert!(is_wsl_path(wsl2));
    assert!(is_wsl_path(wsl3));

    assert!(inspect_installation_candidate(wsl1).is_err());
    assert!(inspect_installation_candidate(wsl2).is_err());
    assert!(inspect_installation_candidate(wsl3).is_err());
}

#[test]
fn shims_not_executed_during_discovery() {
    let shim = Path::new(r"C:\Users\Dev\AppData\Roaming\npm\claude.cmd");
    assert!(is_shim(shim));

    let inst = inspect_installation_candidate(shim).expect("inspect");
    assert_eq!(inst.provenance, "npm_shim");
    // Discovery returns immediately without running process or setting version
    assert_eq!(inst.version, None);
}

#[test]
fn manual_path_outside_allowlist_requires_explicit_selection() {
    let custom_bin = Path::new(r"D:\Tools\CustomBin\claude.exe");
    let inst = inspect_installation_candidate(custom_bin).expect("inspect");

    assert!(inst.requires_explicit_confirmation);
    assert_eq!(inst.provenance, "manual_selection");

    let std_bin = Path::new(r"C:\Program Files\Anthropic\claude.exe");
    let std_inst = inspect_installation_candidate(std_bin).expect("inspect");
    assert!(!std_inst.requires_explicit_confirmation);
}

#[test]
#[allow(non_snake_case)]
fn profile_A_and_B_separate() {
    let dir_a = PathBuf::from(r"C:\Users\Dev\.claude_profile_a");
    let dir_b = PathBuf::from(r"C:\Users\Dev\.claude_profile_b");

    let candidates = vec![dir_a, dir_b];
    let profiles = discover_claude_profiles(&candidates);

    assert_eq!(profiles.len(), 2);
    assert_ne!(profiles[0].id, profiles[1].id);
    assert_ne!(profiles[0].config_dir, profiles[1].config_dir);
}

#[test]
fn path_with_spaces_and_unicode() {
    let unicode_path = Path::new(r"C:\Users\Đỗ Nam Trung\App Data\Claude Profilé");
    let res = canonical_windows_path(unicode_path);
    assert!(res.is_ok());
    let path = res.unwrap();
    assert!(path.to_string_lossy().contains("Đỗ Nam Trung"));
    assert!(path.to_string_lossy().contains("Claude Profilé"));
}

#[test]
fn symlink_and_reparse_points_resolved() {
    // Normalization preserves target location and strips extended prefixes
    let reparse = Path::new(r"\\?\C:\Users\Dev\ClaudeDir");
    let resolved = canonical_windows_path(reparse).expect("resolved");
    assert!(!resolved.to_string_lossy().starts_with(r"\\?\"));
    assert_eq!(resolved, PathBuf::from(r"C:\Users\Dev\ClaudeDir"));
}

#[test]
fn creates_isolated_claude_home_with_default_settings() {
    use super::creation::{create_managed_profile_at, list_managed_profile_dirs, ProfileTemplate};
    let root = std::env::temp_dir().join(format!(
        "qs_profile_default_{}_{}",
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    let profile =
        create_managed_profile_at(&root, "work-two", ProfileTemplate::Default, None).unwrap();
    assert!(profile.config_dir.ends_with("work-two"));
    let settings: serde_json::Value =
        serde_json::from_slice(&std::fs::read(profile.settings_path).unwrap()).unwrap();
    assert_eq!(settings, serde_json::json!({}));
    assert_eq!(list_managed_profile_dirs(&root).unwrap().len(), 1);
    assert!(root.join("work-two").join("settings.json").is_file());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn copied_claude_settings_preserve_preferences_but_never_secrets_or_commands() {
    use super::creation::{create_managed_profile_at, ProfileTemplate};
    let base = std::env::temp_dir().join(format!(
        "qs_profile_copy_{}_{}",
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    let source = base.join("source");
    let root = base.join("managed");
    std::fs::create_dir_all(&source).unwrap();
    let original = serde_json::json!({
        "theme": "dark", "language": "en", "outputStyle": "Explanatory",
        "spinnerVerbs": {"mode": "append", "verbs": ["Hatching"]},
        "model": "claude-test",
        "env": {"ANTHROPIC_AUTH_TOKEN": "secret", "MY_PRIVATE_TOKEN": "secret"},
        "hooks": {"PostToolUse":[{"hooks":[{"command":"unsafe script"}]}]},
        "mcpServers": {"demo":{"env":{"API_KEY":"secret"}}},
        "primaryApiKey": "secret",
        "permissions": {"allow": ["Bash(*)"]},
        "enabledPlugins": {"untrusted":"something"}
    });
    std::fs::write(source.join("settings.json"), original.to_string()).unwrap();
    let profile = create_managed_profile_at(
        &root,
        "copied",
        ProfileTemplate::CopySettings,
        Some(&source),
    )
    .unwrap();
    let cloned: serde_json::Value =
        serde_json::from_slice(&std::fs::read(profile.settings_path).unwrap()).unwrap();
    assert_eq!(cloned["theme"], "dark");
    assert_eq!(cloned["outputStyle"], "Explanatory");
    assert_eq!(cloned["spinnerVerbs"]["verbs"][0], "Hatching");
    for excluded in [
        "env",
        "hooks",
        "mcpServers",
        "primaryApiKey",
        "permissions",
        "enabledPlugins",
    ] {
        assert!(
            cloned.get(excluded).is_none(),
            "{excluded} must not migrate"
        );
    }
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(
            &std::fs::read(source.join("settings.json")).unwrap()
        )
        .unwrap(),
        original,
        "source must remain unchanged"
    );
    std::fs::remove_dir_all(base).unwrap();
}

#[test]
fn profile_creation_refuses_traversal_duplicates_and_missing_source() {
    use super::creation::{create_managed_profile_at, ProfileTemplate};
    let root = std::env::temp_dir().join(format!(
        "qs_profile_refuse_{}_{}",
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    for name in ["../escape", "..", ".", "bad/name", "has space", ""] {
        assert!(
            create_managed_profile_at(&root, name, ProfileTemplate::Default, None).is_err(),
            "invalid name {name}"
        );
    }
    let created = create_managed_profile_at(&root, "safe", ProfileTemplate::Default, None).unwrap();
    std::fs::write(&created.settings_path, "{\"theme\":\"user-updated\"}").unwrap();
    assert!(create_managed_profile_at(&root, "safe", ProfileTemplate::Default, None).is_err());
    assert_eq!(
        std::fs::read_to_string(&created.settings_path).unwrap(),
        "{\"theme\":\"user-updated\"}"
    );
    assert!(create_managed_profile_at(&root, "copy", ProfileTemplate::CopySettings, None).is_err());
    assert!(!root.join("copy").exists());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn launcher_binds_isolated_home_and_preserves_command_arguments() {
    use super::launcher::render_claude_launcher;
    let home = PathBuf::from(r"C:\Users\Local\AppData\Roaming\QuotaShift\claude-profiles\codex");
    let script = render_claude_launcher(&home).unwrap();
    assert!(script.contains("set \"CLAUDE_CONFIG_DIR=C:\\Users\\Local\\AppData\\Roaming\\QuotaShift\\claude-profiles\\codex\""));
    assert!(script.contains("set \"ANTHROPIC_AUTH_TOKEN=\""));
    assert!(script.contains("set \"ANTHROPIC_API_KEY=\""));
    assert!(script.contains("call claude %*"));
    assert!(script.starts_with("@echo off\r\n"));
}

#[test]
fn update_routing_key_never_adds_auth_token_when_api_key_helper_present() {
    use super::commands::update_profile_settings_routing_key;
    let mut settings = serde_json::json!({
        "apiKeyHelper": "\"C:/QuotaShift/quotashift.exe\" --claude-gateway-token prof_1",
        "env": {
            "ANTHROPIC_BASE_URL": "http://127.0.0.1:4567",
            "ANTHROPIC_AUTH_TOKEN": "stale-token"
        }
    });
    update_profile_settings_routing_key(&mut settings, "new-secret-key", true);
    assert!(
        settings["env"].get("ANTHROPIC_AUTH_TOKEN").is_none(),
        "apiKeyHelper profiles must not have env.ANTHROPIC_AUTH_TOKEN"
    );
    assert!(settings["env"].get("ANTHROPIC_API_KEY").is_none());
}

#[test]
fn launcher_rejects_unsafe_windows_command_interpolation() {
    use super::launcher::render_claude_launcher;
    for value in [
        r"C:\User\100%profile",
        r"C:\User\bang!dir",
        "C:\\User\\newline\nwhoami",
        r#"C:\User\quote"dir"#,
        r"C:\User\caret^",
    ] {
        assert!(render_claude_launcher(Path::new(value)).is_err(), "{value}");
    }
}

#[test]
fn installing_launcher_never_overwrites_existing_command_file() {
    use super::launcher::install_claude_launcher_at;
    let root = std::env::temp_dir().join(format!(
        "qs_launcher_no_overwrite_{}_{}",
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    let home = root.join("profile");
    let bindir = root.join("bin");
    std::fs::create_dir_all(&home).unwrap();
    let path = install_claude_launcher_at(&bindir, "codex", &home).unwrap();
    assert!(path.ends_with("claude-codex.cmd"));
    std::fs::write(&path, "@echo off\r\necho user edited").unwrap();
    assert!(install_claude_launcher_at(&bindir, "codex", &home).is_err());
    assert!(std::fs::read_to_string(&path)
        .unwrap()
        .contains("user edited"));
    std::fs::remove_dir_all(root).unwrap();
}
