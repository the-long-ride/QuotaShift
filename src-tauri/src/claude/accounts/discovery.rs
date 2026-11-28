use super::metadata::normalize_config_dir_key;
use crate::claude::inventory::creation::managed_profile_root;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn managed_profiles_root_at(home: &Path) -> PathBuf {
    home.join(".quotashift").join("claude-profiles")
}

pub(super) fn is_managed_profile_dir_at(dir: &Path, home: &Path) -> bool {
    if !dir.join("settings.json").is_file() {
        return false;
    }
    let Some(parent) = dir.parent() else {
        return false;
    };
    let parent_key = normalize_config_dir_key(parent);
    if parent_key == normalize_config_dir_key(&managed_profiles_root_at(home)) {
        return true;
    }
    let same_host_home = super::account_home_dir()
        .ok()
        .is_some_and(|host| normalize_config_dir_key(&host) == normalize_config_dir_key(home));
    same_host_home
        && managed_profile_root()
            .ok()
            .is_some_and(|root| normalize_config_dir_key(&root) == parent_key)
}

fn expand_tilde(value: &str, home: &Path) -> PathBuf {
    match value.trim().strip_prefix('~') {
        Some(rest) => home.join(rest.trim_start_matches(['/', '\\'])),
        None => PathBuf::from(value.trim()),
    }
}

fn assignment_value(line: &str, key: &str) -> Option<String> {
    let index = line.find(key)?;
    let after_key = &line[index + key.len()..];
    let value = after_key.trim_start().strip_prefix('=')?.trim_start();
    if value.is_empty() {
        return None;
    }
    let first = value.chars().next()?;
    if first == '"' || first == '\'' {
        let rest = &value[first.len_utf8()..];
        let end = rest.find(first)?;
        let value = &rest[..end];
        return (!value.is_empty()).then(|| value.to_string());
    }
    let value = value
        .split(|character: char| character.is_whitespace() || character == ';' || character == '}')
        .next()
        .unwrap_or("")
        .trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn add_profile_store(base: &Path, dirs: &mut HashSet<PathBuf>) {
    if let Ok(entries) = fs::read_dir(base) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                dirs.insert(entry.path());
            }
        }
    }
}

fn collect_assignments(path: &Path, home: &Path, dirs: &mut HashSet<PathBuf>) {
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    for line in content.lines() {
        if let Some(value) = assignment_value(line, "CLAUDE_CONFIG_DIR") {
            dirs.insert(expand_tilde(&value, home));
        }
    }
}

fn collect_powershell_profiles(home: &Path, dirs: &mut HashSet<PathBuf>) {
    for path in [
        home.join("Documents")
            .join("PowerShell")
            .join("Microsoft.PowerShell_profile.ps1"),
        home.join("Documents")
            .join("WindowsPowerShell")
            .join("Microsoft.PowerShell_profile.ps1"),
        home.join("Documents")
            .join("PowerShell")
            .join("profile.ps1"),
        home.join("Documents")
            .join("WindowsPowerShell")
            .join("profile.ps1"),
    ] {
        collect_assignments(&path, home, dirs);
    }
}

fn configured_profile_path(name: &str, profile: &Value, home: &Path) -> PathBuf {
    let raw = profile
        .as_str()
        .or_else(|| profile.get("config_dir").and_then(Value::as_str))
        .or_else(|| profile.get("path").and_then(Value::as_str));
    if let Some(raw) = raw {
        let path = expand_tilde(raw, home);
        return if path.is_absolute() {
            path
        } else {
            home.join(path)
        };
    }
    home.join("claude-profiles")
        .join(name.trim_start_matches("claude-"))
}

fn collect_config_json(path: &Path, home: &Path, dirs: &mut HashSet<PathBuf>) {
    let Ok(raw) = fs::read_to_string(path) else {
        return;
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return;
    };

    if let Some(profiles) = value.get("enabled_profiles").and_then(Value::as_array) {
        for name in profiles.iter().filter_map(Value::as_str) {
            let raw = expand_tilde(name, home);
            dirs.insert(if raw.is_absolute() {
                raw
            } else {
                home.join("claude-profiles")
                    .join(name.trim_start_matches("claude-"))
            });
        }
    }
    if let Some(profiles) = value.get("profiles_config").and_then(Value::as_object) {
        for (name, profile) in profiles {
            dirs.insert(configured_profile_path(name, profile, home));
        }
    }
}

pub fn candidate_dirs_at(home: &Path, cwd: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = HashSet::from([home.join(".claude")]);
    if let Ok(entries) = fs::read_dir(home) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if ((name.starts_with(".claude") && name != ".claude.json")
                || name.starts_with(".openclaude"))
                && entry.path().is_dir()
            {
                dirs.insert(entry.path());
            }
        }
    }

    for base in [
        home.join("claude-profiles"),
        home.join(".claude-profiles"),
        managed_profiles_root_at(home),
        home.join(".ccs").join("instances"),
        home.join(".agentsroom").join("claude-profiles"),
    ] {
        add_profile_store(&base, &mut dirs);
    }

    for rc in [
        ".zshrc",
        ".bashrc",
        ".bash_profile",
        ".profile",
        ".zprofile",
    ] {
        collect_assignments(&home.join(rc), home, &mut dirs);
    }
    collect_assignments(
        &home.join(".config").join("fish").join("config.fish"),
        home,
        &mut dirs,
    );
    collect_powershell_profiles(home, &mut dirs);

    for config in [
        home.join("config.json"),
        home.join(".quotashift").join("config.json"),
    ] {
        collect_config_json(&config, home, &mut dirs);
    }
    if let Some(cwd) = cwd {
        collect_config_json(&cwd.join("config.json"), home, &mut dirs);
    }

    let mut result = dirs.into_iter().collect::<Vec<_>>();
    result.sort();
    result
}

pub fn candidate_dirs() -> Result<Vec<PathBuf>, String> {
    let home = super::account_home_dir()?;
    let cwd = std::env::current_dir().ok();
    let mut dirs: HashSet<PathBuf> = candidate_dirs_at(&home, cwd.as_deref())
        .into_iter()
        .collect();
    if let Ok(managed_root) = managed_profile_root() {
        add_profile_store(&managed_root, &mut dirs);
    }
    let mut result = dirs.into_iter().collect::<Vec<_>>();
    result.sort();
    Ok(result)
}

#[cfg(test)]
mod assignment_tests {
    use super::assignment_value;

    #[test]
    fn reads_quoted_powershell_assignment_without_trailing_command() {
        let line = "function work { $env:CLAUDE_CONFIG_DIR = \"C:/profiles/work\"; claude }";
        assert_eq!(
            assignment_value(line, "CLAUDE_CONFIG_DIR").as_deref(),
            Some("C:/profiles/work")
        );
    }
}
