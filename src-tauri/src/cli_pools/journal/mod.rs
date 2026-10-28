use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::io::{Error, ErrorKind};
use std::path::Path;

use super::types::CliProvider;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HandoffFailureReason {
    ProcessStopFailed,
    AccountApplyFailed,
    ProcessLaunchFailed,
    PidReusedBeforeStop,
    VerificationTimeout,
    UserAborted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HandoffState {
    Snapshotted,
    OldProcessExited,
    NewAccountApplied,
    NewProcessLaunched,
    VerifiedResumed,
    Failed(HandoffFailureReason),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffJournalV1 {
    pub operation_id: String,
    pub provider: CliProvider,
    pub pool_id: String,
    pub original_account_id: String,
    pub target_account_id: String,
    pub original_pid: u32,
    pub original_started_at: u64,
    pub executable: String,
    pub cwd: String,
    pub conversation_id: Option<String>,
    pub prompt_hash: String,
    pub command_preview: String,
    pub state: HandoffState,
    pub created_at: u64,
    pub updated_at: u64,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidTransitionError {
    pub from: HandoffState,
    pub to: HandoffState,
}

pub fn transition_state(
    journal: &mut HandoffJournalV1,
    next: HandoffState,
    now: u64,
) -> Result<(), InvalidTransitionError> {
    let current = journal.state;
    let valid = match (current, next) {
        // Any non-terminal state can transition to Failed
        (HandoffState::VerifiedResumed, _) => false,
        (HandoffState::Failed(_), _) => false,
        (_, HandoffState::Failed(_)) => true,

        // Normal sequence
        (HandoffState::Snapshotted, HandoffState::OldProcessExited) => true,
        (HandoffState::OldProcessExited, HandoffState::NewAccountApplied) => true,
        (HandoffState::NewAccountApplied, HandoffState::NewProcessLaunched) => true,
        (HandoffState::NewProcessLaunched, HandoffState::VerifiedResumed) => true,
        _ => false,
    };

    if !valid {
        return Err(InvalidTransitionError {
            from: current,
            to: next,
        });
    }

    journal.state = next;
    journal.updated_at = now;
    if next == HandoffState::VerifiedResumed {
        journal.is_active = false;
    }

    Ok(())
}

pub fn is_recovery_required(journal: &HandoffJournalV1) -> bool {
    journal.state != HandoffState::VerifiedResumed
}

fn validate_operation_id(id: &str) -> Result<(), Error> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "Invalid handoff operation ID",
        ));
    }
    Ok(())
}

pub fn save_journal(dir: &Path, journal: &HandoffJournalV1) -> Result<(), Error> {
    validate_operation_id(&journal.operation_id)?;
    fs::create_dir_all(dir)?;
    let file_path = dir.join(format!("{}.json", journal.operation_id));
    let tmp_path = dir.join(format!(
        "{}.tmp.{}",
        journal.operation_id,
        std::process::id()
    ));

    let content =
        serde_json::to_string_pretty(journal).map_err(|e| Error::new(ErrorKind::InvalidData, e))?;

    let mut file = fs::File::create(&tmp_path)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    drop(file);
    fs::rename(&tmp_path, &file_path)?;

    Ok(())
}

pub fn load_journal(dir: &Path, op_id: &str) -> Result<HandoffJournalV1, Error> {
    validate_operation_id(op_id)?;
    let file_path = dir.join(format!("{op_id}.json"));
    let content = fs::read_to_string(&file_path)?;
    serde_json::from_str(&content).map_err(|e| Error::new(ErrorKind::InvalidData, e))
}

pub fn list_active_journals(dir: &Path) -> Vec<HandoffJournalV1> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut journals = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(journal) = serde_json::from_str::<HandoffJournalV1>(&content) else {
            continue;
        };
        if journal.is_active {
            journals.push(journal);
        }
    }

    journals.sort_by_key(|j| j.created_at);
    journals
}

pub fn dismiss_journal(dir: &Path, op_id: &str) -> Result<(), Error> {
    let mut journal = load_journal(dir, op_id)?;
    journal.is_active = false;
    save_journal(dir, &journal)
}

#[cfg(test)]
mod tests;
