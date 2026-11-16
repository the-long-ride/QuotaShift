use chrono::{DateTime, TimeZone, Utc};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::parse::{parse_reset_credits, ClaudeResetCredits};

const MAX_BACKWARD_SCAN_BYTES: usize = 32_768;
const MAX_FORWARD_SCAN_BYTES: usize = 65_536;

fn desktop_leveldb_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(|appdata| {
            PathBuf::from(appdata)
                .join("Claude")
                .join("Local Storage")
                .join("leveldb")
        })
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Claude")
                .join("Local Storage")
                .join("leveldb")
        })
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join(".config")
                .join("Claude")
                .join("Local Storage")
                .join("leveldb")
        })
    }
}

fn is_leveldb_data_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("ldb") || ext.eq_ignore_ascii_case("log"))
}

fn parse_json_object_from(text: &str, start: usize) -> Option<Value> {
    let bytes = text.as_bytes();
    let max_end = (start + MAX_FORWARD_SCAN_BYTES).min(bytes.len());
    let mut in_string = false;
    let mut escaped = false;
    let mut depth: usize = 0;

    for (offset, &b) in bytes[start..max_end].iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth = depth.checked_sub(1)?;
                if depth == 0 {
                    let end = start + offset;
                    let value: Value = serde_json::from_str(&text[start..=end]).ok()?;
                    return value.get("cedar_ember").is_some().then_some(value);
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_json_object_around(text: &str, key_idx: usize) -> Option<Value> {
    let bytes = text.as_bytes();
    let min_start = key_idx.saturating_sub(MAX_BACKWARD_SCAN_BYTES);
    let mut depth: usize = 0;

    for i in (min_start..key_idx).rev() {
        match bytes[i] {
            b'}' => depth += 1,
            b'{' => {
                if depth == 0 {
                    if let Some(value) = parse_json_object_from(text, i) {
                        return Some(value);
                    }
                } else {
                    depth -= 1;
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_cedar_ember_credits(text: &str, now: DateTime<Utc>) -> Option<ClaudeResetCredits> {
    for (idx, _) in text.rmatch_indices("\"cedar_ember\"") {
        let Some(value) = extract_json_object_around(text, idx) else {
            continue;
        };
        let credits = parse_reset_credits(&value, now);
        if credits.status == "available" || credits.status == "none" {
            return Some(credits);
        }
    }
    None
}

/// Scans a Claude Desktop `Local Storage/leveldb` directory read-only for `.ldb` and `.log`
/// files matching `expected_email` (case-insensitive) and containing a `"cedar_ember"` reset
/// payload. Returns `Some(credits)` only when `status` is `"available"` or `"none"`.
pub fn scan_desktop_leveldb_dir(
    dir: &Path,
    expected_email: &str,
    now_epoch: i64,
) -> Option<ClaudeResetCredits> {
    let expected = expected_email.trim().to_ascii_lowercase();
    if expected.is_empty() || !dir.is_dir() {
        return None;
    }

    let mut files: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| is_leveldb_data_file(path))
        .map(|path| {
            let modified = fs::metadata(&path)
                .and_then(|meta| meta.modified())
                .unwrap_or(UNIX_EPOCH);
            (path, modified)
        })
        .collect();

    files.sort_by(|a, b| b.1.cmp(&a.1));

    let now = Utc.timestamp_opt(now_epoch, 0).single()?;
    let mut email_found = false;
    let mut best_credits: Option<ClaudeResetCredits> = None;

    for (path, _) in files {
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let text = String::from_utf8_lossy(&bytes);
        if !email_found && text.to_ascii_lowercase().contains(&expected) {
            email_found = true;
        }
        if best_credits.is_none() {
            best_credits = extract_cedar_ember_credits(&text, now);
        }
        if email_found && best_credits.is_some() {
            return best_credits;
        }
    }

    if email_found {
        best_credits
    } else {
        None
    }
}

/// Reads verified same-account reset credits from Claude Desktop's local LevelDB storage.
pub fn read_verified_desktop_resets(
    expected_email: &str,
    now_epoch: i64,
) -> Option<ClaudeResetCredits> {
    if expected_email.trim().is_empty() {
        return None;
    }
    let dir = desktop_leveldb_dir()?;
    scan_desktop_leveldb_dir(&dir, expected_email, now_epoch)
}
