use super::{process_inventory::scan_cli_instances, types::CliProvider};
use crate::system::cli_restore::{self, CliKind};

fn cli_kind(provider: CliProvider) -> CliKind {
    match provider {
        CliProvider::Agy => CliKind::Agy,
        CliProvider::Codex => CliKind::Codex,
    }
}

#[tauri::command]
pub fn cli_pool_arm_continuation(
    provider: CliProvider, pid: u32, started_at: u64, prompt: String,
) -> Result<(), String> {
    let matches = scan_cli_instances(provider, None).into_iter()
        .filter(|cli| cli.identity.pid == pid && cli.identity.started_at == started_at)
        .count();
    if matches != 1 {
        return Err("CLI identity changed after preflight; continuation not armed".into());
    }
    cli_restore::continuation::arm(cli_kind(provider), pid, started_at, prompt)
}

#[tauri::command]
pub fn cli_pool_continuation_succeeded(provider: CliProvider, pid: u32) -> bool {
    cli_restore::continuation::result(cli_kind(provider), pid)
}

#[tauri::command]
pub fn cli_pool_clear_continuation(provider: CliProvider, pid: u32) {
    cli_restore::continuation::clear(cli_kind(provider), pid);
}
