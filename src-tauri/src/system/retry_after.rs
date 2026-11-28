use chrono::{DateTime, Utc};
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Minimum floor for HTTP 429 `Retry-After` (guards against `Retry-After: 0` loops).
pub const RETRY_AFTER_MIN_SECS: u64 = 300;
/// Maximum cap for HTTP 429 cooldowns (6 hours).
pub const RETRY_AFTER_MAX_SECS: u64 = 21_600;
/// Consecutive HTTP 429 exponential backoff steps: 15m, 30m, 1h, 2h, 4h.
pub const BACKOFF_SCHEDULE_SECS: [u64; 5] = [900, 1_800, 3_600, 7_200, 14_400];
/// Shared short circuit breaker across a provider's accounts after HTTP 429 (10 minutes).
pub const PROVIDER_CIRCUIT_BREAKER_SECS: i64 = 10 * 60;

static ATOMIC_TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Parses an HTTP `Retry-After` header (integer seconds or RFC 2822 HTTP-date)
/// relative to `now`, clamping the result into `[min_secs, max_secs]`.
pub fn parse_retry_after_secs_at(
    header: Option<&str>,
    default_secs: u64,
    min_secs: u64,
    max_secs: u64,
    now: DateTime<Utc>,
) -> u64 {
    let hi = max_secs.max(min_secs);
    let fallback = default_secs.clamp(min_secs, hi);
    let Some(raw) = header.map(str::trim).filter(|s| !s.is_empty()) else {
        return fallback;
    };

    if let Ok(secs) = raw.parse::<u64>() {
        return secs.clamp(min_secs, hi);
    }

    if let Ok(datetime) = DateTime::parse_from_rfc2822(raw) {
        let diff = datetime.signed_duration_since(now).num_seconds();
        let secs = u64::try_from(diff.max(0)).unwrap_or(u64::MAX);
        return secs.clamp(min_secs, hi);
    }

    fallback
}

/// Returns the exponential backoff duration in seconds for consecutive HTTP 429s:
/// `1 => 900`, `2 => 1800`, `3 => 3600`, `4 => 7200`, `>=5 => 14400`.
pub fn exponential_backoff_secs(consecutive_429s: u32) -> u64 {
    let idx = consecutive_429s.saturating_sub(1) as usize;
    BACKOFF_SCHEDULE_SECS[idx.min(BACKOFF_SCHEDULE_SECS.len() - 1)]
}

/// Combines server `Retry-After` with exponential backoff for a 429 response,
/// taking the longer of the two within `[RETRY_AFTER_MIN_SECS, RETRY_AFTER_MAX_SECS]`.
pub fn compute_429_cooldown_secs_at(
    retry_after_header: Option<&str>,
    consecutive_429s: u32,
    now: DateTime<Utc>,
) -> u64 {
    let exp = exponential_backoff_secs(consecutive_429s);
    let parsed = parse_retry_after_secs_at(
        retry_after_header,
        exp,
        RETRY_AFTER_MIN_SECS,
        RETRY_AFTER_MAX_SECS,
        now,
    );
    parsed
        .max(exp)
        .clamp(RETRY_AFTER_MIN_SECS, RETRY_AFTER_MAX_SECS)
}

/// Returns the later active retry deadline between an account cooldown and provider circuit.
pub fn effective_retry_after(
    account_until: Option<i64>,
    circuit_until: Option<i64>,
    now_ts: i64,
) -> Option<i64> {
    match (
        account_until.filter(|&u| u > now_ts),
        circuit_until.filter(|&u| u > now_ts),
    ) {
        (Some(a), Some(c)) => Some(a.max(c)),
        (a, c) => a.or(c),
    }
}

/// Computes `(next_streak, account_retry_after_at, provider_circuit_until)` for HTTP 429.
pub fn record_429_backoff(
    prev_streak: u32,
    retry_after_header: Option<&str>,
    now: DateTime<Utc>,
) -> (u32, i64, i64) {
    let now_ts = now.timestamp();
    let next_streak = prev_streak.saturating_add(1);
    let secs = compute_429_cooldown_secs_at(retry_after_header, next_streak, now) as i64;
    (
        next_streak,
        now_ts + secs,
        now_ts + PROVIDER_CIRCUIT_BREAKER_SECS,
    )
}

/// Resolves `~/.quotashift/<file_name>` for token-free local metadata caches.
pub fn quotashift_cache_path(file_name: &str) -> Option<PathBuf> {
    crate::session::get_home_dir().map(|home| home.join(".quotashift").join(file_name))
}

/// Best-effort read of a JSON cache file. Missing or malformed files yield `T::default()`.
pub fn load_json_cache<T: DeserializeOwned + Default>(path: &Path) -> T {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<T>(&raw).ok())
        .unwrap_or_default()
}

