//! Which conversation a running CLI is in: Codex rollout files and the agy prompt history.

use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde_json::Value;

use super::{CliKind, CliSnapshot};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RolloutMeta {
    pub id: String,
    pub cwd: String,
    pub originator: String,
    /// File modification time, epoch seconds.
    pub modified: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntry {
    pub conversation_id: String,
    pub workspace: String,
    pub timestamp_ms: u64,
}

/// Drive-letter paths compare case-insensitively on every platform, so Windows paths match
/// in Linux CI too. Other paths keep their case unless this is Windows.
pub fn normalize_path(path: &str) -> String {
    let unified = path.trim().replace('\\', "/");
    let stripped = unified.strip_prefix("//?/").unwrap_or(&unified);
    let trimmed = stripped.trim_end_matches('/');
    if cfg!(target_os = "windows") || trimmed.as_bytes().get(1) == Some(&b':') {
        trimmed.to_ascii_lowercase()
    } else {
        trimmed.to_string()
    }
}

/// Ids end up on a command line, so only plain id characters pass.
pub fn valid_id(id: &str) -> bool {
    (8..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

pub fn parse_rollout_head(line: &str, modified: u64) -> Option<RolloutMeta> {
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    if value.get("type")?.as_str()? != "session_meta" {
        return None;
    }
    let payload = value.get("payload")?;
    Some(RolloutMeta {
        id: payload.get("id")?.as_str()?.to_string(),
        cwd: payload.get("cwd")?.as_str()?.to_string(),
        originator: payload
            .get("originator")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        modified,
    })
}

pub fn parse_history_line(line: &str) -> Option<HistoryEntry> {
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    Some(HistoryEntry {
        conversation_id: value.get("conversationId")?.as_str()?.to_string(),
        workspace: value.get("workspace")?.as_str()?.to_string(),
        timestamp_ms: value.get("timestamp")?.as_u64()?,
    })
}

fn flag_value(args: &[String], flag: &str) -> Option<String> {
    let inline = format!("{flag}=");
    args.iter().enumerate().find_map(|(i, arg)| {
        if let Some(value) = arg.strip_prefix(&inline) {
            return Some(value.to_string());
        }
        (arg == flag).then(|| args.get(i + 1).cloned()).flatten()
    })
}

/// The id the CLI was started with, if any (`codex resume <id>`, `agy --conversation <id>`).
pub fn explicit_id(kind: CliKind, args: &[String]) -> Option<String> {
    let id = match kind {
        CliKind::Codex => flag_value(args, "resume"),
        CliKind::Agy => flag_value(args, "--conversation"),
    }?;
    valid_id(&id).then_some(id)
}

/// The desktop app and the IDE extension write rollouts too; they are not this CLI.
fn is_cli_originator(originator: &str) -> bool {
    let lower = originator.to_ascii_lowercase();
    !(lower.contains("desktop") || lower.contains("vscode") || lower.contains("extension"))
}

fn pick_codex(
    metas: &[RolloutMeta],
    cwd: &str,
    started_at: u64,
    claimed: &[String],
) -> Option<String> {
    let want = normalize_path(cwd);
    metas
        .iter()
        .filter(|m| {
            m.modified >= started_at
                && normalize_path(&m.cwd) == want
                && is_cli_originator(&m.originator)
                && valid_id(&m.id)
                && !claimed.contains(&m.id)
        })
        .max_by_key(|m| m.modified)
        .map(|m| m.id.clone())
}

fn pick_agy(
    history: &[HistoryEntry],
    cwd: &str,
    started_at: u64,
    claimed: &[String],
) -> Option<String> {
    let want = normalize_path(cwd);
    history
        .iter()
        .rev()
        .find(|e| {
            e.timestamp_ms / 1000 >= started_at
                && normalize_path(&e.workspace) == want
                && valid_id(&e.conversation_id)
                && !claimed.contains(&e.conversation_id)
        })
        .map(|e| e.conversation_id.clone())
}

/// Instances are served newest start first, each taking the newest record nobody claimed yet.
/// Oldest first would let an early instance grab the record of a later one in the same folder,
/// leaving that later instance with nothing but `--last`. An id the user typed on the command
/// line is claimed up front so no other instance takes it.
pub fn assign_with(
    kind: CliKind,
    snapshots: &mut [CliSnapshot],
    metas: &[RolloutMeta],
    history: &[HistoryEntry],
) {
    let mut claimed: Vec<String> = snapshots
        .iter()
        .filter_map(|snap| explicit_id(kind, &snap.args))
        .collect();
    let mut order: Vec<usize> = (0..snapshots.len()).collect();
    order.sort_by_key(|&i| std::cmp::Reverse((snapshots[i].started_at, snapshots[i].pid)));
    for index in order {
        let snap = &mut snapshots[index];
        let cwd = snap.cwd.clone().unwrap_or_default();
        let id = explicit_id(kind, &snap.args).or_else(|| match kind {
            CliKind::Codex => pick_codex(metas, &cwd, snap.started_at, &claimed),
            CliKind::Agy => pick_agy(history, &cwd, snap.started_at, &claimed),
        });
        if let Some(id) = &id {
            if !claimed.contains(id) {
                claimed.push(id.clone());
            }
        }
        snap.conversation = id;
    }
}

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn first_line(path: &Path) -> Option<String> {
    let mut line = String::new();
    BufReader::new(File::open(path).ok()?)
        .read_line(&mut line)
        .ok()?;
    Some(line)
}

fn read_codex_metas(since: u64) -> Vec<RolloutMeta> {
    let codex_home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| home().map(|h| h.join(".codex")));
    let Some(root) = codex_home.map(|h| h.join("sessions")) else {
        return Vec::new();
    };
    let mut metas = Vec::new();
    let mut dirs = vec![root];
    while let Some(dir) = dirs.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(info) = entry.metadata() else {
                continue;
            };
            if info.is_dir() {
                dirs.push(path);
                continue;
            }
            let modified = info
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if modified < since || path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            if let Some(meta) = first_line(&path).and_then(|l| parse_rollout_head(&l, modified)) {
                metas.push(meta);
            }
        }
    }
    metas
}

fn read_agy_history() -> Vec<HistoryEntry> {
    let Some(path) = home().map(|h| {
        h.join(".gemini")
            .join("antigravity-cli")
            .join("history.jsonl")
    }) else {
        return Vec::new();
    };
    let read_tail = || -> std::io::Result<String> {
        let mut file = File::open(&path)?;
        let len = file.metadata()?.len();
        file.seek(SeekFrom::Start(len.saturating_sub(1 << 20)))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    };
    read_tail()
        .map(|text| text.lines().filter_map(parse_history_line).collect())
        .unwrap_or_default()
}

/// Fills `conversation` on each snapshot from the CLI's own records on disk.
pub fn assign(kind: CliKind, snapshots: &mut [CliSnapshot]) {
    let since = snapshots.iter().map(|s| s.started_at).min().unwrap_or(0);
    match kind {
        CliKind::Codex => assign_with(kind, snapshots, &read_codex_metas(since), &[]),
        CliKind::Agy => assign_with(kind, snapshots, &[], &read_agy_history()),
    }
}
