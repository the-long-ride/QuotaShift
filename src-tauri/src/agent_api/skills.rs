use std::fs;
use std::path::{Path, PathBuf};

const FOLDER: &str = "quotashift-rotation";
const MARKER: &str = "<!-- quotashift-managed-agent-skill-v1 -->";
const SKILL: &str = r#"<!-- quotashift-managed-agent-skill-v1 -->
---
name: quotashift-rotation
description: Inspect QuotaShift account quota and rotate the active Antigravity or Codex sign-in through the user's authenticated local Agent API.
---
# QuotaShift account rotation

Only use this skill when the user requests quota information, account
switching, or an exhausted CLI account needs continuation. The QuotaShift
Agent API must be enabled in Settings > Monitoring > AI Agent API.

Never print or log the API key. Never write a key into this skill or a repository.
Both environment variables must be present in the shell running the agent:
- QUOTASHIFT_AGENT_API_URL (e.g. http://127.0.0.1:45692)
- QUOTASHIFT_AGENT_API_KEY (generated in QuotaShift)

Inspect usage (returns IDs and usage, **no emails or aliases**):

```sh
curl --fail-with-body --silent --show-error --noproxy '*' \
  -H "Authorization: Bearer $QUOTASHIFT_AGENT_API_KEY" \
  "$QUOTASHIFT_AGENT_API_URL/v1/accounts"
```

List configured CLI pools:

```sh
curl --fail-with-body --silent --show-error --noproxy '*' \
  -H "Authorization: Bearer $QUOTASHIFT_AGENT_API_KEY" \
  "$QUOTASHIFT_AGENT_API_URL/v1/pools"
```

Request the next eligible account from an active pool (auto mode):
```sh
curl --fail-with-body --silent --show-error --noproxy '*' \
  -H "Authorization: Bearer $QUOTASHIFT_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"auto","provider":"codex"}' \
  "$QUOTASHIFT_AGENT_API_URL/v1/rotation"
```

Or select a specific eligible saved account ID (outside a pool is allowed):
```sh
curl --fail-with-body --silent --show-error --noproxy '*' \
  -H "Authorization: Bearer $QUOTASHIFT_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"account","provider":"antigravity","accountId":"REPLACE_ID"}' \
  "$QUOTASHIFT_AGENT_API_URL/v1/rotation"
```

If a poolId is included, the chosen account must be a member of that pool.
Read /v1/operations/<operationId> until succeeded or failed.
Never assume an HTTP 202 means the account has switched. Do not continue
work with the new identity before operation status is succeeded.
If quota is missing/stale, or the API returns 401, 403, 409, 429 or 503,
do not repeatedly trigger rotation; report the issue and stop.
"#;

fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or("Cannot resolve user home directory".into())
}
fn managed(dir: &Path) -> bool {
    fs::read_to_string(dir.join("SKILL.md"))
        .map(|s| s.starts_with(MARKER)).unwrap_or(false)
}
fn canonical(home: &Path) -> PathBuf {
    home.join(".agents").join("skills").join(FOLDER)
}
fn write_managed(path: &Path) -> Result<(), String> {
    if path.exists() {
        if !managed(path) {
            return Err(format!("Refusing to overwrite existing user skill at {}", path.display()));
        }
        let prior = fs::read_to_string(path.join("SKILL.md"))
            .map_err(|e| format!("Reading installed skill: {e}"))?;
        if prior != SKILL {
            return Err(format!("Managed skill was modified by the user: {}", path.display()));
        }
        return Ok(());
    }
    fs::create_dir_all(path).map_err(|e| format!("Creating skill directory: {e}"))?;
    fs::write(path.join("SKILL.md"), SKILL)
        .map_err(|e| format!("Writing QuotaShift skill: {e}"))
}
fn targets(home: &Path) -> [PathBuf; 2] {
    [
        home.join(".claude").join("skills").join(FOLDER),
        home.join(".gemini").join("config").join("skills").join(FOLDER),
    ]
}
fn install_link_or_copy(target: &Path, source: &Path) -> Result<(), String> {
    if let Ok(current) = fs::read_link(target) {
        if current == source { return Ok(()); }
        return Err(format!("Conflicting existing agent skill link: {}", target.display()));
    }
    if target.exists() {
        if !managed(target) {
            return Err(format!("Existing user skill cannot be overwritten: {}", target.display()));
        }
        return write_managed(target);
    }
    fs::create_dir_all(target.parent().ok_or("Invalid skill directory")?)
        .map_err(|e| format!("Cannot create agent skills directory: {e}"))?;
    #[cfg(unix)]
    if std::os::unix::fs::symlink(source, target).is_ok() { return Ok(()); }
    #[cfg(windows)]
    if std::os::windows::fs::symlink_dir(source, target).is_ok() { return Ok(()); }
    // Windows systems without Developer Mode cannot always create symlinks.
    write_managed(target)
}

#[tauri::command]
pub fn install_agent_skill() -> Result<Vec<String>, String> {
    let home = home()?;
    let source = canonical(&home);
    write_managed(&source)?;
    let mut paths = vec![source.display().to_string()];
    for target in targets(&home) {
        install_link_or_copy(&target, &source)?;
        paths.push(target.display().to_string());
    }
    Ok(paths)
}
#[tauri::command]
pub fn uninstall_agent_skill() -> Result<Vec<String>, String> {
    let home = home()?;
    let source = canonical(&home);
    let mut removed = Vec::new();
    for target in targets(&home) {
        if fs::read_link(&target).is_ok_and(|dest| dest == source) {
            #[cfg(unix)]
            fs::remove_file(&target).map_err(|e| format!("Removing skill link: {e}"))?;
            #[cfg(windows)]
            fs::remove_dir(&target).map_err(|e| format!("Removing skill link: {e}"))?;
            removed.push(target.display().to_string());
        } else if managed(&target) {
            fs::remove_file(target.join("SKILL.md"))
                .map_err(|e| format!("Removing managed skill manifest: {e}"))?;
            let _ = fs::remove_dir(&target);
            removed.push(target.display().to_string());
        }
    }
    if managed(&source) {
        fs::remove_file(source.join("SKILL.md"))
            .map_err(|e| format!("Removing managed manifest: {e}"))?;
        // Never delete user-authored files added to a managed skill directory.
        let _ = fs::remove_dir(&source);
        removed.push(source.display().to_string());
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installed_skill_uses_environment_not_embedded_secrets() {
        assert!(SKILL.contains("QUOTASHIFT_AGENT_API_KEY"));
        assert!(SKILL.starts_with(MARKER));
        assert!(!SKILL.contains("AIza"));
    }
}
