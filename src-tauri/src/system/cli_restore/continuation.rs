//! One-shot resume prompt, scoped to a verified PID and process start time.
use std::sync::Mutex;
use std::time::{Duration, Instant};
use super::{CliKind, CliSnapshot};

struct Pending {
    kind: CliKind,
    pid: u32,
    started_at: u64,
    prompt: String,
    armed_at: Instant,
}
#[derive(Clone)]
struct Completed {
    kind: CliKind,
    pid: u32,
    success: bool,
}
#[derive(Default)]
struct ContinuationSlot {
    pending: Option<Pending>,
    completed: Option<Completed>,
}
static SLOT: Mutex<ContinuationSlot> = Mutex::new(ContinuationSlot {
    pending: None, completed: None,
});
const TIMEOUT: Duration = Duration::from_secs(90);

pub fn arm(kind: CliKind, pid: u32, started_at: u64, prompt: String) -> Result<(), String> {
    crate::cli_pools::command::validate_prompt(&prompt)
        .map_err(|e| format!("Invalid continuation prompt: {e:?}"))?;
    if pid == 0 || started_at == 0 { return Err("Missing target process identity".into()); }
    let mut slot = SLOT.lock().map_err(|_| "Continuation lock unavailable")?;
    if slot.pending.as_ref().is_some_and(|pending| pending.armed_at.elapsed() < TIMEOUT) {
        return Err("A continuation handoff is already armed".into());
    }
    slot.pending = Some(Pending { kind, pid, started_at, prompt, armed_at: Instant::now() });
    slot.completed = None;
    Ok(())
}

pub fn take_for(snapshot: &CliSnapshot) -> Option<String> {
    let mut slot = SLOT.lock().ok()?;
    if slot.pending.as_ref().is_some_and(|pending| pending.armed_at.elapsed() >= TIMEOUT) {
        slot.pending = None;
    }
    if slot.pending.as_ref().is_some_and(|pending| pending.kind == snapshot.kind
        && pending.pid == snapshot.pid && pending.started_at == snapshot.started_at) {
        return slot.pending.take().map(|pending| pending.prompt);
    }
    None
}
pub fn mark_result(kind: CliKind, pid: u32, success: bool) {
    if let Ok(mut slot) = SLOT.lock() {
        slot.completed = Some(Completed { kind, pid, success });
    }
}
pub fn result(kind: CliKind, pid: u32) -> bool {
    SLOT.lock().ok().and_then(|slot| slot.completed.as_ref()
        .filter(|value| value.kind == kind && value.pid == pid)
        .map(|value| value.success)).unwrap_or(false)
}
pub fn clear(kind: CliKind, pid: u32) {
    if let Ok(mut slot) = SLOT.lock() {
        if slot.pending.as_ref().is_some_and(|pending| pending.kind == kind && pending.pid == pid) {
            slot.pending = None;
        }
        if slot.completed.as_ref().is_some_and(|completed| completed.kind == kind && completed.pid == pid) {
            slot.completed = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::system::cli_restore::{CliKind, CliSnapshot};
    fn snapshot(pid: u32) -> CliSnapshot {
        CliSnapshot {
            kind: CliKind::Codex, pid, pids: vec![pid], started_at: 100,
            cwd: Some("/tmp".into()), args: vec![], conversation: None,
            shell: None, terminal: None, tmux_pane: None,
        }
    }
    #[test]
    fn continuation_is_one_shot_and_bound_to_original_pid_and_start() {
        clear(CliKind::Codex, 100);
        arm(CliKind::Codex, 100, 100, "continue remaining works".into()).unwrap();
        assert!(take_for(&snapshot(101)).is_none());
        let mut reused = snapshot(100);
        reused.started_at += 1;
        assert!(take_for(&reused).is_none());
        assert_eq!(take_for(&snapshot(100)).as_deref(), Some("continue remaining works"));
        assert!(take_for(&snapshot(100)).is_none());
        clear(CliKind::Codex, 100);
    }
    #[test]
    fn cannot_arm_empty_or_nul_prompt() {
        assert!(arm(CliKind::Agy, 1, 1, "".into()).is_err());
        assert!(arm(CliKind::Agy, 1, 1, "hi\0".into()).is_err());
    }
}
