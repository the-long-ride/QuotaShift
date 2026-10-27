//! Client-facing encoding of a committed upstream Responses stream.
use axum::{
    body::{Body, Bytes},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;

use super::anthropic::errors::{messages_error_response, no_retry, pool_exhausted};
use super::anthropic::stream::{aggregate_message, MessagesStreamTranslator};
use super::precommit::FailureKind;
use super::response_utils::{
    build_buffered_response, build_passthrough_stream, guarded_stream, prefixed, ByteStream,
    StreamOwners,
};

/// A retryable upstream 4xx, kept so Passthrough can show it once every account has failed
/// (Codex CLI reads usage-limit and reset text from it).
pub struct UpstreamFailure {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}

impl UpstreamFailure {
    /// Bodies above this are not kept; the generic 503 is returned instead.
    pub const MAX_BODY_BYTES: usize = 64 * 1024;

    /// Only a quota 429 or a model-not-found 400/404 is worth showing. A 401/403 body would
    /// read as if the router's own key were wrong, so those fall back to the generic 503.
    pub fn keep(status: StatusCode, headers: &HeaderMap, body: &Bytes) -> Option<Self> {
        let shown = matches!(
            status,
            StatusCode::TOO_MANY_REQUESTS | StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND
        );
        (shown && body.len() <= Self::MAX_BODY_BYTES).then(|| Self {
            status,
            headers: headers.clone(),
            body: body.clone(),
        })
    }
}

#[derive(Clone, Debug)]
pub enum ResponseEncoding {
    Passthrough,
    AnthropicMessages {
        message_id: String,
        alias: String,
        stream: bool,
    },
}

impl ResponseEncoding {
    pub fn is_messages(&self) -> bool {
        matches!(self, Self::AnthropicMessages { .. })
    }

    /// A router-side error: plain text for Passthrough, an Anthropic envelope for Messages.
    pub fn error(&self, status: StatusCode, error_type: &str, message: &str) -> Response {
        match self {
            Self::Passthrough => (status, message.to_string()).into_response(),
            Self::AnthropicMessages { .. } => messages_error_response(status, error_type, message),
        }
    }

    /// Returned when no account is left to try. `last` is why the final account failed and
    /// `upstream` the last retryable upstream 4xx, which Passthrough returns as it was.
    pub fn exhausted(
        &self,
        last: Option<FailureKind>,
        upstream: Option<UpstreamFailure>,
    ) -> Response {
        match self {
            Self::Passthrough => match upstream {
                Some(failure) => {
                    build_buffered_response(failure.status, &failure.headers, failure.body)
                }
                None => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "No eligible Codex account is available for this request",
                )
                    .into_response(),
            },
            Self::AnthropicMessages { alias, .. } => match last {
                None | Some(FailureKind::Quota) => pool_exhausted(alias),
                Some(kind) => no_retry(messages_error_response(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    &format!(
                        "Every account in pool '{alias}' failed; last failure: {}.",
                        kind.label()
                    ),
                )),
            },
        }
    }

    /// A non-success upstream answer that is not retried.
    pub fn upstream_failure(
        &self,
        status: StatusCode,
        headers: &HeaderMap,
        body: Bytes,
    ) -> Response {
        if matches!(self, Self::Passthrough) {
            return build_buffered_response(status, headers, body);
        }
        let message =
            upstream_message(&body).unwrap_or_else(|| "Upstream rejected the request".into());
        if status.is_client_error() {
            messages_error_response(status, "invalid_request_error", &message)
        } else {
            // 5xx keeps its upstream status; anything odd becomes 502.
            let status = if status.is_server_error() {
                status
            } else {
                StatusCode::BAD_GATEWAY
            };
            messages_error_response(status, "api_error", &message)
        }
    }
}

const MAX_UPSTREAM_MESSAGE_CHARS: usize = 1000;

/// The upstream JSON `error.message` (or top-level `message`), capped in length.
fn upstream_message(body: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    let text = value
        .pointer("/error/message")
        .or_else(|| value.get("message"))?
        .as_str()?
        .trim();
    (!text.is_empty()).then(|| text.chars().take(MAX_UPSTREAM_MESSAGE_CHARS).collect())
}

pub async fn commit_response(
    encode: &ResponseEncoding,
    status: StatusCode,
    headers: &HeaderMap,
    prefix: Vec<u8>,
    rest: ByteStream,
    owners: StreamOwners,
) -> Response {
    let ResponseEncoding::AnthropicMessages {
        message_id,
        alias,
        stream,
    } = encode
    else {
        return build_passthrough_stream(status, headers, prefix, rest, owners);
    };
    let upstream = guarded_stream(prefixed(prefix, rest), owners);
    let translator = MessagesStreamTranslator::new(message_id.clone(), alias.clone());
    if *stream {
        stream_messages(upstream, translator)
    } else {
        aggregate_messages(upstream, translator).await
    }
}

fn wire(events: Vec<super::anthropic::events::AnthropicSseEvent>) -> Vec<u8> {
    events
        .iter()
        .flat_map(|event| event.to_sse_wire().into_bytes())
        .collect()
}

fn stream_messages(upstream: ByteStream, translator: MessagesStreamTranslator) -> Response {
    let body = futures_util::stream::unfold(
        (upstream, translator, false),
        |(mut upstream, mut translator, done)| async move {
            if done {
                return None;
            }
            loop {
                match upstream.next().await {
                    Some(Ok(chunk)) => {
                        let bytes = wire(translator.push(&chunk));
                        if !bytes.is_empty() {
                            return Some((Ok(Bytes::from(bytes)), (upstream, translator, false)));
                        }
                    }
                    Some(Err(_)) | None => {
                        let bytes = wire(translator.finish());
                        if bytes.is_empty() {
                            return None;
                        }
                        return Some((Ok(Bytes::from(bytes)), (upstream, translator, true)));
                    }
                }
            }
        },
    );
    let body: ByteStream = Box::pin(body);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(body))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

async fn aggregate_messages(
    mut upstream: ByteStream,
    mut translator: MessagesStreamTranslator,
) -> Response {
    let mut events = Vec::new();
    while let Some(Ok(chunk)) = upstream.next().await {
        events.extend(translator.push(&chunk));
    }
    events.extend(translator.finish());
    match aggregate_message(&events) {
        Ok(message) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_vec(&message).unwrap_or_default()))
            .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response()),
        Err(message) => messages_error_response(StatusCode::BAD_GATEWAY, "api_error", &message),
    }
}
