use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::{stream::BoxStream, StreamExt};

use super::account_budget::AccountReservation;
use super::auth_guard::should_forward_response_header;
use super::types::{InFlightGuard, RetryableFailure};

pub fn router_diagnostic(
    account_id: &str,
    model: Option<&str>,
    status: u16,
    event: &str,
) -> String {
    format!(
        "event={event} account_id={account_id} model={} status={status}",
        model.unwrap_or("none")
    )
}

pub fn pool_request_log(direction: &str, method: &str, path: &str, status: Option<u16>) -> String {
    match status {
        Some(status) => {
            format!("request {direction} method={method} path={path} status={status}")
        }
        None => format!("request {direction} method={method} path={path}"),
    }
}

pub fn classify_retryable_failure(status: StatusCode, body: &[u8]) -> Option<RetryableFailure> {
    if matches!(
        status,
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS
    ) {
        return Some(RetryableFailure::Backoff);
    }

    if matches!(status, StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND) {
        let lower = String::from_utf8_lossy(body).to_ascii_lowercase();
        if lower.contains("model_not_found")
            || lower.contains("model not found")
            || lower.contains("model does not exist")
            || lower.contains("does not have access to model")
        {
            return Some(RetryableFailure::ModelIncompatible);
        }
    }

    None
}

pub fn build_buffered_response(status: StatusCode, headers: &HeaderMap, body: Bytes) -> Response {
    let mut response = Response::builder().status(status);
    if let Some(target) = response.headers_mut() {
        for (name, value) in headers {
            if should_forward_response_header(name) {
                target.insert(name.clone(), value.clone());
            }
        }
    }
    response
        .body(Body::from(body))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

pub type ByteStream = BoxStream<'static, Result<Bytes, std::io::Error>>;
pub type SiwcContext = (
    String,
    String,
    std::sync::Arc<tokio::sync::Mutex<super::selection::RouterRuntimeState>>,
);

/// Everything a committed response must keep alive until the client is done or gone.
pub struct StreamOwners {
    pub in_flight: InFlightGuard,
    pub reservation: AccountReservation,
    pub siwc: Option<SiwcContext>,
    pub telemetry: Option<std::sync::Arc<super::usage_metrics::RouterUsageTelemetry>>,
}

pub fn response_byte_stream(response: reqwest::Response) -> ByteStream {
    Box::pin(
        response
            .bytes_stream()
            .map(|chunk| chunk.map_err(std::io::Error::other)),
    )
}

/// Streams `prefix` followed by `rest` downstream unchanged.
pub fn build_passthrough_stream(
    status: StatusCode,
    headers: &HeaderMap,
    prefix: Vec<u8>,
    rest: ByteStream,
    owners: StreamOwners,
) -> Response {
    let guarded = guarded_stream(prefixed(prefix, rest), owners);
    let mut downstream = Response::builder().status(status);
    if let Some(target) = downstream.headers_mut() {
        for (name, value) in headers {
            if should_forward_response_header(name) {
                target.insert(name.clone(), value.clone());
            }
        }
    }
    downstream
        .body(Body::from_stream(guarded))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

pub fn prefixed(prefix: Vec<u8>, rest: ByteStream) -> ByteStream {
    if prefix.is_empty() {
        return rest;
    }
    Box::pin(futures_util::stream::once(async move { Ok(Bytes::from(prefix)) }).chain(rest))
}

/// Holds the guards for the life of the stream, records usage numbers, and for SIWC records late quota failures.
pub fn guarded_stream(stream: ByteStream, owners: StreamOwners) -> ByteStream {
    use super::responses_transport::SseStreamOutcome;
    use super::siwc_stream::SiwcSseTracker;
    let StreamOwners {
        in_flight,
        reservation,
        siwc: siwc_context,
        telemetry,
    } = owners;
    let tracker = (siwc_context.is_some() || telemetry.is_some()).then(SiwcSseTracker::default);
    Box::pin(futures_util::stream::unfold(
        (stream, Some(in_flight), Some(reservation), tracker),
        move |(mut stream, guard, reservation, mut tracker)| {
            let context = siwc_context.clone();
            let telemetry = telemetry.clone();
            async move {
                match stream.next().await {
                    Some(item) => {
                        if let (Some(tracker), Ok(bytes)) = (tracker.as_mut(), &item) {
                            tracker.observe(bytes);
                        }
                        Some((item, (stream, guard, reservation, tracker)))
                    }
                    None => {
                        if let Some(tracker) = tracker {
                            if let (Some(telemetry), Some(usage)) = (&telemetry, tracker.usage()) {
                                telemetry.record(usage);
                            }
                            if context.is_some() {
                                let terminal = tracker.finish();
                                if let (
                                    Some((account_id, model_id, runtime)),
                                    SseStreamOutcome::Failed(details),
                                ) = (&context, &terminal)
                                {
                                    if super::siwc_stream::is_siwc_quota_failure(details) {
                                        runtime.lock().await.mark_backoff(
                                            account_id,
                                            model_id,
                                            std::time::Duration::from_secs(
                                                super::FAILURE_BACKOFF_SECS,
                                            ),
                                        );
                                    }
                                }
                                let outcome = match &terminal {
                                    SseStreamOutcome::Completed => "completed",
                                    SseStreamOutcome::Failed(_) => "failed",
                                    SseStreamOutcome::Incomplete(_) => "incomplete",
                                    SseStreamOutcome::Truncated => "truncated",
                                };
                                crate::logger::log_info(
                                    "siwc_stream",
                                    &format!(
                                        "account={} terminal={outcome}",
                                        context.as_ref().map(|c| c.0.as_str()).unwrap_or("unknown")
                                    ),
                                );
                                if !matches!(terminal, SseStreamOutcome::Completed) {
                                    drop(reservation);
                                    drop(guard);
                                    return Some((
                                        Err(std::io::Error::other(
                                            "SIWC stream ended without response.completed",
                                        )),
                                        (stream, None, None, None),
                                    ));
                                }
                            }
                        }
                        drop(reservation);
                        drop(guard);
                        None
                    }
                }
            }
        },
    ))
}

pub fn build_models_list_response(models: Vec<String>) -> Response {
    let data: Vec<serde_json::Value> = models
        .into_iter()
        .map(|id| {
            serde_json::json!({
                "id": id,
                "object": "model",
                "created": 1700000000,
                "owned_by": "quotashift"
            })
        })
        .collect();
    let resp = serde_json::json!({
        "object": "list",
        "data": data
    });
    build_buffered_response(
        StatusCode::OK,
        &HeaderMap::new(),
        Bytes::from(serde_json::to_vec(&resp).unwrap_or_default()),
    )
}
