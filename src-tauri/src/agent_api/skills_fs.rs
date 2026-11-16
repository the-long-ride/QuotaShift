use std::fs;
use std::path::Path;

const CURRENT_OPENCODE_SECTION: &str = r#"## OpenCode
OpenCode normally discovers ~/.config/opencode/skills and ~/.agents/skills automatically.
If explicitly configuring skills directories, merge this into opencode.jsonc:
```jsonc
{ "skills": ["~/.config/opencode/skills"] }
```
Do not delete existing entries, and never place the API key in opencode.jsonc."#;

const LEGACY_OPENCODE_SECTION: &str = r#"## OpenCode
OpenCode normally discovers ~/.agents/skills automatically. If explicitly configuring
skills directories, merge this into the skills array in opencode.jsonc:
```jsonc
{ "skills": ["~/.agents/skills"] }
```
Do not delete existing entries, and never place the API key in opencode.jsonc."#;

pub(crate) fn is_current_managed(dir: &Path, expected_skill: &str) -> bool {
    fs::read_to_string(dir.join("SKILL.md"))
        .is_ok_and(|manifest| manifest.replace("\r\n", "\n") == expected_skill)
}

pub(crate) fn is_managed(dir: &Path, expected_skill: &str) -> bool {
    // A modified installed manifest is user-owned, not something we can delete.
    let Ok(raw) = fs::read_to_string(dir.join("SKILL.md")) else {
        return false;
    };
    let manifest = raw.replace("\r\n", "\n");
    let expected_127 = expected_skill.replace("http://localhost:45692", "http://127.0.0.1:45692");
    let legacy_ba2390b = expected_127.replace(CURRENT_OPENCODE_SECTION, LEGACY_OPENCODE_SECTION);
    manifest == expected_skill || manifest == expected_127 || manifest == legacy_ba2390b
}

pub(crate) fn is_linked_to(target: &Path, source: &Path) -> bool {
    fs::read_link(target).is_ok_and(|dest| dest == source)
}

pub(crate) fn is_target_installed(target: &Path, source: &Path, expected_skill: &str) -> bool {
    is_managed(target, expected_skill)
        || (is_linked_to(target, source) && is_managed(source, expected_skill))
}

pub(crate) fn remove_symlink(target: &Path) -> Result<(), String> {
    #[cfg(unix)]
    fs::remove_file(target).map_err(|e| format!("Removing skill link: {e}"))?;
    #[cfg(windows)]
    fs::remove_dir(target).map_err(|e| format!("Removing skill link: {e}"))?;
    Ok(())
}

pub(crate) fn install_target(
    target: &Path,
    source: &Path,
    expected_skill: &str,
    write_fn: fn(&Path, &str) -> Result<(), String>,
) -> Result<(), String> {
    if let Ok(current) = fs::read_link(target) {
        if current == source && is_current_managed(source, expected_skill) {
            return Ok(());
        }
        if current != source {
            return Err(format!(
                "Conflicting existing agent skill link: {}",
                target.display()
            ));
        }
        remove_symlink(target)?;
    }
    write_fn(target, expected_skill)
}

pub(crate) fn uninstall_target(
    target: &Path,
    source: &Path,
    expected_skill: &str,
) -> Result<bool, String> {
    if is_linked_to(target, source) {
        remove_symlink(target)?;
        return Ok(true);
    }
    if is_managed(target, expected_skill) {
        fs::remove_file(target.join("SKILL.md"))
            .map_err(|e| format!("Removing managed skill manifest: {e}"))?;
        // Never delete user-authored files added to a managed skill directory.
        let _ = fs::remove_dir(target);
        return Ok(true);
    }
    if fs::read_link(target).is_ok() || target.exists() {
        return Err(format!(
            "Managed skill was modified by the user: {}",
            target.display()
        ));
    }
    Ok(false)
}
