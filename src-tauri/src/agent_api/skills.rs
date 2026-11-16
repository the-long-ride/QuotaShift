use std::path::{Path, PathBuf};

#[path = "skills_fs.rs"]
mod fs_ops;

const FOLDER: &str = "quotashift-rotation";
#[cfg(test)]
const MARKER: &str = "<!-- quotashift-managed-agent-skill-v1 -->";
const SKILL: &str = r#"---
name: quotashift-rotation
description: Inspect QuotaShift account quota and rotate the active Antigravity or Codex sign-in through the user's authenticated local Agent API.
---
<!-- quotashift-managed-agent-skill-v1 -->
# QuotaShift account rotation

Only use this skill when the user requests quota information, account
switching, or an exhausted CLI account needs continuation. The QuotaShift
Agent API must be enabled in Settings > Monitoring > AI Agent API.

Never print or log the API key. Never write a key into this skill or a repository.
Both environment variables must be present in the shell running the agent:
- QUOTASHIFT_AGENT_API_URL (e.g. http://localhost:45692)
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
Read /v1/operations/<operationId> until succeeded, failed or timed_out.
A timed_out operation may still be writing credentials; do not retry while it is active.
Never assume an HTTP 202 means the account has switched. Do not continue
work with the new identity before operation status is succeeded.
If quota is missing/stale, or the API returns 401, 403, 409, 429 or 503,
do not repeatedly trigger rotation; report the issue and stop.

## Windows PowerShell
In PowerShell use environment variables without echoing the key:
```powershell
$headers = @{ Authorization = "Bearer $env:QUOTASHIFT_AGENT_API_KEY" }
Invoke-RestMethod -Uri "$env:QUOTASHIFT_AGENT_API_URL/v1/accounts" -Headers $headers
$body = @{ mode = "auto"; provider = "codex" } | ConvertTo-Json
Invoke-RestMethod -Uri "$env:QUOTASHIFT_AGENT_API_URL/v1/rotation" -Method Post -Headers $headers -ContentType "application/json" -Body $body
```

## OpenCode
OpenCode normally discovers ~/.config/opencode/skills and ~/.agents/skills automatically.
If explicitly configuring skills directories, merge this into opencode.jsonc:
```jsonc
{ "skills": ["~/.config/opencode/skills"] }
```
Do not delete existing entries, and never place the API key in opencode.jsonc.
"#;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillStatus {
    pub id: &'static str,
    pub name: &'static str,
    pub path: String,
    pub installed: bool,
}

#[derive(Clone, Copy)]
struct AgentTargetSpec {
    id: &'static str,
    name: &'static str,
    dir: fn(&Path) -> PathBuf,
}

const AGENT_TARGETS: [AgentTargetSpec; 4] = [
    AgentTargetSpec {
        id: "claude",
        name: "Claude Code",
        dir: |home| home.join(".claude").join("skills").join(FOLDER),
    },
    AgentTargetSpec {
        id: "codex",
        name: "Codex",
        dir: |home| home.join(".agents").join("skills").join(FOLDER),
    },
    AgentTargetSpec {
        id: "antigravity",
        name: "Antigravity",
        dir: |home| {
            home.join(".gemini")
                .join("config")
                .join("skills")
                .join(FOLDER)
        },
    },
    AgentTargetSpec {
        id: "opencode",
        name: "OpenCode",
        dir: |home| {
            home.join(".config")
                .join("opencode")
                .join("skills")
                .join(FOLDER)
        },
    },
];

fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or("Cannot resolve user home directory".into())
}

fn canonical(home: &Path) -> PathBuf {
    home.join(".agents").join("skills").join(FOLDER)
}

