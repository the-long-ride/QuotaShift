//! Incremental terminal-event checker for streamed SIWC Responses.
//! Never treat HTTP 200, an event header alone, or a truncated stream as success.
use super::responses_transport::{process_sse_stream, SseStreamOutcome};
use super::usage_metrics::{normalize_usage_event, NormalizedUsage};

const MAX_PARTIAL_EVENT: usize = 512 * 1024;

#[derive(Default)]
pub struct SiwcSseTracker {
    pending: Vec<u8>,
    terminal: Option<SseStreamOutcome>,
    usage: Option<NormalizedUsage>,
}

impl SiwcSseTracker {
    pub fn observe(&mut self, chunk: &[u8]) {
        if self.terminal.is_some() {
            return;
        }
        self.pending.extend_from_slice(chunk);
        while let Some((boundary, delimiter)) = find_boundary(&self.pending) {
            let event = String::from_utf8_lossy(&self.pending[..boundary]).to_string();
            self.pending.drain(..boundary + delimiter);
            let outcome = process_sse_stream(&[event.clone()]);
            if !matches!(outcome, SseStreamOutcome::Truncated) {
                self.usage = extract_event_usage(&event);
                self.terminal = Some(outcome);
                return;
            }
        }
        if self.pending.len() > MAX_PARTIAL_EVENT {
            self.terminal = Some(SseStreamOutcome::Failed("Event exceeded size limit".into()));
            self.pending.clear();
        }
    }

    pub fn finish(&self) -> SseStreamOutcome {
        self.terminal.clone().unwrap_or(SseStreamOutcome::Truncated)
    }

    pub fn usage(&self) -> Option<&NormalizedUsage> {
        self.usage.as_ref()
    }
}

fn extract_event_usage(event_str: &str) -> Option<NormalizedUsage> {
    let data = event_str
        .lines()
        .find_map(|line| line.trim().strip_prefix("data:"))?
        .trim();
    let json: serde_json::Value = serde_json::from_str(data).ok()?;
    let usage = normalize_usage_event(&json);
    (usage.input_tokens.is_some() || usage.output_tokens.is_some()).then_some(usage)
}

pub(super) fn find_boundary(bytes: &[u8]) -> Option<(usize, usize)> {
    for (idx, _) in bytes.iter().enumerate() {
        if bytes.get(idx..idx + 4) == Some(b"\r\n\r\n") {
            return Some((idx, 4));
        }
        if bytes.get(idx..idx + 2) == Some(b"\n\n") {
            return Some((idx, 2));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_chunks_require_valid_completed_json() {
        let payload = b"event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n";
        let mut tracker = SiwcSseTracker::default();
        for part in payload.chunks(5) {
            tracker.observe(part);
        }
        assert_eq!(tracker.finish(), SseStreamOutcome::Completed);
        let mut wrong = SiwcSseTracker::default();
        wrong.observe(b"event: response.completed\n\n");
        assert_eq!(wrong.finish(), SseStreamOutcome::Truncated);
    }
    #[test]
    fn does_not_promote_late_failure_to_success() {
        let mut tracker = SiwcSseTracker::default();
        tracker.observe(b"event: response.failed\r\ndata: {\"type\":\"response.failed\"}\r\n\r\n");
        assert!(matches!(tracker.finish(), SseStreamOutcome::Failed(_)));
    }
}

pub fn is_siwc_quota_failure(event_data: &str) -> bool {
    let data = event_data.to_ascii_lowercase();
    data.contains("subscription_sharing_usage_limit_exceeded")
        || data.contains("rate_limit_exceeded")
        || data.contains("usage_limit_exceeded")
}

#[cfg(test)]
mod late_quota_tests {
    use super::*;
    #[test]
    fn quota_classification_is_narrow_and_does_not_retry_arbitrary_sse_error() {
        assert!(is_siwc_quota_failure(
            r#"{"code":"subscription_sharing_usage_limit_exceeded"}"#
        ));
        assert!(is_siwc_quota_failure(r#"{"code":"rate_limit_exceeded"}"#));
        assert!(!is_siwc_quota_failure(
            r#"{"code":"invalid_request_error"}"#
        ));
    }
}
