//! Holds upstream SSE bytes back until the first content event so a quota failure that
//! arrives before any content can still fail over to the next pool account.
use std::time::{Duration, Instant};

use axum::{body::Bytes, http::StatusCode};
use futures_util::StreamExt;
use serde_json::Value;

use super::anthropic::stream::parse_frame;
use super::response_utils::{classify_retryable_failure, response_byte_stream, ByteStream};
use super::siwc_stream::{find_boundary, is_siwc_quota_failure};
use super::types::RetryableFailure;

pub struct PrecommitLimits {
    pub max_prefix_bytes: usize,
    pub max_wait: Duration,
    /// Passthrough (Codex CLI): any non-message output item, a custom tool input delta or a
    /// reasoning summary delta also end buffering. Messages keeps the narrow rule, because only
    /// text and tool calls reach Claude Code.
    pub wide_commit: bool,
}

impl Default for PrecommitLimits {
    fn default() -> Self {
        Self {
            max_prefix_bytes: 1024 * 1024,
            max_wait: Duration::from_secs(120),
            wide_commit: false,
        }
    }
}

/// Why an account was given up on; decides how an exhausted pool is reported.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FailureKind {
    Quota,
    Auth,
    ModelIncompatible,
    Rejected,
    Transport,
}

impl FailureKind {
    pub fn from_status(status: StatusCode, failure: RetryableFailure) -> Self {
        match (status, failure) {
            (_, RetryableFailure::ModelIncompatible) => Self::ModelIncompatible,
            (StatusCode::TOO_MANY_REQUESTS, _) => Self::Quota,
            (StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN, _) => Self::Auth,
            _ => Self::Rejected,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Quota => "quota exhausted",
            Self::Auth => "authentication rejected",
            Self::ModelIncompatible => "model not available",
            Self::Rejected => "request rejected",
            Self::Transport => "upstream transport error",
        }
    }
}

pub enum Precommit {
    /// Content seen (or a limit hit): send `prefix` then `rest` downstream.
    Commit {
        prefix: Vec<u8>,
        rest: ByteStream,
    },
    RetryNextAccount(RetryableFailure, FailureKind),
    Fail {
        status: StatusCode,
        body: Bytes,
    },
}

/// Content events end the buffering phase. A bare `message` item does not.
pub fn is_content_event(event_type: &str, data: &Value, wide: bool) -> bool {
    match event_type {
        "response.output_text.delta" | "response.function_call_arguments.delta" => true,
        "response.output_item.added" => {
            let kind = data["item"]["type"].as_str();
            kind == Some("function_call") || (wide && kind.is_some_and(|k| k != "message"))
        }
        "response.custom_tool_call_input.delta" | "response.reasoning_summary_text.delta" => wide,
        _ => false,
    }
}

pub async fn read_until_commit(response: reqwest::Response, limits: PrecommitLimits) -> Precommit {
    let status = response.status();
    if !status.is_success() {
        let body = response.bytes().await.unwrap_or_default();
        return match classify_retryable_failure(status, &body) {
            Some(failure) => {
                Precommit::RetryNextAccount(failure, FailureKind::from_status(status, failure))
            }
            None => Precommit::Fail { status, body },
        };
    }
    let mut rest = response_byte_stream(response);
    let mut prefix: Vec<u8> = Vec::new();
    let mut scanned = 0usize;
    let deadline = Instant::now() + limits.max_wait;
    loop {
        while let Some((boundary, delimiter)) = find_boundary(&prefix[scanned..]) {
            let raw = String::from_utf8_lossy(&prefix[scanned..scanned + boundary]).to_string();
            scanned += boundary + delimiter;
            let Some((event_type, data)) = parse_frame(&raw) else {
                continue;
            };
            if is_content_event(&event_type, &data, limits.wide_commit) {
                return Precommit::Commit { prefix, rest };
            }
            let failed = event_type == "error" || event_type == "response.failed";
            if failed && is_siwc_quota_failure(&raw) {
                return Precommit::RetryNextAccount(RetryableFailure::Backoff, FailureKind::Quota);
            }
        }
        if prefix.len() >= limits.max_prefix_bytes {
            return Precommit::Commit { prefix, rest };
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        match tokio::time::timeout(remaining, rest.next()).await {
            // Never fail over after a timeout: commit what was read.
            Err(_) | Ok(None) => return Precommit::Commit { prefix, rest },
            Ok(Some(Ok(chunk))) => prefix.extend_from_slice(&chunk),
            Ok(Some(Err(_))) => {
                return Precommit::RetryNextAccount(
                    RetryableFailure::Backoff,
                    FailureKind::Transport,
                )
            }
        }
    }
}
