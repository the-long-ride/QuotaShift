use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use super::process_inventory::CliInstance;
use super::types::CliProvider;
use crate::system::cli_restore::conversation::{
    explicit_id, normalize_path, parse_history_line, parse_rollout_head, HistoryEntry,
};
use crate::system::cli_restore::CliKind;

pub type CliPoolProvider = CliProvider;

const CPU_SAMPLE_DELAY: Duration = Duration::from_millis(150);
const MAX_IDLE_CPU_PERCENT: f32 = 2.0;
const SESSION_QUIET_SECS: u64 = 10;

pub fn probe_cli_instance_idle(
    instance: &CliInstance,
    provider: CliPoolProvider,
) -> Result<(), String> {
    if instance.identity.pid == 0 {
        return Err("CLI process PID is missing".into());
    }
    let mut own_pids: HashSet<u32> = instance.related_pids.iter().copied().collect();
    own_pids.insert(instance.identity.pid);

    let refresh = ProcessRefreshKind::new().with_cpu();
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, refresh);
    verify_sample(&sys, instance, &own_pids)?;

    std::thread::sleep(CPU_SAMPLE_DELAY);
    sys.refresh_processes_specifics(ProcessesToUpdate::All, refresh);
    verify_sample(&sys, instance, &own_pids)?;

    let cpu: f32 = own_pids
        .iter()
        .filter_map(|pid| sys.process(Pid::from_u32(*pid)))
        .map(|p| p.cpu_usage())
        .sum();
    check_cpu_within_limit(cpu)?;
    check_session_file_quiet(instance, provider, SystemTime::now())
}

fn verify_sample(
    sys: &System,
    instance: &CliInstance,
    own_pids: &HashSet<u32>,
) -> Result<(), String> {
    let pid = instance.identity.pid;
    let proc = sys
        .process(Pid::from_u32(pid))
        .ok_or_else(|| format!("CLI process PID {pid} is no longer running"))?;
    if instance.identity.started_at > 0 && proc.start_time() != instance.identity.started_at {
        return Err(format!("CLI process PID {pid} identity changed"));
    }
    let edges: Vec<(u32, Option<u32>)> = sys
        .processes()
        .iter()
        .map(|(p, info)| (p.as_u32(), info.parent().map(|pp| pp.as_u32())))
        .collect();
    if let Some(child) = find_active_descendant(pid, own_pids, &edges) {
        return Err(format!(
            "CLI process has active child process (PID {child})"
        ));
    }
    Ok(())
}

pub(super) fn find_active_descendant(
    root_pid: u32,
    own_pids: &HashSet<u32>,
    edges: &[(u32, Option<u32>)],
) -> Option<u32> {
    let mut queue = vec![root_pid];
    let mut visited = HashSet::from([root_pid]);
    let mut idx = 0;
    while idx < queue.len() {
        let current = queue[idx];
        idx += 1;
        for &(pid, parent) in edges {
            if parent != Some(current) || !visited.insert(pid) {
                continue;
            }
            if !own_pids.contains(&pid) {
                return Some(pid);
            }
            queue.push(pid);
        }
    }
    None
}

pub(super) fn check_cpu_within_limit(cpu_percent: f32) -> Result<(), String> {
    if !cpu_percent.is_finite() || cpu_percent > MAX_IDLE_CPU_PERCENT {
        return Err(format!(
            "CLI process is busy (CPU {cpu_percent:.1}% > {MAX_IDLE_CPU_PERCENT:.1}%)"
        ));
    }
    Ok(())
}

fn session_source(provider: CliPoolProvider) -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from);
    if provider == CliProvider::Codex {
        return std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .or_else(|| home.map(|h| h.join(".codex")))
            .map(|b| b.join("sessions"));
    }
    home.map(|h| h.join(".gemini/antigravity-cli/history.jsonl"))
}

pub(super) fn resolve_session_activity_secs(
    instance: &CliInstance,
    provider: CliPoolProvider,
) -> Option<u64> {
    let source = session_source(provider)?;
    match provider {
        CliProvider::Codex => resolve_codex_rollout_activity(instance, &source).map(|(_, ts)| ts),
        CliProvider::Agy => latest_agy_history_entry(instance, &source)
            .ok()?
            .map(|(e, _)| e.timestamp_ms / 1000),
    }
}

