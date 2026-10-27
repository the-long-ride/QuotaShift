use super::*;
use crate::cli_pools::command::{CommandSpec, ResumeMode};
use crate::cli_pools::types::CliProvider;

#[test]
fn test_launch_rejects_non_existent_cwd() {
    let spec = CommandSpec {
        provider: CliProvider::Agy,
        executable: "agy".into(),
        cwd: "Z:\\NonExistentPathQuotaShift123".into(),
        argv: vec!["--conversation=c-1".into(), "-i=continue".into()],
        mode: ResumeMode::ExactId,
    };

    let res = launch_resumed_cli(&spec, "cmd");
    assert!(matches!(res, Err(LaunchError::InvalidCwd(_))));
}

#[test]
fn test_build_terminal_command_preserves_spec_arguments() {
    let spec = CommandSpec {
        provider: CliProvider::Agy,
        executable: "agy".into(),
        cwd: ".".into(),
        argv: vec!["--conversation=c-1".into(), "-i=continue".into()],
        mode: ResumeMode::ExactId,
    };

    let builder = prepare_launch_command(&spec, "new_window");
    assert!(builder.is_ok());
    let prepared = builder.unwrap();
    assert_eq!(prepared.executable, "agy");
    assert_eq!(prepared.argv, spec.argv);
    assert_eq!(prepared.cwd, ".");
}

#[test]
fn test_verification_stages_progression() {
    assert_ne!(
        LaunchVerificationStage::ProcessStarted,
        LaunchVerificationStage::Complete
    );
}
