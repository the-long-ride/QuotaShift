use std::process::Command;
use serde_json::Value;

#[cfg(target_os = "windows")]
pub fn scan_processes() -> Option<(u32, String)> {
    let output = crate::run_cmd(Command::new("powershell"))
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object {$_.Name -like '*language_server*' -or $_.Name -like '*agy*'} | Select-Object ProcessId,CommandLine | ConvertTo-Json"
        ])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return None;
    }

    let json_val: Value = serde_json::from_str(trimmed).ok()?;
    let processes = if let Some(arr) = json_val.as_array() {
        arr.clone()
    } else {
        vec![json_val]
    };

    let token_re = regex::Regex::new(r"--csrf[_-]?token[=\s]+([a-f0-9-]+)").ok()?;
    for proc in &processes {
        let cmd_line = proc.get("CommandLine").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(caps) = token_re.captures(cmd_line) {
            let token = caps.get(1)?.as_str().to_string();
            let pid = proc.get("ProcessId").and_then(|v| v.as_u64()).map(|v| v as u32)?;
            return Some((pid, token));
        }
    }

    for proc in &processes {
        let cmd_line = proc.get("CommandLine").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
        if cmd_line.contains("agy") {
            if let Some(pid) = proc.get("ProcessId").and_then(|v| v.as_u64()).map(|v| v as u32) {
                return Some((pid, String::new()));
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
pub fn scan_processes() -> Option<(u32, String)> {
    let output = Command::new("sh")
        .args(["-c", "ps -axo pid,args | grep -iE 'language_server|agy' | grep -v grep"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines = stdout.trim().lines();
    let token_re = regex::Regex::new(r"--csrf[_-]?token[=\s]+([a-f0-9-]+)").ok()?;
    for line in lines {
        if let Some(caps) = token_re.captures(line) {
            let token = caps.get(1)?.as_str().to_string();
            let pid_str = line.trim().split_whitespace().next()?;
            let pid = pid_str.parse::<u32>().ok()?;
            return Some((pid, token));
        }
    }
    let lower: String = stdout.to_lowercase();
    if lower.contains("agy") {
        for line in stdout.trim().lines() {
            if line.to_lowercase().contains("agy") {
                let pid_str = line.trim().split_whitespace().next()?;
                let pid = pid_str.parse::<u32>().ok()?;
                return Some((pid, String::new()));
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
pub fn scan_port(pid: u32) -> Option<u16> {
    let cmd = format!(
        "Get-NetTCPConnection -OwningProcess {} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort",
        pid
    );
    let output = crate::run_cmd(Command::new("powershell"))
        .args(["-NoProfile", "-Command", &cmd])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let port_str = stdout.trim().lines().next()?.trim();
    port_str.parse::<u16>().ok()
}

#[cfg(target_os = "macos")]
pub fn scan_port(pid: u32) -> Option<u16> {
    let cmd = format!(
        "lsof -iTCP -sTCP:LISTEN -a -p {} -Fn 2>/dev/null | grep '^n' | sed 's/n\\*://'",
        pid
    );
    let output = Command::new("sh")
        .args(["-c", &cmd])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let port_str = stdout.trim().strip_prefix('n')?.trim();
    port_str.parse::<u16>().ok()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn scan_port(pid: u32) -> Option<u16> {
    let cmd = format!(
        "netstat -lntp 2>/dev/null | grep '\\b{}/' | awk '{{print $4}}' | awk -F: '{{print $NF}}'",
        pid
    );
    let output = Command::new("sh")
        .args(["-c", &cmd])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let port_str = stdout.trim();
    port_str.parse::<u16>().ok()
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
