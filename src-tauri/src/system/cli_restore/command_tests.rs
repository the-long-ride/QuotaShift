use super::command::*;
use super::CliKind;

const A: &str = "0d4fca35-017e-4725-8940-b4deb9c27a11";

fn v(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

#[test]
fn codex_keeps_settings_and_drops_conversation_words() {
    let args = v(&[
        "resume",
        A,
        "-m",
        "gpt-5",
        "-c",
        "model_reasoning_effort=high",
        "--search",
        "fix the bug",
    ]);
    assert_eq!(
        kept_flags(CliKind::Codex, &args),
        v(&[
            "-m",
            "gpt-5",
            "-c",
            "model_reasoning_effort=high",
            "--search"
        ])
    );
    assert_eq!(
        kept_flags(CliKind::Codex, &v(&["resume", "--last"])),
        Vec::<String>::new()
    );
}

#[test]
fn agy_drops_conversation_and_prompt_flags_but_keeps_the_rest() {
    let args = v(&[
        "-c",
        "--model",
        "gemini",
        "--conversation",
        A,
        "--dangerously-skip-permissions",
        "-p",
        "hi",
    ]);
    assert_eq!(
        kept_flags(CliKind::Agy, &args),
        v(&["--model", "gemini", "--dangerously-skip-permissions"])
    );
    assert_eq!(
        kept_flags(CliKind::Agy, &v(&["--effort=high"])),
        v(&["--effort=high"])
    );
}

#[test]
fn resume_argv_per_cli() {
    let flags = v(&["-m", "gpt-5"]);
    assert_eq!(
        resume_argv(CliKind::Codex, Some(A), &flags),
        v(&["codex", "resume", "-m", "gpt-5", A])
    );
    assert_eq!(
        resume_argv(CliKind::Codex, None, &[]),
        v(&["codex", "resume", "--last"])
    );
    assert_eq!(
        resume_argv(CliKind::Agy, Some(A), &v(&["--model", "x"])),
        v(&["agy", "--conversation", A, "--model", "x"])
    );
    assert_eq!(
        resume_argv(CliKind::Agy, None, &[]),
        v(&["agy", "--continue"])
    );
}

#[test]
fn quoting_per_shell() {
    let argv = v(&["codex", "resume", "-c", "note=it's here", A]);
    assert_eq!(
        render_line(QuoteStyle::PowerShell, &argv),
        format!("codex resume -c 'note=it''s here' {A}")
    );
    assert_eq!(
        render_line(QuoteStyle::Posix, &argv),
        format!("codex resume -c 'note=it'\\''s here' {A}")
    );
    assert_eq!(
        render_line(QuoteStyle::Cmd, &v(&["agy", "--add-dir", "C:\\my dir"])),
        "agy --add-dir \"C:\\my dir\""
    );
}

#[test]
fn tmux_pane_ids() {
    assert!(valid_tmux_pane("%12"));
    assert!(!valid_tmux_pane("%"));
    assert!(!valid_tmux_pane("12; kill"));
}
