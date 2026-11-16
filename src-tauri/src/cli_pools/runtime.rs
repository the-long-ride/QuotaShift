use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use super::controller::{plan_rotation, RotationPlan};
use super::conversation::ConversationHistoryItem;
use super::idle::probe_cli_instance_idle;
use super::process_inventory::{provider_to_cli_kind, scan_cli_instances, CliInstance};
use super::types::CliRotationPoolV1;

/// Read-only native preflight. No process is terminated, no auth file is written.
/// The UI must confirm eligibility again before invoking the existing Apply path.
#[tauri::command]
pub async fn cli_pool_preflight_auto_rotation(
    pool: CliRotationPoolV1,
    current_account_id: String,
    unavailable_account_ids: Vec<String>,
    continuation_prompt: String,
) -> Result<RotationPlan, String> {
    tokio::task::spawn_blocking(move || {
        preflight_auto_rotation_sync(
            pool,
            current_account_id,
            unavailable_account_ids,
            continuation_prompt,
        )
    })
    .await
    .map_err(|err| format!("CLI rotation preflight task failed: {err}"))?
}

fn preflight_auto_rotation_sync(
    pool: CliRotationPoolV1,
    current_account_id: String,
    unavailable_account_ids: Vec<String>,
    continuation_prompt: String,
) -> Result<RotationPlan, String> {
    if unavailable_account_ids.len() > pool.account_ids.len() {
        return Err("Invalid unavailable account set".into());
    }
    if unavailable_account_ids
        .iter()
        .any(|id| !pool.account_ids.contains(id))
    {
        return Err("Unknown account in unavailable set".into());
    }

    let instances = scan_cli_instances(pool.provider, Some(&current_account_id));
    validate_auto_preflight(&pool, &current_account_id, &instances)?;
    // Reuse the existing Codex/agy rollout correlation, not filesystem guesses.
    let snapshots = crate::system::cli_restore::capture(provider_to_cli_kind(pool.provider));
    let history: Vec<ConversationHistoryItem> = snapshots
        .iter()
        .filter_map(|snapshot| {
            let cwd = snapshot.cwd.as_ref()?;
            let id = snapshot.conversation.as_ref()?;
            Some(ConversationHistoryItem {
                conversation_id: id.clone(),
                workspace: cwd.clone(),
                timestamp_secs: snapshot.started_at,
            })
        })
        .collect();
    let unavailable: HashSet<String> = unavailable_account_ids.into_iter().collect();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let plan = plan_rotation(
        &pool,
        true,
        &current_account_id,
        &unavailable,
        &instances,
        &history,
        &continuation_prompt,
        now,
    )
    .map_err(|err| format!("CLI rotation preflight blocked: {err:?}"))?;
    if !std::path::Path::new(&plan.cwd).is_dir() {
        return Err("CLI working directory is no longer present".into());
    }
    Ok(plan)
}

fn validate_auto_preflight(
    pool: &CliRotationPoolV1,
    current_id: &str,
    instances: &[CliInstance],
) -> Result<(), String> {
    if !pool.enabled || !pool.auto_switch || pool.account_ids.len() < 2 {
        return Err("Automatic CLI rotation is not enabled for this pool".into());
    }
    if !pool.account_ids.iter().any(|id| id == current_id) {
        return Err("Active account is not a member of the selected pool".into());
    }
    if pool.switch_when_idle_only {
        let mut matching = instances
            .iter()
            .filter(|instance| instance.provider == pool.provider);
        let Some(target) = matching.next() else {
            return Err("No running CLI instance found to verify idle state".into());
        };
        if matching.next().is_some() {
            return Err("Multiple CLI instances running; idle state is ambiguous".into());
        }
        probe_cli_instance_idle(target, pool.provider)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::process_inventory::{ProcessIdentity, ProcessOwnership};
    use super::super::types::{CliProvider, QuotaWindowKind};
    use super::*;
    #[test]
    fn respects_explicit_idle_only_guard_and_probes_instance() {
        let mut pool = CliRotationPoolV1 {
            id: "pool".into(),
            provider: CliProvider::Codex,
            name: "test".into(),
            account_ids: vec!["one".into(), "two".into()],
            enabled: true,
            auto_switch: true,
            trigger_windows: vec![QuotaWindowKind::FiveHour],
            fallback_latest_enabled: true,
            switch_when_idle_only: true,
        };
        assert!(validate_auto_preflight(&pool, "one", &[]).is_err());
        let missing_pid = CliInstance {
            identity: ProcessIdentity {
                pid: 0,
                started_at: 0,
                executable: "codex".into(),
                cwd: None,
            },
            launch_executable: Some("codex".into()),
            provider: CliProvider::Codex,
            related_pids: vec![],
            args: vec![],
            ownership: ProcessOwnership::Unattributed,
        };
        assert!(validate_auto_preflight(&pool, "one", &[missing_pid]).is_err());
        pool.switch_when_idle_only = false;
        assert!(validate_auto_preflight(&pool, "one", &[]).is_ok());
        assert!(validate_auto_preflight(&pool, "unknown", &[]).is_err());
    }

    #[test]
    fn idle_helpers_guard_descendants_cpu_and_rollout_mtime() {
        use super::super::idle::{
            check_cpu_within_limit, ensure_file_quiet, find_active_descendant,
            resolve_codex_rollout_file,
        };
        use std::time::{Duration, SystemTime};
        let own = HashSet::from([4, 5, 6]);
        assert_eq!(
            find_active_descendant(5, &own, &[(4, Some(3)), (5, Some(4)), (6, Some(5))]),
            None
        );
        assert_eq!(
            find_active_descendant(
                5,
                &own,
                &[(4, Some(3)), (5, Some(4)), (6, Some(5)), (7, Some(6))]
            ),
            Some(7)
        );
        assert!(check_cpu_within_limit(2.0).is_ok());
        assert!(check_cpu_within_limit(2.1).is_err());
        assert!(check_cpu_within_limit(f32::NAN).is_err());
        let dir = std::env::temp_dir().join(format!("qs-idle-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("rollout.jsonl");
        std::fs::write(&file, "{\"type\":\"session_meta\",\"payload\":{\"id\":\"0d4fca35-017e-4725-8940-b4deb9c27a11\",\"cwd\":\"F:\\\\repo\",\"originator\":\"codex_cli_rs\"}}\n").unwrap();
        let inst = CliInstance {
            identity: ProcessIdentity {
                pid: 100,
                started_at: 100,
                executable: "codex".into(),
                cwd: Some("f:/repo".into()),
            },
            launch_executable: Some("codex".into()),
            provider: CliProvider::Codex,
            related_pids: vec![],
            args: vec![],
            ownership: ProcessOwnership::Unattributed,
        };
        let resolved = resolve_codex_rollout_file(&inst, &dir).unwrap();
        let (now, quiet) = (SystemTime::now(), Duration::from_secs(10));
        assert!(ensure_file_quiet(&resolved, now, quiet).is_err());
        assert!(ensure_file_quiet(&resolved, now + Duration::from_secs(15), quiet).is_ok());
        let mut missing_pid = inst;
        missing_pid.identity.pid = u32::MAX - 1;
        assert!(probe_cli_instance_idle(&missing_pid, CliProvider::Codex).is_err());
        missing_pid.identity.pid = 0;
        assert!(probe_cli_instance_idle(&missing_pid, CliProvider::Codex).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
