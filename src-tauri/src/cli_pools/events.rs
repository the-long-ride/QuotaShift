use super::types::CliProvider;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CliRotationEvent {
    QuotaExhausted {
        provider: CliProvider,
        account_id: String,
        window: String,
    },
    HandoffStarted {
        operation_id: String,
        provider: CliProvider,
        original_account_id: String,
        target_account_id: String,
    },
    HandoffBlocked {
        operation_id: String,
        provider: CliProvider,
        reason: String,
    },
    AccountSwitched {
        operation_id: String,
        provider: CliProvider,
        account_id: String,
    },
    ProcessResumed {
        operation_id: String,
        provider: CliProvider,
        pid: u32,
    },
    RecoveryRequired {
        operation_id: String,
        provider: CliProvider,
        reason: String,
    },
}
