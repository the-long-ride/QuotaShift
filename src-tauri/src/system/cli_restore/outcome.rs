//! One sentence per restored CLI, shared by the Codex toast and the Antigravity switch message.

use super::{CliKind, ConversationMatch, RestoreMethod, RestoreOutcome};

fn display_name(kind: CliKind) -> &'static str {
    match kind {
        CliKind::Codex => "Codex CLI",
        CliKind::Agy => "agy",
    }
}

pub fn describe(outcome: &RestoreOutcome) -> String {
    let name = display_name(outcome.kind);
    let folder = outcome.folder.as_deref().unwrap_or("its folder");
    let latest = if outcome.conversation == ConversationMatch::Latest {
        "; latest conversation used"
    } else {
        ""
    };
    match outcome.method {
        RestoreMethod::InPlace => format!("{name} resumed in {folder} (same tab){latest}."),
        RestoreMethod::NewTab => format!("{name} reopened in a new tab in {folder}{latest}."),
        RestoreMethod::NewWindow => {
            format!("{name} reopened in a new window in {folder}{latest}.")
        }
        RestoreMethod::NotRestored => match &outcome.error {
            Some(error) => format!(
                "{name} could not be restarted: {error}. Run: {}",
                outcome.command
            ),
            None => format!("{name} could not be restarted. Run: {}", outcome.command),
        },
    }
}

/// At most three sentences, then a count of the rest.
pub fn summarize(outcomes: &[RestoreOutcome]) -> String {
    let mut parts: Vec<String> = outcomes.iter().take(3).map(describe).collect();
    if outcomes.len() > 3 {
        parts.push(format!("And {} more.", outcomes.len() - 3));
    }
    parts.join(" ")
}
