use std::collections::HashSet;

use crate::cli_pools::idle::resolve_session_activity_secs;
use crate::cli_pools::process_inventory::CliInstance;
use crate::cli_pools::types::CliProvider;
use crate::system::cli_restore::conversation::normalize_path;

/// Activity window (5 minutes) used to disambiguate multiple live CLI processes.
pub const ACTIVE_SESSION_WINDOW_SECS: u64 = 5 * 60;

/// Selects a single unambiguous active CLI instance when multiple instances are running
/// for the same provider.
///
/// Fails closed (`None`) unless:
/// 1. Every candidate has a non-empty, distinct normalized `cwd` (no peers sharing a `cwd`), and
/// 2. Exactly one candidate has the most recent resolved rollout/session file activity within
///    the last 5 minutes (`now.saturating_sub(ts) <= ACTIVE_SESSION_WINDOW_SECS`).
pub fn disambiguate_active_instance<'a>(
    provider: CliProvider,
    candidates: &[&'a CliInstance],
    now: u64,
) -> Option<&'a CliInstance> {
    disambiguate_active_instance_with(candidates, now, |inst| {
        resolve_session_activity_secs(inst, provider)
    })
}

pub(crate) fn disambiguate_active_instance_with<'a, F>(
    candidates: &[&'a CliInstance],
    now: u64,
    mut resolve_activity: F,
) -> Option<&'a CliInstance>
where
    F: FnMut(&CliInstance) -> Option<u64>,
{
    if candidates.len() <= 1 || !all_distinct_cwds(candidates) {
        return None;
    }

    let mut best_ts: Option<u64> = None;
    let mut best_instance: Option<&'a CliInstance> = None;
    let mut tied = false;

    for &inst in candidates {
        let Some(ts) = resolve_activity(inst) else {
            continue;
        };
        if now.saturating_sub(ts) > ACTIVE_SESSION_WINDOW_SECS {
            continue;
        }
        match best_ts {
            None => {
                best_ts = Some(ts);
                best_instance = Some(inst);
                tied = false;
            }
            Some(current_best) if ts > current_best => {
                best_ts = Some(ts);
                best_instance = Some(inst);
                tied = false;
            }
            Some(current_best) if ts == current_best => {
                tied = true;
            }
            Some(_) => {}
        }
    }

    if tied {
        None
    } else {
        best_instance
    }
}

