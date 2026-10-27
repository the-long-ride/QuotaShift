use super::outcome::{describe, summarize};
use super::{CliKind, ConversationMatch, RestoreMethod, RestoreOutcome};

fn outcome(method: RestoreMethod, conversation: ConversationMatch) -> RestoreOutcome {
    RestoreOutcome {
        kind: CliKind::Codex,
        folder: Some("F:\\repo".into()),
        method,
        conversation,
        command: "codex resume 0d4fca35-017e-4725-8940-b4deb9c27a11".into(),
        error: None,
    }
}

#[test]
fn describes_each_method() {
    assert_eq!(
        describe(&outcome(RestoreMethod::InPlace, ConversationMatch::Exact)),
        "Codex CLI resumed in F:\\repo (same tab)."
    );
    assert_eq!(
        describe(&outcome(RestoreMethod::NewTab, ConversationMatch::Exact)),
        "Codex CLI reopened in a new tab in F:\\repo."
    );
    assert_eq!(
        describe(&outcome(
            RestoreMethod::NewWindow,
            ConversationMatch::Latest
        )),
        "Codex CLI reopened in a new window in F:\\repo; latest conversation used."
    );
}

#[test]
fn not_restored_shows_the_command() {
    let mut o = outcome(RestoreMethod::NotRestored, ConversationMatch::Exact);
    o.kind = CliKind::Agy;
    o.command = "agy --continue".into();
    o.error = Some("no terminal to reopen in".into());
    assert_eq!(
        describe(&o),
        "agy could not be restarted: no terminal to reopen in. Run: agy --continue"
    );
}

#[test]
fn summarize_caps_at_three() {
    let one = outcome(RestoreMethod::InPlace, ConversationMatch::Exact);
    let all = vec![one.clone(), one.clone(), one.clone(), one.clone(), one];
    let text = summarize(&all);
    assert_eq!(text.matches("(same tab).").count(), 3);
    assert!(text.ends_with("And 2 more."));
    assert_eq!(summarize(&[]), "");
}
