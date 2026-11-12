use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use super::controller::{plan_rotation, RotationPlan};
use super::conversation::ConversationHistoryItem;
use super::process_inventory::{provider_to_cli_kind, scan_cli_instances};
use super::types::CliRotationPoolV1;

/// Read-only native preflight. No process is terminated, no auth file is written.
/// The UI must confirm eligibility again before invoking the existing Apply path.
#[tauri::command]
pub fn cli_pool_preflight_auto_rotation(
    pool: CliRotationPoolV1,
    current_account_id: String,
    unavailable_account_ids: Vec<String>,
    continuation_prompt: String,
) -> Result<RotationPlan, String> {
    validate_auto_preflight(&pool, &current_account_id)?;
    if unavailable_account_ids.len() > pool.account_ids.len() {
        return Err("Invalid unavailable account set".into());
    }
    if unavailable_account_ids.iter().any(|id| !pool.account_ids.contains(id)) {
        return Err("Unknown account in unavailable set".into());
    }

    let instances = scan_cli_instances(pool.provider, Some(&current_account_id));
    // Reuse the existing Codex/agy rollout correlation, not filesystem guesses.
    let snapshots = crate::system::cli_restore::capture(provider_to_cli_kind(pool.provider));
    let history: Vec<ConversationHistoryItem> = snapshots.iter().filter_map(|snapshot| {
        let cwd = snapshot.cwd.as_ref()?;
        let id = snapshot.conversation.as_ref()?;
        Some(ConversationHistoryItem {
            conversation_id: id.clone(), workspace: cwd.clone(),
            timestamp_secs: snapshot.started_at,
        })
    }).collect();
    let unavailable: HashSet<String> = unavailable_account_ids.into_iter().collect();
    let now = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_secs();
    let plan = plan_rotation(
        &pool, true, &current_account_id, &unavailable, &instances,
        &history, &continuation_prompt, now,
    ).map_err(|err| format!("CLI rotation preflight blocked: {err:?}"))?;
    if !std::path::Path::new(&plan.cwd).is_dir() {
        return Err("CLI working directory is no longer present".into());
    }
    Ok(plan)
}

fn validate_auto_preflight(pool: &CliRotationPoolV1, current_id: &str) -> Result<(), String> {
    if !pool.enabled || !pool.auto_switch || pool.account_ids.len() < 2 {
        return Err("Automatic CLI rotation is not enabled for this pool".into());
    }
    if !pool.account_ids.iter().any(|id| id == current_id) {
        return Err("Active account is not a member of the selected pool".into());
    }
    // There's currently no reliable cross-platform, per-CLI busy/idle signal.
    // Never override the user's idle-only safety setting with CPU guesses.
    if pool.switch_when_idle_only {
        return Err("Idle-only switching is enabled; a reliable CLI idle signal is unavailable".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::{CliProvider, QuotaWindowKind};
    #[test]
    fn respects_explicit_idle_only_guard_before_process_discovery() {
        let mut pool = CliRotationPoolV1 {
            id: "pool".into(), provider: CliProvider::Codex, name: "test".into(),
            account_ids: vec!["one".into(), "two".into()],
            enabled: true, auto_switch: true,
            trigger_windows: vec![QuotaWindowKind::FiveHour],
            fallback_latest_enabled: true, switch_when_idle_only: true,
        };
        assert!(validate_auto_preflight(&pool, "one").is_err());
        pool.switch_when_idle_only = false;
        assert!(validate_auto_preflight(&pool, "one").is_ok());
        assert!(validate_auto_preflight(&pool, "unknown").is_err());
    }
}
