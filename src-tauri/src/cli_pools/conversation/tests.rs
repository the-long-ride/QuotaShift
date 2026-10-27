use super::*;
use crate::cli_pools::process_inventory::{CliInstance, ProcessIdentity, ProcessOwnership};
use crate::cli_pools::types::CliProvider;

fn make_instance(
    pid: u32,
    provider: CliProvider,
    cwd: Option<&str>,
    args: &[&str],
    started_at: u64,
) -> CliInstance {
    CliInstance {
        identity: ProcessIdentity {
            pid,
            started_at,
            executable: format!("{:?}", provider).to_lowercase(),
            cwd: cwd.map(|s| s.to_string()),
        },
        provider,
        launch_executable: Some(format!("{:?}", provider).to_lowercase()),
        related_pids: vec![pid],
        args: args.iter().map(|s| s.to_string()).collect(),
        ownership: ProcessOwnership::Unattributed,
    }
}

#[test]
fn test_explicit_arg_returns_explicit_confidence() {
    let inst_agy = make_instance(
        1,
        CliProvider::Agy,
        Some("F:\\repo"),
        &[
            "--conversation=00000000-0000-4000-8000-000000000001",
            "-i=test",
        ],
        100,
    );
    let res_agy =
        resolve_conversation(CliProvider::Agy, &inst_agy, &[inst_agy.clone()], &[], false);
    assert_eq!(res_agy.confidence, ResolutionConfidence::ExplicitArg);
    assert_eq!(
        res_agy.id.as_deref(),
        Some("00000000-0000-4000-8000-000000000001")
    );
    assert_eq!(res_agy.origin, ResolutionOrigin::CommandLineArg);

    let inst_codex = make_instance(
        2,
        CliProvider::Codex,
        Some("F:\\repo"),
        &["resume", "00000000-0000-4000-8000-000000000002", "prompt"],
        100,
    );
    let res_codex = resolve_conversation(
        CliProvider::Codex,
        &inst_codex,
        &[inst_codex.clone()],
        &[],
        false,
    );
    assert_eq!(res_codex.confidence, ResolutionConfidence::ExplicitArg);
    assert_eq!(
        res_codex.id.as_deref(),
        Some("00000000-0000-4000-8000-000000000002")
    );
    assert_eq!(res_codex.origin, ResolutionOrigin::CommandLineArg);
}

#[test]
fn test_malformed_uuid_in_explicit_arg_is_rejected() {
    let inst = make_instance(
        1,
        CliProvider::Agy,
        Some("F:\\repo"),
        &["--conversation=bad$id!", "-i=test"],
        100,
    );
    let res = resolve_conversation(CliProvider::Agy, &inst, &[inst.clone()], &[], false);
    assert_ne!(res.confidence, ResolutionConfidence::ExplicitArg);
    assert_eq!(res.id, None);
}

#[test]
fn test_correlated_exact_when_single_instance_in_workspace() {
    let inst = make_instance(1, CliProvider::Agy, Some("F:\\repo"), &["-i=test"], 100);
    let history = vec![ConversationHistoryItem {
        conversation_id: "00000000-0000-4000-8000-000000000099".to_string(),
        workspace: "F:\\repo".to_string(),
        timestamp_secs: 150,
    }];

    let res = resolve_conversation(CliProvider::Agy, &inst, &[inst.clone()], &history, false);
    assert_eq!(res.confidence, ResolutionConfidence::CorrelatedExact);
    assert_eq!(
        res.id.as_deref(),
        Some("00000000-0000-4000-8000-000000000099")
    );
}

#[test]
fn test_ambiguous_multiple_when_two_instances_in_same_workspace() {
    let inst1 = make_instance(1, CliProvider::Agy, Some("F:\\repo"), &["-i=test1"], 100);
    let inst2 = make_instance(2, CliProvider::Agy, Some("F:\\repo"), &["-i=test2"], 110);
    let history = vec![ConversationHistoryItem {
        conversation_id: "00000000-0000-4000-8000-000000000099".to_string(),
        workspace: "F:\\repo".to_string(),
        timestamp_secs: 150,
    }];

    let res = resolve_conversation(
        CliProvider::Agy,
        &inst1,
        &[inst1.clone(), inst2.clone()],
        &history,
        false,
    );
    assert_eq!(res.confidence, ResolutionConfidence::AmbiguousMultiple);
    assert!(res.is_ambiguous);
    assert_eq!(res.id, None);
}

#[test]
fn test_may_fallback_latest_requires_exactly_one_process() {
    let inst1 = make_instance(1, CliProvider::Agy, Some("F:\\repo"), &[], 100);
    let inst2 = make_instance(2, CliProvider::Agy, Some("F:\\other"), &[], 110);

    // Exactly 1 process -> allowed if opted in
    assert!(may_fallback_latest(
        CliProvider::Agy,
        &inst1,
        &[inst1.clone()],
        true
    ));
    // 2 processes -> blocked!
    assert!(!may_fallback_latest(
        CliProvider::Agy,
        &inst1,
        &[inst1.clone(), inst2.clone()],
        true
    ));
}

#[test]
fn test_may_fallback_latest_fails_if_pool_opt_in_false() {
    let inst1 = make_instance(1, CliProvider::Agy, Some("F:\\repo"), &[], 100);
    assert!(!may_fallback_latest(
        CliProvider::Agy,
        &inst1,
        &[inst1.clone()],
        false
    ));
}

#[test]
fn test_may_fallback_latest_fails_if_cwd_is_none() {
    let inst1 = make_instance(1, CliProvider::Agy, None, &[], 100);
    assert!(!may_fallback_latest(
        CliProvider::Agy,
        &inst1,
        &[inst1.clone()],
        true
    ));
}

#[test]
fn test_resolve_conversation_falls_back_to_latest_when_single_process_and_opted_in() {
    let inst1 = make_instance(1, CliProvider::Agy, Some("F:\\repo"), &[], 100);
    let res = resolve_conversation(CliProvider::Agy, &inst1, &[inst1.clone()], &[], true);
    assert_eq!(res.origin, ResolutionOrigin::LatestFallback);
    assert_eq!(res.id, None);
    assert!(!res.is_ambiguous);
}

#[test]
fn test_multiple_history_ids_are_ambiguous_even_with_one_process() {
    let inst = make_instance(1, CliProvider::Agy, Some("F:\\repo"), &[], 100);
    let history = [1, 2].map(|id| ConversationHistoryItem {
        conversation_id: format!("00000000-0000-4000-8000-00000000000{id}"),
        workspace: "F:\\repo".into(),
        timestamp_secs: 150 + id,
    });
    let result = resolve_conversation(CliProvider::Agy, &inst, &[inst.clone()], &history, true);
    assert!(result.is_ambiguous);
    assert!(result.id.is_none());
}