/// Writes bytes via a unique temporary file and atomic rename (with Windows fallback).
pub fn write_atomic_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let seq = ATOMIC_TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("cache");
    let temp_path = path.with_file_name(format!(".{file_name}.tmp-{}-{seq}", std::process::id()));
    fs::write(&temp_path, bytes).map_err(|error| {
        format!(
            "Failed to write temporary file {}: {error}",
            temp_path.display()
        )
    })?;
    if let Err(first_err) = fs::rename(&temp_path, path) {
        if path.exists() {
            let _ = fs::remove_file(path);
            if let Err(retry_err) = fs::rename(&temp_path, path) {
                let _ = fs::remove_file(&temp_path);
                return Err(format!(
                    "Failed to finalize {}: {retry_err}",
                    path.display()
                ));
            }
        } else {
            let _ = fs::remove_file(&temp_path);
            return Err(format!(
                "Failed to finalize {}: {first_err}",
                path.display()
            ));
        }
    }
    Ok(())
}

/// Best-effort atomic write of a token-free JSON cache file.
pub fn save_json_cache<T: Serialize>(path: &Path, value: &T) {
    let Ok(bytes) = serde_json::to_vec_pretty(value) else {
        return;
    };
    let _ = write_atomic_bytes(path, &bytes);
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn fixed_now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, 27, 12, 0, 0).unwrap()
    }

    #[test]
    fn retry_after_clamps_zero_floor_and_six_hour_cap() {
        let now = fixed_now();
        assert_eq!(
            parse_retry_after_secs_at(Some("0"), 900, 300, 21_600, now),
            300
        );
        assert_eq!(
            parse_retry_after_secs_at(Some("60"), 900, 300, 21_600, now),
            300
        );
        assert_eq!(
            parse_retry_after_secs_at(Some("1200"), 900, 300, 21_600, now),
            1200
        );
        assert_eq!(
            parse_retry_after_secs_at(Some("999999"), 900, 300, 21_600, now),
            21_600
        );
    }

    #[test]
    fn retry_after_parses_rfc2822_and_falls_back_on_invalid() {
        let now = fixed_now();
        let future = (now + chrono::Duration::seconds(2400)).to_rfc2822();
        let past = (now - chrono::Duration::seconds(600)).to_rfc2822();
        assert_eq!(
            parse_retry_after_secs_at(Some(&future), 900, 300, 21_600, now),
            2400
        );
        assert_eq!(
            parse_retry_after_secs_at(Some(&past), 900, 300, 21_600, now),
            300
        );
        assert_eq!(
            parse_retry_after_secs_at(Some("not-a-date"), 900, 300, 21_600, now),
            900
        );
        assert_eq!(parse_retry_after_secs_at(None, 900, 300, 21_600, now), 900);
    }

    #[test]
    fn exponential_backoff_matches_schedule_and_caps_at_four_hours() {
        assert_eq!(exponential_backoff_secs(0), 900);
        assert_eq!(exponential_backoff_secs(1), 900);
        assert_eq!(exponential_backoff_secs(2), 1_800);
        assert_eq!(exponential_backoff_secs(3), 3_600);
        assert_eq!(exponential_backoff_secs(4), 7_200);
        assert_eq!(exponential_backoff_secs(5), 14_400);
        assert_eq!(exponential_backoff_secs(9), 14_400);
    }

    #[test]
    fn compute_429_cooldown_takes_longer_of_header_and_backoff() {
        let now = fixed_now();
        assert_eq!(compute_429_cooldown_secs_at(Some("0"), 1, now), 900);
        assert_eq!(compute_429_cooldown_secs_at(Some("3600"), 1, now), 3_600);
        assert_eq!(compute_429_cooldown_secs_at(Some("600"), 3, now), 3_600);
        assert_eq!(compute_429_cooldown_secs_at(Some("50000"), 1, now), 21_600);
    }

    #[test]
    fn shared_429_helpers_and_atomic_bytes_work_consistently() {
        let now = fixed_now();
        let now_ts = now.timestamp();
        assert_eq!(effective_retry_after(Some(now_ts - 1), None, now_ts), None);
        assert_eq!(
            effective_retry_after(Some(now_ts + 300), Some(now_ts + 600), now_ts),
            Some(now_ts + 600)
        );
        let (streak, until, circuit) = record_429_backoff(1, Some("0"), now);
        assert_eq!((streak, until, circuit), (2, now_ts + 1_800, now_ts + 600));

        let path = std::env::temp_dir().join(format!("qs-atomic-{}.txt", std::process::id()));
        write_atomic_bytes(&path, b"first").unwrap();
        write_atomic_bytes(&path, b"second").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        let _ = fs::remove_file(&path);
    }
}