fn all_distinct_cwds(candidates: &[&CliInstance]) -> bool {
    let mut seen = HashSet::with_capacity(candidates.len());
    for inst in candidates {
        let Some(cwd) = inst
            .identity
            .cwd
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            return false;
        };
        if !seen.insert(normalize_path(cwd)) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli_pools::controller::{
        plan_rotation, plan_rotation_with_activity, ControllerError,
    };
    use crate::cli_pools::conversation::ConversationHistoryItem;
    use crate::cli_pools::idle::{latest_agy_history_entry, resolve_codex_rollout_activity};
    use crate::cli_pools::process_inventory::{ProcessIdentity, ProcessOwnership};
    use crate::cli_pools::types::{CliRotationPoolV1, QuotaWindowKind};
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn inst(pid: u32, provider: CliProvider, cwd: Option<&str>, started_at: u64) -> CliInstance {
        CliInstance {
            identity: ProcessIdentity {
                pid,
                started_at,
                executable: "codex.exe".into(),
                cwd: cwd.map(str::to_string),
            },
            launch_executable: Some("codex.exe".into()),
            provider,
            related_pids: vec![pid],
            args: vec![],
            ownership: ProcessOwnership::Unattributed,
        }
    }

    fn pool(provider: CliProvider) -> CliRotationPoolV1 {
        CliRotationPoolV1 {
            id: "pool-1".into(),
            provider,
            name: "Pool".into(),
            account_ids: vec!["acc-1".into(), "acc-2".into()],
            enabled: true,
            auto_switch: true,
            trigger_windows: vec![QuotaWindowKind::FiveHour],
            fallback_latest_enabled: true,
            switch_when_idle_only: false,
        }
    }

    #[test]
    fn disambiguates_single_recent_active_instance_across_distinct_cwds() {
        let a = inst(1, CliProvider::Codex, Some("F:\\repo-a"), 100);
        let b = inst(2, CliProvider::Codex, Some("F:\\repo-b"), 100);
        let activity = HashMap::from([(1u32, 950u64), (2u32, 500u64)]);
        let picked = disambiguate_active_instance_with(&[&a, &b], 1000, |i| {
            activity.get(&i.identity.pid).copied()
        });
        assert_eq!(picked.map(|i| i.identity.pid), Some(1));

        let both_recent = HashMap::from([(1u32, 950u64), (2u32, 850u64)]);
        let picked = disambiguate_active_instance_with(&[&a, &b], 1000, |i| {
            both_recent.get(&i.identity.pid).copied()
        });
        assert_eq!(picked.map(|i| i.identity.pid), Some(1));
    }

    #[test]
    fn fails_closed_on_ties_stale_activity_or_same_normalized_cwd() {
        let a = inst(1, CliProvider::Codex, Some("F:\\repo-a"), 100);
        let b = inst(2, CliProvider::Codex, Some("F:\\repo-b"), 100);
        let tied = HashMap::from([(1u32, 950u64), (2u32, 950u64)]);
        assert!(disambiguate_active_instance_with(&[&a, &b], 1000, |i| {
            tied.get(&i.identity.pid).copied()
        })
        .is_none());

        let stale = HashMap::from([(1u32, 699u64), (2u32, 500u64)]);
        assert!(disambiguate_active_instance_with(&[&a, &b], 1000, |i| {
            stale.get(&i.identity.pid).copied()
        })
        .is_none());

        let exact_boundary = HashMap::from([(1u32, 700u64)]);
        assert_eq!(
            disambiguate_active_instance_with(&[&a, &b], 1000, |i| {
                exact_boundary.get(&i.identity.pid).copied()
            })
            .map(|i| i.identity.pid),
            Some(1)
        );

        let same_a = inst(1, CliProvider::Codex, Some("F:\\Repo"), 100);
        let same_b = inst(2, CliProvider::Codex, Some("f:/repo/"), 100);
        let one_active = HashMap::from([(1u32, 990u64)]);
        assert!(
            disambiguate_active_instance_with(&[&same_a, &same_b], 1000, |i| {
                one_active.get(&i.identity.pid).copied()
            })
            .is_none()
        );

        let c_dup = inst(3, CliProvider::Codex, Some("f:/repo-b/"), 100);
        assert!(
            disambiguate_active_instance_with(&[&a, &b, &c_dup], 1000, |i| {
                one_active.get(&i.identity.pid).copied()
            })
            .is_none()
        );

        let no_cwd = inst(4, CliProvider::Codex, None, 100);
        assert!(
            disambiguate_active_instance_with(&[&a, &no_cwd], 1000, |i| {
                one_active.get(&i.identity.pid).copied()
            })
            .is_none()
        );
    }

    #[test]
    fn plan_rotation_selects_disambiguated_target_or_fails_closed() {
        let a = inst(11, CliProvider::Codex, Some("F:\\repo-a"), 100);
        let b = inst(12, CliProvider::Codex, Some("F:\\repo-b"), 100);
        let history = vec![ConversationHistoryItem {
            conversation_id: "00000000-0000-4000-8000-000000000011".into(),
            workspace: "F:\\repo-a".into(),
            timestamp_secs: 150,
        }];
        let activity = HashMap::from([(11u32, 980u64), (12u32, 200u64)]);
        let plan = plan_rotation_with_activity(
            &pool(CliProvider::Codex),
            true,
            "acc-1",
            &HashSet::new(),
            &[a.clone(), b.clone()],
            &history,
            "continue",
            1000,
            |i| activity.get(&i.identity.pid).copied(),
        )
        .expect("should disambiguate active instance");
        assert_eq!(plan.target_pid, 11);
        assert_eq!(plan.cwd, "F:\\repo-a");

        let dup_b = inst(13, CliProvider::Codex, Some("f:/repo-a/"), 100);
        let err = plan_rotation(
            &pool(CliProvider::Codex),
            true,
            "acc-1",
            &HashSet::new(),
            &[a, dup_b],
            &history,
            "continue",
            1000,
        )
        .unwrap_err();
        assert_eq!(err, ControllerError::AmbiguousMultipleProcesses);
    }

    #[test]
    fn resolves_disk_rollout_and_agy_history_activity_timestamps() {
        let dir = std::env::temp_dir().join(format!("qs-disambiguate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let sessions = dir.join("sessions");
        std::fs::create_dir_all(&sessions).unwrap();
        let rollout = sessions.join("r1.jsonl");
        std::fs::write(&rollout, "{\"type\":\"session_meta\",\"payload\":{\"id\":\"00000000-0000-4000-8000-000000000021\",\"cwd\":\"F:\\\\repo-a\",\"originator\":\"codex_cli_rs\"}}\n").unwrap();
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let codex_a = inst(21, CliProvider::Codex, Some("f:/repo-a"), 100);
        let codex_b = inst(22, CliProvider::Codex, Some("f:/repo-b"), 100);
        let (_, ts_a) = resolve_codex_rollout_activity(&codex_a, &sessions).unwrap();
        assert!(now_secs.saturating_sub(ts_a) <= 10);
        assert_eq!(resolve_codex_rollout_activity(&codex_b, &sessions), None);

        let hist = dir.join("history.jsonl");
        std::fs::write(&hist, format!("{{\"conversationId\":\"00000000-0000-4000-8000-000000000031\",\"workspace\":\"F:\\\\repo-a\",\"timestamp\":{}}}\n", (now_secs - 20) * 1000)).unwrap();
        let agy_a = inst(31, CliProvider::Agy, Some("f:/repo-a"), 100);
        let agy_b = inst(32, CliProvider::Agy, Some("f:/repo-b"), 100);
        assert_eq!(
            latest_agy_history_entry(&agy_a, &hist)
                .unwrap()
                .map(|(e, _)| e.timestamp_ms / 1000),
            Some(now_secs - 20)
        );
        assert_eq!(latest_agy_history_entry(&agy_b, &hist).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
