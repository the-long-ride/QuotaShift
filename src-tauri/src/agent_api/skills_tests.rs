use super::*;
use std::fs;

fn temp_home(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "quotashift-skill-{label}-{}-{}",
        std::process::id(),
        rand::random::<u64>()
    ))
}

#[test]
fn installed_skill_uses_environment_not_embedded_secrets() {
    assert!(SKILL.contains("QUOTASHIFT_AGENT_API_KEY"));
    assert!(SKILL.starts_with("---\nname: quotashift-rotation"));
    assert!(SKILL.contains(MARKER));
    assert!(!SKILL.contains("AIza"));
}

#[test]
fn user_modified_manifests_are_never_considered_owned() {
    let path = temp_home("modified");
    fs::create_dir_all(&path).unwrap();
    let manifest = path.join("SKILL.md");
    fs::write(&manifest, SKILL).unwrap();
    assert!(fs_ops::is_managed(&path, SKILL));
    fs::write(&manifest, format!("{SKILL}\n# user-added instructions")).unwrap();
    assert!(!fs_ops::is_managed(&path, SKILL));
    fs::remove_dir_all(&path).unwrap();
}

#[test]
fn per_agent_toggle_installs_and_uninstalls_independently() {
    let home = temp_home("per-agent");
    fs::create_dir_all(&home).unwrap();

    let after_claude = set_skill_for_home(&home, "claude", true).unwrap();
    assert_eq!(
        after_claude
            .iter()
            .map(|item| (item.id, item.installed))
            .collect::<Vec<_>>(),
        vec![
            ("claude", true),
            ("codex", false),
            ("antigravity", false),
            ("opencode", false),
        ]
    );

    let after_opencode = set_skill_for_home(&home, "opencode", true).unwrap();
    assert!(
        after_opencode
            .iter()
            .find(|s| s.id == "opencode")
            .unwrap()
            .installed
    );
    assert!(home
        .join(".config/opencode/skills/quotashift-rotation/SKILL.md")
        .exists());

    let after_remove = set_skill_for_home(&home, "claude", false).unwrap();
    assert!(
        !after_remove
            .iter()
            .find(|s| s.id == "claude")
            .unwrap()
            .installed
    );
    assert!(
        after_remove
            .iter()
            .find(|s| s.id == "opencode")
            .unwrap()
            .installed
    );

    fs::remove_dir_all(&home).unwrap();
}

#[test]
fn legacy_managed_skills_can_be_overwritten_and_removed_while_canonical_cleans_up() {
    let home = temp_home("legacy-cleanup");
    let antigravity_dir = home.join(".gemini/config/skills/quotashift-rotation");
    let canonical_dir = canonical(&home);
    fs::create_dir_all(&antigravity_dir).unwrap();
    fs::create_dir_all(&canonical_dir).unwrap();

    let legacy_skill = SKILL.replace("http://localhost:45692", "http://127.0.0.1:45692");
    fs::write(antigravity_dir.join("SKILL.md"), &legacy_skill).unwrap();
    fs::write(canonical_dir.join("SKILL.md"), &legacy_skill).unwrap();

    // Overwrite old managed version when enabling Antigravity
    let after_upgrade = set_skill_for_home(&home, "antigravity", true).unwrap();
    assert!(
        after_upgrade
            .iter()
            .find(|s| s.id == "antigravity")
            .unwrap()
            .installed
    );
    assert_eq!(
        fs::read_to_string(antigravity_dir.join("SKILL.md")).unwrap(),
        SKILL
    );

    // Disabling Antigravity leaves Codex (canonical ~/.agents/skills) until Codex is also disabled
    let after_antigravity_off = set_skill_for_home(&home, "antigravity", false).unwrap();
    assert!(
        !after_antigravity_off
            .iter()
            .find(|s| s.id == "antigravity")
            .unwrap()
            .installed
    );
    assert!(!antigravity_dir.exists());

    // Disabling the last remaining agent (Codex) removes ~/.agents/skills/quotashift-rotation too
    let after_all_off = set_skill_for_home(&home, "codex", false).unwrap();
    assert!(after_all_off.iter().all(|s| !s.installed));
    assert!(!canonical_dir.exists());

    fs::remove_dir_all(&home).unwrap();
}