fn write_managed(path: &Path, expected_skill: &str) -> Result<(), String> {
    if path.exists() {
        if !fs_ops::is_managed(path, expected_skill) {
            return Err(format!(
                "Refusing to overwrite existing user skill at {}",
                path.display()
            ));
        }
        if fs_ops::is_current_managed(path, expected_skill) {
            return Ok(());
        }
        return std::fs::write(path.join("SKILL.md"), expected_skill)
            .map_err(|e| format!("Updating QuotaShift skill: {e}"));
    }
    std::fs::create_dir_all(path).map_err(|e| format!("Creating skill directory: {e}"))?;
    std::fs::write(path.join("SKILL.md"), expected_skill)
        .map_err(|e| format!("Writing QuotaShift skill: {e}"))
}

fn materialize_other_links(home: &Path, source: &Path) -> Result<(), String> {
    for spec in AGENT_TARGETS {
        if spec.id == "codex" {
            continue;
        }
        let target = (spec.dir)(home);
        if fs_ops::is_linked_to(&target, source) {
            fs_ops::remove_symlink(&target)?;
            write_managed(&target, SKILL)?;
        }
    }
    Ok(())
}

pub(crate) fn list_skills_for_home(home: &Path) -> Vec<AgentSkillStatus> {
    let source = canonical(home);
    AGENT_TARGETS
        .iter()
        .map(|spec| {
            let path = (spec.dir)(home);
            AgentSkillStatus {
                id: spec.id,
                name: spec.name,
                path: path.display().to_string(),
                installed: fs_ops::is_target_installed(&path, &source, SKILL),
            }
        })
        .collect()
}

pub(crate) fn set_skill_for_home(
    home: &Path,
    agent_id: &str,
    install: bool,
) -> Result<Vec<AgentSkillStatus>, String> {
    let spec = AGENT_TARGETS
        .iter()
        .find(|candidate| candidate.id == agent_id)
        .ok_or_else(|| format!("Unsupported AI agent: {agent_id}"))?;
    let source = canonical(home);
    let target = (spec.dir)(home);
    if install {
        fs_ops::install_target(&target, &source, SKILL, write_managed)?;
    } else {
        if spec.id == "codex" {
            materialize_other_links(home, &source)?;
        }
        fs_ops::uninstall_target(&target, &source, SKILL)?;
        let statuses = list_skills_for_home(home);
        if !statuses.iter().any(|item| item.installed) && fs_ops::is_managed(&source, SKILL) {
            fs_ops::uninstall_target(&source, &source, SKILL)?;
        }
        return Ok(statuses);
    }
    Ok(list_skills_for_home(home))
}

#[tauri::command]
pub fn agent_api_list_skills() -> Result<Vec<AgentSkillStatus>, String> {
    Ok(list_skills_for_home(&home()?))
}

#[tauri::command]
pub fn agent_api_set_skill_installed(
    agent_id: String,
    installed: bool,
) -> Result<Vec<AgentSkillStatus>, String> {
    set_skill_for_home(&home()?, &agent_id, installed)
}

#[tauri::command]
pub fn install_agent_skill() -> Result<Vec<String>, String> {
    let home = home()?;
    let source = canonical(&home);
    let mut paths = Vec::with_capacity(AGENT_TARGETS.len());
    for spec in AGENT_TARGETS {
        let target = (spec.dir)(&home);
        fs_ops::install_target(&target, &source, SKILL, write_managed)?;
        paths.push(target.display().to_string());
    }
    Ok(paths)
}

#[tauri::command]
pub fn uninstall_agent_skill() -> Result<Vec<String>, String> {
    let home = home()?;
    let source = canonical(&home);
    let mut removed = Vec::new();
    for spec in AGENT_TARGETS {
        let target = (spec.dir)(&home);
        if fs_ops::is_linked_to(&target, &source) || fs_ops::is_managed(&target, SKILL) {
            if fs_ops::uninstall_target(&target, &source, SKILL)? {
                removed.push(target.display().to_string());
            }
        }
    }
    if fs_ops::is_managed(&source, SKILL) && fs_ops::uninstall_target(&source, &source, SKILL)? {
        removed.push(source.display().to_string());
    }
    Ok(removed)
}

#[cfg(test)]
#[path = "skills_tests.rs"]
mod tests;
