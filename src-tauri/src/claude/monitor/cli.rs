use chrono::{DateTime, Utc};
use std::path::Path;

use super::{
    extract_cli_usage_from_output, run_claude_cli_usage_for_config, ClaudeRateLimitWindow,
};

pub fn parse_cli_reset_timestamp(s: &str, now: DateTime<Utc>) -> Option<i64> {
    use chrono::{Datelike, TimeZone};
    let re =
        regex::Regex::new(r"(?i)([a-z]{3})\s+(\d{1,2}),\s*(\d{1,2})\s*(?::\s*(\d{2}))?\s*(am|pm)")
            .ok()?;
    let caps = re.captures(s)?;
    let month_str = caps.get(1)?.as_str().to_lowercase();
    let month = match month_str.as_str() {
        "jan" => 1,
        "feb" => 2,
        "mar" => 3,
        "apr" => 4,
        "may" => 5,
        "jun" => 6,
        "jul" => 7,
        "aug" => 8,
        "sep" => 9,
        "oct" => 10,
        "nov" => 11,
        "dec" => 12,
        _ => return None,
    };
    let day: u32 = caps.get(2)?.as_str().parse().ok()?;
    let mut hour: u32 = caps.get(3)?.as_str().parse().ok()?;
    let minute: u32 = caps
        .get(4)
        .map(|m| m.as_str().parse().unwrap_or(0))
        .unwrap_or(0);
    let is_pm = caps.get(5)?.as_str().eq_ignore_ascii_case("pm");
    if is_pm && hour < 12 {
        hour += 12;
    } else if !is_pm && hour == 12 {
        hour = 0;
    }
    let current_year = now.year();
    let year = if month == 1 && now.month() == 12 {
        current_year + 1
    } else {
        current_year
    };
    let local_dt = match chrono::Local.with_ymd_and_hms(year, month, day, hour, minute, 0) {
        chrono::LocalResult::Single(dt) => dt,
        chrono::LocalResult::Ambiguous(dt, _) => dt,
        chrono::LocalResult::None => return None,
    };
    Some(local_dt.timestamp())
}

pub fn probe_cli_usage_for_config(
    config_dir: Option<&Path>,
) -> Result<(Option<ClaudeRateLimitWindow>, Option<ClaudeRateLimitWindow>), String> {
    let stdout = run_claude_cli_usage_for_config(config_dir)?;
    let parsed = parse_cli_usage_output(&stdout, Utc::now());
    if parsed.is_err() {
        // No percentage lines: Claude Code has no usable login. Told once per launch.
        super::login_notice::notify_not_logged_in_once();
    }
    parsed
}

/// `claude -p /usage` exits 0 even when the usage API is unreachable (e.g. VPN off) and then
/// prints only local insights. Treat that as a failure so the last good snapshot is kept.
pub fn parse_cli_usage_output(
    output: &str,
    now: DateTime<Utc>,
) -> Result<(Option<ClaudeRateLimitWindow>, Option<ClaudeRateLimitWindow>), String> {
    match extract_cli_usage_from_output(output, now) {
        (None, None) => Err(
            "claude -p /usage returned no quota lines (usage API unreachable - check network/VPN)"
                .to_string(),
        ),
        windows => Ok(windows),
    }
}
