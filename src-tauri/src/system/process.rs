use std::process::Command;
use std::sync::OnceLock;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Clone)]
pub struct ProcessRecord {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
    pub command_line: String,
}

fn csrf_value_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"--csrf[_-]?token(?:=|\s+)([A-Za-z0-9._-]+)").expect("valid csrf regex")
    })
}

fn scan_csrf_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"--csrf[_-]?token[=\s]+([a-f0-9-]+)").expect("valid scan csrf regex")
    })
}

pub fn scan_process_records() -> Vec<ProcessRecord> {
    let refresh = ProcessRefreshKind::new().with_cmd(UpdateKind::Always);
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, refresh);
    sys.processes()
        .iter()
        .map(|(pid, proc_info)| ProcessRecord {
            pid: pid.as_u32(),
            parent_pid: proc_info
                .parent()
                .map(|parent| parent.as_u32())
                .unwrap_or(0),
            name: proc_info.name().to_string_lossy().into_owned(),
            command_line: proc_info
                .cmd()
                .iter()
                .map(|arg| arg.to_string_lossy())
                .collect::<Vec<_>>()
                .join(" "),
        })
        .collect()
}

pub fn descendant_process_ids(
    records: &[ProcessRecord],
    root_pid: u32,
) -> std::collections::BTreeSet<u32> {
    let mut descendants = std::collections::BTreeSet::new();
    let mut frontier = vec![root_pid];
    while let Some(parent) = frontier.pop() {
        for record in records.iter().filter(|record| record.parent_pid == parent) {
            if descendants.insert(record.pid) {
                frontier.push(record.pid);
            }
        }
    }
    descendants
}

pub fn extract_csrf_token(command_line: &str) -> Option<String> {
    csrf_value_regex()
        .captures(command_line)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ProcessKind {
    App,
    Cli,
    Ide,
}

#[derive(Debug, Clone)]
pub struct AntigravityProcess {
    pub pid: u32,
    pub token: String,
    pub kind: ProcessKind,
}

fn classify_cmdline(cmd_line: &str) -> Option<ProcessKind> {
    let lower = cmd_line.to_lowercase();
    if lower.contains("antigravity-workers") {
        return None;
    }
    if lower.contains("--app_data_dir") && lower.contains("antigravity-ide") {
        Some(ProcessKind::Ide)
    } else if lower.contains("--app_data_dir") && lower.contains("antigravity") {
        Some(ProcessKind::App)
    } else if (lower.contains("antigravity-cli")
        || lower.contains("antigravity_cli")
        || lower.contains("agy"))
        && lower.contains("--csrf")
    {
        Some(ProcessKind::Cli)
    } else if lower.contains("language_server") {
        Some(ProcessKind::Ide)
    } else {
        None
    }
}

pub fn scan_processes() -> Vec<AntigravityProcess> {
    let token_re = scan_csrf_regex();
    let mut results: Vec<AntigravityProcess> = scan_process_records()
        .into_iter()
        .filter(|record| !record.command_line.is_empty())
        .filter_map(|record| {
            let kind = classify_cmdline(&record.command_line)?;
            let token = token_re
                .captures(&record.command_line)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
            Some(AntigravityProcess {
                pid: record.pid,
                token,
                kind,
            })
        })
        .collect();
    results.sort_by(|a, b| a.kind.cmp(&b.kind));
    results
}

#[cfg(target_os = "windows")]
pub fn scan_ports(pid: u32) -> Vec<u16> {
    let mut ports = Vec::new();
    let cmd = format!("Get-NetTCPConnection -OwningProcess {} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort", pid);
    if let Ok(output) = crate::run_cmd(Command::new("powershell"))
        .args(["-NoProfile", "-Command", &cmd])
        .output()
    {
        for line in String::from_utf8_lossy(&output.stdout).trim().lines() {
            if let Ok(port) = line.trim().parse::<u16>() {
                ports.push(port);
            }
        }
    }
    ports
}

#[cfg(target_os = "macos")]
pub fn scan_ports(pid: u32) -> Vec<u16> {
    let mut ports = Vec::new();
    let cmd = format!(
        "lsof -iTCP -sTCP:LISTEN -a -p {} -Fn 2>/dev/null | grep '^n' | sed 's/n\\*://'",
        pid
    );
    if let Ok(output) = Command::new("sh").args(["-c", &cmd]).output() {
        for line in String::from_utf8_lossy(&output.stdout).trim().lines() {
            if let Some(port_str) = line.trim().strip_prefix('n') {
                if let Ok(port) = port_str.parse::<u16>() {
                    ports.push(port);
                }
            }
        }
    }
    ports
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn scan_ports(pid: u32) -> Vec<u16> {
    let mut ports = Vec::new();
    let cmd = format!(
        "netstat -lntp 2>/dev/null | grep '\\b{}/' | awk '{{print $4}}' | awk -F: '{{print $NF}}'",
        pid
    );
    if let Ok(output) = Command::new("sh").args(["-c", &cmd]).output() {
        for line in String::from_utf8_lossy(&output.stdout).trim().lines() {
            if let Ok(port) = line.trim().parse::<u16>() {
                ports.push(port);
            }
        }
    }
    ports
}

pub mod query;
pub use query::*;

#[cfg(test)]
mod tests;
