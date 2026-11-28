pub mod auto_backup;
pub mod commands;
pub mod setup;

use std::sync::{Mutex, OnceLock};

use crate::types::AppState;

static STATE: OnceLock<Mutex<AppState>> = OnceLock::new();

pub(crate) fn get_state() -> &'static Mutex<AppState> {
    STATE.get_or_init(|| {
        Mutex::new(AppState {
            last_status: None,
            monitored_model: None,
            monitored_codex: None,
            monitored_tray: None,
            poll_interval_secs: 30,
        })
    })
}
