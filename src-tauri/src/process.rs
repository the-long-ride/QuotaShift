use std::process::Command;
use serde_json::Value;


#[derive(Debug, Clone)]
pub struct ProcessRecord {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
    pub command_line: String,
}

#[cfg(target_os = "windows")]
pub fn scan_process_records() -> Vec<ProcessRecord> {
    let output = match crate::run_cmd(Command::new("powershell"))
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
        ])
        .output()
    {
        Ok(output) => output,
        Err(_) => return Vec::new(),
    };
    if !output.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let value: Value = match serde_json::from_str(trimmed) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let values = value.as_array().cloned().unwrap_or_else(|| vec![value]);
    values
        .into_iter()
        .filter_map(|item| {
            Some(ProcessRecord {
                pid: item.get("ProcessId")?.as_u64()? as u32,
                parent_pid: item.get("ParentProcessId").and_then(Value::as_u64).unwrap_or(0) as u32,
                name: item.get("Name").and_then(Value::as_str).unwrap_or("").to_string(),
                command_line: item.get("CommandLine").and_then(Value::as_str).unwrap_or("").to_string(),
            })
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
pub fn scan_process_records() -> Vec<ProcessRecord> {
    let output = match Command::new("sh")
        .args(["-c", "ps -axo pid=,ppid=,comm=,args="])
        .output()
    {
        Ok(output) => output,
        Err(_) => return Vec::new(),
    };
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .filter_map(|line| {
            let mut parts = line.trim().splitn(4, char::is_whitespace).filter(|part| !part.is_empty());
            let pid = parts.next()?.parse::<u32>().ok()?;
            let parent_pid = parts.next()?.parse::<u32>().ok()?;
            let name = parts.next()?.to_string();
            let command_line = parts.next().unwrap_or("").to_string();
            Some(ProcessRecord { pid, parent_pid, name, command_line })
        })
        .collect()
}

pub fn descendant_process_ids(records: &[ProcessRecord], root_pid: u32) -> std::collections::BTreeSet<u32> {
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
    let token_re = regex::Regex::new(r"--csrf[_-]?token(?:=|\s+)([A-Za-z0-9._-]+)").ok()?;
    token_re
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
    if lower.contains("--app_data_dir") && lower.contains("antigravity-ide") {
        Some(ProcessKind::Ide)
    } else if lower.contains("--app_data_dir") && lower.contains("antigravity") {
        Some(ProcessKind::App)
    } else if lower.contains("antigravity-cli") || lower.contains("antigravity_cli") || lower.contains("agy") {
        Some(ProcessKind::Cli)
    } else if lower.contains("language_server") {
        Some(ProcessKind::Ide) // fallback if it doesn't have the specific app dir
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
pub fn scan_processes() -> Vec<AntigravityProcess> {
    let mut results = Vec::new();
    let output = match crate::run_cmd(Command::new("powershell"))
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object {$_.Name -like '*language_server*' -or $_.Name -like '*agy*' -or $_.CommandLine -like '*agy*'} | Select-Object ProcessId,CommandLine | ConvertTo-Json"
        ])
        .output() {
        Ok(o) => o,
        Err(_) => return results,
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return results;
    }

    let json_val: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return results,
    };
    let processes = if let Some(arr) = json_val.as_array() {
        arr.clone()
    } else {
        vec![json_val]
    };

    let token_re = regex::Regex::new(r"--csrf[_-]?token[=\s]+([a-f0-9-]+)").unwrap();
    for proc in &processes {
        let cmd_line = proc.get("CommandLine").and_then(|v| v.as_str()).unwrap_or("");
        if cmd_line.is_empty() {
            continue;
        }
        if let Some(kind) = classify_cmdline(cmd_line) {
            let pid = match proc.get("ProcessId").and_then(|v| v.as_u64()).map(|v| v as u32) {
                Some(p) => p,
                None => continue,
            };
            let token = if let Some(caps) = token_re.captures(cmd_line) {
                caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default()
            } else {
                String::new()
            };
            results.push(AntigravityProcess { pid, token, kind });
        }
    }
    results.sort_by(|a, b| a.kind.cmp(&b.kind));
    results
}

#[cfg(not(target_os = "windows"))]
pub fn scan_processes() -> Vec<AntigravityProcess> {
    let mut results = Vec::new();
    let output = match Command::new("sh")
        .args(["-c", "ps -axo pid,args | grep -iE 'language_server|agy' | grep -v grep"])
        .output() {
        Ok(o) => o,
        Err(_) => return results,
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines = stdout.trim().lines();
    let token_re = regex::Regex::new(r"--csrf[_-]?token[=\s]+([a-f0-9-]+)").unwrap();
    for line in lines {
        if let Some(kind) = classify_cmdline(line) {
            if let Some(pid_str) = line.trim().split_whitespace().next() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    let token = if let Some(caps) = token_re.captures(line) {
                        caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default()
                    } else {
                        String::new()
                    };
                    results.push(AntigravityProcess { pid, token, kind });
                }
            }
        }
    }
    results.sort_by(|a, b| a.kind.cmp(&b.kind));
    results
}

#[cfg(target_os = "windows")]
pub fn scan_ports(pid: u32) -> Vec<u16> {
    let mut ports = Vec::new();
    let cmd = format!(
        "Get-NetTCPConnection -OwningProcess {} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort",
        pid
    );
    if let Ok(output) = crate::run_cmd(Command::new("powershell"))
        .args(["-NoProfile", "-Command", &cmd])
        .output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.trim().lines() {
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
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.trim().lines() {
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
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.trim().lines() {
            if let Ok(port) = line.trim().parse::<u16>() {
                ports.push(port);
            }
        }
    }
    ports
}

pub async fn query_server(port: u16, token: &str, path: &str) -> Result<Value, String> {
    let url = format!("http://127.0.0.1:{}{}", port, path);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&Value::Null);

    if !token.is_empty() {
        req = req.header("X-CSRF-Token", token);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    if res.status().is_success() {
        res.json::<Value>().await.map_err(|e| e.to_string())
    } else {
        Err(format!("HTTP status: {}", res.status()))
    }
}

pub async fn query_server_https(port: u16, token: &str, path: &str, body: Value) -> Result<Value, String> {
    let url = format!("https://127.0.0.1:{}{}", port, path);
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .json(&body);

    if !token.is_empty() {
        req = req.header("X-Codeium-Csrf-Token", token);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    if res.status().is_success() {
        res.json::<Value>().await.map_err(|e| e.to_string())
    } else {
        Err(format!("HTTP status: {}", res.status()))
    }
}