fn check_session_file_quiet(
    instance: &CliInstance,
    provider: CliPoolProvider,
    now: SystemTime,
) -> Result<(), String> {
    let quiet = Duration::from_secs(SESSION_QUIET_SECS);
    let Some(source) = session_source(provider) else {
        return Ok(());
    };
    if provider == CliProvider::Codex {
        if let Some((path, _)) = resolve_codex_rollout_activity(instance, &source) {
            ensure_file_quiet(&path, now, quiet)?;
        }
        return Ok(());
    }
    let Some((entry, is_last)) = latest_agy_history_entry(instance, &source)? else {
        return Ok(());
    };
    let now_ms = now
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    if now_ms.saturating_sub(entry.timestamp_ms) < quiet.as_millis() as u64 {
        return Err("Session history entry was written within the last 10s".into());
    }
    if is_last {
        ensure_file_quiet(&source, now, quiet)?;
    }
    Ok(())
}

fn matches_session(
    instance: &CliInstance,
    explicit: Option<&str>,
    id: &str,
    cwd: &str,
    ts: u64,
) -> bool {
    if let Some(target) = explicit {
        return id == target;
    }
    instance.identity.cwd.as_deref().is_some_and(|want| {
        ts >= instance.identity.started_at && normalize_path(cwd) == normalize_path(want)
    })
}

pub(super) fn resolve_codex_rollout_file(
    instance: &CliInstance,
    sessions_dir: &Path,
) -> Option<PathBuf> {
    resolve_codex_rollout_activity(instance, sessions_dir).map(|(path, _)| path)
}

pub(super) fn resolve_codex_rollout_activity(
    instance: &CliInstance,
    sessions_dir: &Path,
) -> Option<(PathBuf, u64)> {
    if !sessions_dir.is_dir() {
        return None;
    }
    let explicit = explicit_id(CliKind::Codex, &instance.args);
    let mut dirs = vec![sessions_dir.to_path_buf()];
    let mut best: Option<(u64, PathBuf)> = None;
    while let Some(dir) = dirs.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                dirs.push(path);
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs());
            let mut line = String::new();
            let Ok(file) = File::open(&path) else {
                continue;
            };
            if BufReader::new(file).read_line(&mut line).is_err() {
                continue;
            }
            let Some(head) = parse_rollout_head(&line, modified) else {
                continue;
            };
            let lower = head.originator.to_ascii_lowercase();
            let is_cli = !["desktop", "vscode", "extension"]
                .iter()
                .any(|s| lower.contains(s));
            if is_cli
                && matches_session(
                    instance,
                    explicit.as_deref(),
                    &head.id,
                    &head.cwd,
                    head.modified,
                )
                && best.as_ref().is_none_or(|(ts, _)| head.modified > *ts)
            {
                best = Some((head.modified, path));
            }
        }
    }
    best.map(|(ts, path)| (path, ts))
}

pub(super) fn latest_agy_history_entry(
    instance: &CliInstance,
    history_path: &Path,
) -> Result<Option<(HistoryEntry, bool)>, String> {
    if !history_path.is_file() {
        return Ok(None);
    }
    let bytes = (|| -> std::io::Result<Vec<u8>> {
        let mut file = File::open(history_path)?;
        let len = file.metadata()?.len();
        file.seek(SeekFrom::Start(len.saturating_sub(1 << 20)))?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        Ok(buf)
    })()
    .map_err(|e| format!("Failed to read history: {e}"))?;
    let entries: Vec<HistoryEntry> = String::from_utf8_lossy(&bytes)
        .lines()
        .filter_map(parse_history_line)
        .collect();
    let explicit = explicit_id(CliKind::Agy, &instance.args);
    let entry = entries
        .iter()
        .filter(|e| {
            matches_session(
                instance,
                explicit.as_deref(),
                &e.conversation_id,
                &e.workspace,
                e.timestamp_ms / 1000,
            )
        })
        .max_by_key(|e| e.timestamp_ms);
    Ok(entry.map(|e| (e.clone(), entries.last() == Some(e))))
}

pub(super) fn ensure_file_quiet(
    path: &Path,
    now: SystemTime,
    quiet: Duration,
) -> Result<(), String> {
    let modified = fs::metadata(path)
        .and_then(|meta| meta.modified())
        .map_err(|e| format!("Failed to inspect session file timestamp: {e}"))?;
    match now.duration_since(modified) {
        Ok(elapsed) if elapsed >= quiet => Ok(()),
        _ => Err("Session/rollout file was modified within the last 10s".into()),
    }
}
