use super::*;
use crate::cli_pools::types::CliProvider;

fn sample_journal(op_id: &str, state: HandoffState) -> HandoffJournalV1 {
    HandoffJournalV1 {
        operation_id: op_id.to_string(),
        provider: CliProvider::Agy,
        pool_id: "pool-1".to_string(),
        original_account_id: "acc-old".to_string(),
        target_account_id: "acc-new".to_string(),
        original_pid: 1234,
        original_started_at: 100,
        executable: "agy".to_string(),
        cwd: "F:\\project".to_string(),
        conversation_id: Some("00000000-0000-4000-8000-000000000001".to_string()),
        prompt_hash: "hash123".to_string(),
        command_preview: "agy --conversation=00000000-0000-4000-8000-000000000001 -i='continue'"
            .to_string(),
        state,
        created_at: 1000,
        updated_at: 1000,
        is_active: true,
    }
}

#[test]
fn test_valid_handoff_state_transitions() {
    let mut j = sample_journal("op-1", HandoffState::Snapshotted);

    assert!(transition_state(&mut j, HandoffState::OldProcessExited, 1010).is_ok());
    assert_eq!(j.state, HandoffState::OldProcessExited);

    assert!(transition_state(&mut j, HandoffState::NewAccountApplied, 1020).is_ok());
    assert_eq!(j.state, HandoffState::NewAccountApplied);

    assert!(transition_state(&mut j, HandoffState::NewProcessLaunched, 1030).is_ok());
    assert_eq!(j.state, HandoffState::NewProcessLaunched);

    assert!(transition_state(&mut j, HandoffState::VerifiedResumed, 1040).is_ok());
    assert_eq!(j.state, HandoffState::VerifiedResumed);
    assert!(!j.is_active); // Completed!
}

#[test]
fn test_invalid_state_transition_is_rejected() {
    let mut j = sample_journal("op-1", HandoffState::Snapshotted);
    // Cannot jump straight to NewProcessLaunched without exiting old process and applying account
    let err = transition_state(&mut j, HandoffState::NewProcessLaunched, 1010);
    assert!(err.is_err());
    assert_eq!(j.state, HandoffState::Snapshotted);
}

#[test]
fn test_terminal_states_cannot_transition_further() {
    let mut j = sample_journal("op-1", HandoffState::VerifiedResumed);
    let err = transition_state(&mut j, HandoffState::Snapshotted, 1010);
    assert!(err.is_err());
}

#[test]
fn test_journal_atomic_save_and_load_roundtrip() {
    let dir = std::env::temp_dir().join(format!("quotashift_test_journal_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);

    let j = sample_journal("op-save", HandoffState::OldProcessExited);
    save_journal(&dir, &j).unwrap();

    let loaded = load_journal(&dir, "op-save").unwrap();
    assert_eq!(loaded, j);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_is_recovery_required_for_unverified_states() {
    assert!(is_recovery_required(&sample_journal(
        "op-1",
        HandoffState::Snapshotted
    )));
    assert!(is_recovery_required(&sample_journal(
        "op-2",
        HandoffState::OldProcessExited
    )));
    assert!(is_recovery_required(&sample_journal(
        "op-3",
        HandoffState::NewAccountApplied
    )));
    assert!(is_recovery_required(&sample_journal(
        "op-4",
        HandoffState::NewProcessLaunched
    )));
    assert!(is_recovery_required(&sample_journal(
        "op-5",
        HandoffState::Failed(HandoffFailureReason::ProcessLaunchFailed)
    )));
    assert!(!is_recovery_required(&sample_journal(
        "op-6",
        HandoffState::VerifiedResumed
    )));
}

#[test]
fn test_list_active_journals_filters_completed_and_dismissed() {
    let dir = std::env::temp_dir().join(format!(
        "quotashift_test_journal_list_{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);

    let j1 = sample_journal("op-active", HandoffState::OldProcessExited);
    let mut j2 = sample_journal("op-done", HandoffState::VerifiedResumed);
    j2.is_active = false;

    save_journal(&dir, &j1).unwrap();
    save_journal(&dir, &j2).unwrap();

    let active = list_active_journals(&dir);
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].operation_id, "op-active");

    dismiss_journal(&dir, "op-active").unwrap();
    let after_dismiss = list_active_journals(&dir);
    assert_eq!(after_dismiss.len(), 0);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_journal_rejects_operation_ids_with_path_components() {
    let dir = std::env::temp_dir().join("quotashift-invalid-journal");
    for id in ["../escape", "..\\escape", "a/b", "a:b", ""] {
        assert_eq!(
            load_journal(&dir, id).unwrap_err().kind(),
            ErrorKind::InvalidInput
        );
        assert_eq!(
            save_journal(&dir, &sample_journal(id, HandoffState::Snapshotted))
                .unwrap_err()
                .kind(),
            ErrorKind::InvalidInput
        );
    }
}
