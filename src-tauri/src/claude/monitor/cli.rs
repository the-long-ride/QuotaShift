use chrono::{DateTime, Utc};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use super::{extract_cli_usage_from_output, run_claude_cli_usage, ClaudeRateLimitWindow};

#[derive(Debug, Clone)]
pub struct CliUsageCache {
    pub fetched_at: Instant,
    pub five_hour: Option<ClaudeRateLimitWindow>,
    pub seven_day: Option<ClaudeRateLimitWindow>,
}

static CLI_USAGE_CACHE: OnceLock<Mutex<Option<CliUsageCache>>> = OnceLock::new();
static CLI_USAGE_FETCHING: OnceLock<Mutex<bool>> = OnceLock::new();

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

pub fn get_cached_or_trigger_cli_usage(
    force: bool,
) -> (Option<ClaudeRateLimitWindow>, Option<ClaudeRateLimitWindow>) {
    let cache_lock = CLI_USAGE_CACHE.get_or_init(|| Mutex::new(None));
    {
        let guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(cached) = guard.as_ref() {
            if !force && cached.fetched_at.elapsed() < Duration::from_secs(60) {
                return (cached.five_hour.clone(), cached.seven_day.clone());
            }
        }
    }

    let has_stale = {
        let guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
        guard.is_some()
    };

    if has_stale && !force {
        let fetching_lock = CLI_USAGE_FETCHING.get_or_init(|| Mutex::new(false));
        let mut fetching = fetching_lock.lock().unwrap_or_else(|p| p.into_inner());
        if !*fetching {
            *fetching = true;
            std::thread::spawn(|| {
                if let Ok(stdout) = run_claude_cli_usage() {
                    let (five_hour, seven_day) = extract_cli_usage_from_output(&stdout, Utc::now());
                    let cache_lock = CLI_USAGE_CACHE.get_or_init(|| Mutex::new(None));
                    let mut guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
                    *guard = Some(CliUsageCache {
                        fetched_at: Instant::now(),
                        five_hour,
                        seven_day,
                    });
                }
                let fetching_lock = CLI_USAGE_FETCHING.get_or_init(|| Mutex::new(false));
                if let Ok(mut flag) = fetching_lock.lock() {
                    *flag = false;
                }
            });
        }
        let guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(cached) = guard.as_ref() {
            return (cached.five_hour.clone(), cached.seven_day.clone());
        }
    }

    let fetching_lock = CLI_USAGE_FETCHING.get_or_init(|| Mutex::new(false));
    let mut fetching = fetching_lock.lock().unwrap_or_else(|p| p.into_inner());
    *fetching = true;
    let (five_hour, seven_day) = if let Ok(stdout) = run_claude_cli_usage() {
        extract_cli_usage_from_output(&stdout, Utc::now())
    } else {
        (None, None)
    };
    *fetching = false;

    let mut guard = cache_lock.lock().unwrap_or_else(|p| p.into_inner());
    *guard = Some(CliUsageCache {
        fetched_at: Instant::now(),
        five_hour: five_hour.clone(),
        seven_day: seven_day.clone(),
    });

    (five_hour, seven_day)
}
