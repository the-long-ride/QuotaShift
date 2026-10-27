use super::*;
use crate::cli_pools::types::CliProvider;

#[test]
fn test_build_agy_exact_command() {
    let spec = build_resume_command(
        CliProvider::Agy,
        "agy",
        ".", // valid relative path that exists
        Some("00000000-0000-4000-8000-000000000001"),
        "continue remaining works",
        &["--model".to_string(), "gemini-2.5-pro".to_string()],
        false,
    )
    .unwrap();

    assert_eq!(spec.provider, CliProvider::Agy);
    assert_eq!(spec.executable, "agy");
    assert_eq!(spec.mode, ResumeMode::ExactId);
    assert_eq!(
        spec.argv,
        vec![
            "--conversation=00000000-0000-4000-8000-000000000001",
            "-i=continue remaining works",
            "--model",
            "gemini-2.5-pro",
        ]
    );
}

#[test]
fn test_build_agy_latest_command() {
    let spec = build_resume_command(
        CliProvider::Agy,
        "agy",
        ".",
        None,
        "continue remaining works",
        &[],
        false,
    )
    .unwrap();

    assert_eq!(spec.mode, ResumeMode::LatestSession);
    assert_eq!(spec.argv, vec!["-c", "-i=continue remaining works"]);
}

#[test]
fn test_build_codex_exact_command() {
    let spec = build_resume_command(
        CliProvider::Codex,
        "codex",
        ".",
        Some("00000000-0000-4000-8000-000000000002"),
        "continue remaining works",
        &["--model".to_string(), "o3".to_string()],
        false,
    )
    .unwrap();

    assert_eq!(spec.provider, CliProvider::Codex);
    assert_eq!(spec.mode, ResumeMode::ExactId);
    assert_eq!(
        spec.argv,
        vec![
            "resume",
            "00000000-0000-4000-8000-000000000002",
            "--model",
            "o3",
            "--",
            "continue remaining works",
        ]
    );
}

#[test]
fn test_build_codex_latest_command() {
    let spec = build_resume_command(
        CliProvider::Codex,
        "codex",
        ".",
        None,
        "continue remaining works",
        &[],
        false,
    )
    .unwrap();

    assert_eq!(spec.mode, ResumeMode::LatestSession);
    assert_eq!(
        spec.argv,
        vec!["resume", "--last", "--", "continue remaining works"]
    );
}

#[test]
fn test_prompt_with_quotes_whitespace_cjk_newlines_is_single_element() {
    let prompt = "continue: \"quoted text\", `code block`\n$var and 任务完成\t100%";
    let spec =
        build_resume_command(CliProvider::Agy, "agy", ".", None, prompt, &[], false).unwrap();

    assert_eq!(spec.argv[1], format!("-i={prompt}"));
}

#[test]
fn test_empty_or_whitespace_prompt_is_rejected() {
    let res = build_resume_command(CliProvider::Agy, "agy", ".", None, "   \n\t  ", &[], false);
    assert_eq!(res, Err(CommandBuildError::EmptyPrompt));
}

#[test]
fn test_oversized_prompt_is_rejected() {
    let oversized = "a".repeat(2001);
    let res = build_resume_command(CliProvider::Agy, "agy", ".", None, &oversized, &[], false);
    assert_eq!(res, Err(CommandBuildError::PromptTooLong));
}

#[test]
fn test_nul_in_prompt_is_rejected() {
    let nul_prompt = "hello\0world";
    let res = build_resume_command(CliProvider::Agy, "agy", ".", None, nul_prompt, &[], false);
    assert_eq!(res, Err(CommandBuildError::InvalidCharactersInPrompt));
}

#[test]
fn test_invalid_conversation_id_is_rejected() {
    let res = build_resume_command(
        CliProvider::Agy,
        "agy",
        ".",
        Some("invalid;id&&rm"),
        "continue",
        &[],
        false,
    );
    assert!(matches!(
        res,
        Err(CommandBuildError::InvalidConversationId(_))
    ));
}

#[test]
fn test_strips_dangerously_skip_permissions_and_yolo() {
    let original_args = vec![
        "--dangerously-skip-permissions".to_string(),
        "--yolo".to_string(),
        "--model".to_string(),
        "gemini-2.5-pro".to_string(),
    ];
    let spec = build_resume_command(
        CliProvider::Agy,
        "agy",
        ".",
        None,
        "continue",
        &original_args,
        false,
    )
    .unwrap();

    assert!(!spec
        .argv
        .contains(&"--dangerously-skip-permissions".to_string()));
    assert!(!spec.argv.contains(&"--yolo".to_string()));
    assert!(spec.argv.contains(&"--model".to_string()));
}

#[test]
fn test_missing_cwd_is_rejected_when_check_enabled() {
    let res = build_resume_command(
        CliProvider::Agy,
        "agy",
        "Z:\\NonExistentDirectoryForQuotaShiftTest123",
        None,
        "continue",
        &[],
        true, // check_cwd_exists
    );
    assert!(matches!(
        res,
        Err(CommandBuildError::MissingOrInvalidCwd(_))
    ));
}

#[test]
fn test_codex_config_profile_and_images_keep_their_values() {
    let original = ["-c", "notice=\"a&b;c\"", "-p", "work", "-i", "screen.png"].map(str::to_string);
    let spec = build_resume_command(
        CliProvider::Codex,
        "codex",
        ".",
        None,
        "continue",
        &original,
        false,
    )
    .unwrap();
    assert!(spec
        .argv
        .windows(original.len())
        .any(|args| args == original));
}

#[test]
fn test_codex_prompt_cannot_be_parsed_as_a_permission_flag() {
    let spec =
        build_resume_command(CliProvider::Codex, "codex", ".", None, "--yolo", &[], false).unwrap();
    assert_eq!(spec.argv, ["resume", "--last", "--", "--yolo"]);
}

#[test]
fn test_relaunch_drops_codex_permission_bypass_options_and_values() {
    let original = [
        "--dangerously-bypass-approvals-and-sandbox",
        "--sandbox",
        "danger-full-access",
        "-c",
        "approval_policy=\"never\"",
        "--model",
        "o3",
    ]
    .map(str::to_string);
    let spec = build_resume_command(
        CliProvider::Codex,
        "codex",
        ".",
        None,
        "continue",
        &original,
        false,
    )
    .unwrap();
    assert!(!spec
        .argv
        .iter()
        .any(|arg| arg.contains("danger") || arg.contains("approval_policy")));
    assert!(spec.argv.windows(2).any(|args| args == ["--model", "o3"]));
}
