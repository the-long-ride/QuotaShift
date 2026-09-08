use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{Request, State},
    http::{header, HeaderMap, HeaderName, StatusCode},
    response::{IntoResponse, Response},
    Router,
};
use futures_util::StreamExt;
use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tokio::{
    sync::{oneshot, Mutex as AsyncMutex, Notify},
    task::JoinHandle,
};

pub const FAILURE_BACKOFF_SECS: u64 = 60;
const OAUTH_UPSTREAM_BASE: &str = "https://chatgpt.com/backend-api/codex";
const API_UPSTREAM_BASE: &str = "https://api.openai.com/v1";
const MAX_ROUTER_REQUEST_BODY: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterQuotaWindow {
    pub remaining_percent: f64,
    pub duration_minutes: Option<f64>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum CodexRouterAuth {
    OAuth {
        access_token: String,
        refresh_token: Option<String>,
        chatgpt_account_id: String,
    },
    ApiKey {
        api_key: String,
    },
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterAccount {
    pub id: String,
    pub auth: CodexRouterAuth,
    pub available_model_ids: Option<Vec<String>>,
    pub quota_windows: Vec<RouterQuotaWindow>,
    pub usage_fetched_at: Option<i64>,
    pub model_catalog_fetched_at: Option<i64>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterPool {
    pub id: String,
    pub model: String,
    pub account_ids: Vec<String>,
    pub model_selection_mode: String,
    pub activated_at: i64,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterConfig {
    pub accounts: Vec<CodexRouterAccount>,
    pub pools: Vec<CodexRouterPool>,
    pub applied_account_id: Option<String>,
}

#[derive(Default)]
pub(crate) struct RouterRuntimeState {
    round_robin_cursor: HashMap<String, usize>,
    backoff_until: HashMap<(String, String), Instant>,
    model_incompatible: HashSet<(String, String)>,
}

#[derive(Clone, Debug)]
struct RankedCandidate {
    id: String,
    score: Option<f64>,
    completeness: usize,
    freshness: i64,
}

pub(crate) fn bottleneck_score(account: &CodexRouterAccount) -> Option<f64> {
    account
        .quota_windows
        .iter()
        .filter_map(|window| {
            if window.remaining_percent.is_finite() {
                Some(window.remaining_percent.clamp(0.0, 100.0))
            } else {
                None
            }
        })
        .reduce(f64::min)
}

impl RouterRuntimeState {
    pub(crate) fn mark_backoff(&mut self, account_id: &str, model: &str, duration: Duration) {
        self.backoff_until.insert(
            (account_id.to_string(), model.to_string()),
            Instant::now() + duration,
        );
    }

    #[allow(dead_code)]
    pub(crate) fn mark_model_incompatible(&mut self, account_id: &str, model: &str) {
        self.model_incompatible
            .insert((account_id.to_string(), model.to_string()));
    }

    #[allow(dead_code)]
    pub(crate) fn clear_model_incompatible(&mut self, account_id: &str, model: &str) {
        self.model_incompatible
            .remove(&(account_id.to_string(), model.to_string()));
    }

    fn is_backed_off(&mut self, account_id: &str, model: &str, now: Instant) -> bool {
        let key = (account_id.to_string(), model.to_string());
        match self.backoff_until.get(&key).copied() {
            Some(until) if until > now => true,
            Some(_) => {
                self.backoff_until.remove(&key);
                false
            }
            None => false,
        }
    }

    fn matching_pool<'a>(
        &self,
        config: &'a CodexRouterConfig,
        requested_model: &str,
    ) -> Option<&'a CodexRouterPool> {
        config
            .pools
            .iter()
            .filter(|pool| pool.model == requested_model)
            .max_by_key(|pool| pool.activated_at)
    }

    fn eligible_candidates(
        &mut self,
        config: &CodexRouterConfig,
        pool: &CodexRouterPool,
        requested_model: &str,
    ) -> Vec<RankedCandidate> {
        let accounts: HashMap<&str, &CodexRouterAccount> = config
            .accounts
            .iter()
            .map(|account| (account.id.as_str(), account))
            .collect();
        let now = Instant::now();
        let strict = pool.model_selection_mode == "discovered";

        pool.account_ids
            .iter()
            .filter_map(|account_id| {
                let account = accounts.get(account_id.as_str()).copied()?;

                if self
                    .model_incompatible
                    .contains(&(account.id.clone(), requested_model.to_string()))
                {
                    return None;
                }

                if self.is_backed_off(&account.id, requested_model, now) {
                    return None;
                }

                if strict {
                    let confirms_model = account
                        .available_model_ids
                        .as_ref()
                        .is_some_and(|models| models.iter().any(|model| model == requested_model));
                    if !confirms_model {
                        return None;
                    }
                }

                let score = bottleneck_score(account);
                if score.is_some_and(|value| value <= 0.0) {
                    return None;
                }

                Some(RankedCandidate {
                    id: account.id.clone(),
                    score,
                    completeness: account
                        .quota_windows
                        .iter()
                        .filter(|window| window.remaining_percent.is_finite())
                        .count(),
                    freshness: account.usage_fetched_at.unwrap_or(i64::MIN),
                })
            })
            .collect()
    }

    fn choose_ranked_candidate(
        &mut self,
        pool: &CodexRouterPool,
        requested_model: &str,
        mut candidates: Vec<RankedCandidate>,
    ) -> Option<String> {
        if candidates.is_empty() {
            return None;
        }

        if candidates.iter().any(|candidate| candidate.score.is_some()) {
            let best_score = candidates
                .iter()
                .filter_map(|candidate| candidate.score)
                .fold(f64::NEG_INFINITY, f64::max);
            candidates.retain(|candidate| candidate.score == Some(best_score));
        }

        let best_completeness = candidates
            .iter()
            .map(|candidate| candidate.completeness)
            .max()
            .unwrap_or(0);
        candidates.retain(|candidate| candidate.completeness == best_completeness);

        let best_freshness = candidates
            .iter()
            .map(|candidate| candidate.freshness)
            .max()
            .unwrap_or(i64::MIN);
        candidates.retain(|candidate| candidate.freshness == best_freshness);

        let cursor_key = format!("{}:{}", pool.id, requested_model);
        let cursor = self.round_robin_cursor.entry(cursor_key).or_insert(0);
        let selected = candidates[*cursor % candidates.len()].id.clone();
        *cursor = cursor.wrapping_add(1);
        Some(selected)
    }

    pub(crate) fn select_account_for_model(
        &mut self,
        config: &CodexRouterConfig,
        requested_model: &str,
    ) -> Option<String> {
        let Some(pool) = self.matching_pool(config, requested_model).cloned() else {
            return config.applied_account_id.as_ref().and_then(|applied_id| {
                config
                    .accounts
                    .iter()
                    .any(|account| account.id == *applied_id)
                    .then(|| applied_id.clone())
            });
        };

        let candidates = self.eligible_candidates(config, &pool, requested_model);
        self.choose_ranked_candidate(&pool, requested_model, candidates)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RouterRouteDecision {
    Health,
    Forward,
    MethodNotAllowed,
    NotFound,
}

fn route_decision(method: &str, path: &str) -> RouterRouteDecision {
    match path {
        "/health" => {
            if method == "GET" {
                RouterRouteDecision::Health
            } else {
                RouterRouteDecision::MethodNotAllowed
            }
        }
        "/responses" | "/responses/compact" | "/v1/responses" | "/v1/responses/compact" => {
            if method == "POST" {
                RouterRouteDecision::Forward
            } else {
                RouterRouteDecision::MethodNotAllowed
            }
        }
        "/models" | "/v1/models" => {
            if method == "GET" {
                RouterRouteDecision::Forward
            } else {
                RouterRouteDecision::MethodNotAllowed
            }
        }
        _ => RouterRouteDecision::NotFound,
    }
}

#[derive(Clone)]
struct RouterUpstreams {
    oauth_base: String,
    api_base: String,
}

impl Default for RouterUpstreams {
    fn default() -> Self {
        Self {
            oauth_base: OAUTH_UPSTREAM_BASE.to_string(),
            api_base: API_UPSTREAM_BASE.to_string(),
        }
    }
}

#[derive(Clone)]
struct RouterAppState {
    config: Arc<AsyncMutex<Option<CodexRouterConfig>>>,
    selection_state: Arc<AsyncMutex<RouterRuntimeState>>,
    in_flight: Arc<AtomicU64>,
    in_flight_notify: Arc<Notify>,
    client: reqwest::Client,
    upstreams: RouterUpstreams,
    last_routed_account_id: Arc<AsyncMutex<Option<String>>>,
    last_routed_model: Arc<AsyncMutex<Option<String>>>,
    routed_request_count: Arc<AtomicU64>,
}

struct InFlightGuard {
    count: Arc<AtomicU64>,
    notify: Arc<Notify>,
}

impl InFlightGuard {
    fn new(count: Arc<AtomicU64>, notify: Arc<Notify>) -> Self {
        count.fetch_add(1, Ordering::SeqCst);
        Self { count, notify }
    }
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        if self.count.fetch_sub(1, Ordering::SeqCst) == 1 {
            self.notify.notify_waiters();
        }
    }
}

fn extract_requested_model(body: &Bytes) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    value
        .as_object()?
        .get("model")?
        .as_str()
        .map(str::to_string)
        .filter(|model| !model.trim().is_empty())
}

fn normalized_forward_path(path: &str) -> Option<&str> {
    match path {
        "/responses" | "/responses/compact" | "/models" => Some(path),
        "/v1/responses" | "/v1/responses/compact" | "/v1/models" => path.strip_prefix("/v1"),
        _ => None,
    }
}

fn upstream_url(
    upstreams: &RouterUpstreams,
    auth: &CodexRouterAuth,
    path: &str,
    query: Option<&str>,
) -> Option<String> {
    let normalized = normalized_forward_path(path)?;
    let base = match auth {
        CodexRouterAuth::OAuth { .. } => upstreams.oauth_base.as_str(),
        CodexRouterAuth::ApiKey { .. } => upstreams.api_base.as_str(),
    };
    let mut url = format!("{}{}", base.trim_end_matches('/'), normalized);
    if let Some(query) = query.filter(|query| !query.is_empty()) {
        url.push('?');
        url.push_str(query);
    }
    Some(url)
}

fn should_forward_request_header(name: &HeaderName) -> bool {
    !matches!(
        name.as_str(),
        "authorization"
            | "chatgpt-account-id"
            | "host"
            | "content-length"
            | "connection"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn should_forward_response_header(name: &HeaderName) -> bool {
    !matches!(
        name.as_str(),
        "content-length" | "connection" | "transfer-encoding" | "upgrade"
    )
}

fn router_diagnostic(account_id: &str, model: Option<&str>, status: u16, event: &str) -> String {
    format!(
        "event={event} account_id={account_id} model={} status={status}",
        model.unwrap_or("none")
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RetryableFailure {
    Backoff,
    ModelIncompatible,
}

fn classify_retryable_failure(status: StatusCode, body: &[u8]) -> Option<RetryableFailure> {
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

fn build_buffered_response(status: StatusCode, headers: &HeaderMap, body: Bytes) -> Response {
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

fn build_streaming_response(response: reqwest::Response, in_flight: InFlightGuard) -> Response {
    let status = response.status();
    let headers = response.headers().clone();
    let stream = Box::pin(response.bytes_stream());
    let guarded_stream = futures_util::stream::unfold(
        (stream, Some(in_flight)),
        |(mut stream, guard)| async move {
            match stream.next().await {
                Some(item) => Some((item, (stream, guard))),
                None => {
                    drop(guard);
                    None
                }
            }
        },
    );
    let mut downstream = Response::builder().status(status);
    if let Some(target) = downstream.headers_mut() {
        for (name, value) in &headers {
            if should_forward_response_header(name) {
                target.insert(name.clone(), value.clone());
            }
        }
    }
    downstream
        .body(Body::from_stream(guarded_stream))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

fn applied_account<'a>(config: &'a CodexRouterConfig) -> Option<&'a CodexRouterAccount> {
    let applied_id = config.applied_account_id.as_deref()?;
    config
        .accounts
        .iter()
        .find(|account| account.id == applied_id)
}

async fn select_account(
    state: &RouterAppState,
    config: &CodexRouterConfig,
    model: Option<&str>,
) -> Option<CodexRouterAccount> {
    let account_id = match model {
        Some(model) => state
            .selection_state
            .lock()
            .await
            .select_account_for_model(config, model),
        None => applied_account(config).map(|account| account.id.clone()),
    }?;
    config
        .accounts
        .iter()
        .find(|account| account.id == account_id)
        .cloned()
}

async fn mark_retryable_failure(
    state: &RouterAppState,
    account_id: &str,
    model: Option<&str>,
    failure: RetryableFailure,
) {
    let Some(model) = model else {
        return;
    };
    let mut runtime = state.selection_state.lock().await;
    match failure {
        RetryableFailure::Backoff => {
            runtime.mark_backoff(account_id, model, Duration::from_secs(FAILURE_BACKOFF_SECS))
        }
        RetryableFailure::ModelIncompatible => runtime.mark_model_incompatible(account_id, model),
    }
}

async fn forward_request(state: RouterAppState, request: Request) -> Response {
    let in_flight = InFlightGuard::new(state.in_flight.clone(), state.in_flight_notify.clone());
    let config = match state.config.lock().await.clone() {
        Some(config) => config,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "Codex router has no runtime account configuration",
            )
                .into_response();
        }
    };

    let (parts, body) = request.into_parts();
    let path = parts.uri.path().to_string();
    let query = parts.uri.query().map(str::to_string);
    let body = match to_bytes(body, MAX_ROUTER_REQUEST_BODY).await {
        Ok(body) => body,
        Err(_) => return (StatusCode::PAYLOAD_TOO_LARGE, "Request body too large").into_response(),
    };
    let needs_model = matches!(
        path.as_str(),
        "/responses" | "/responses/compact" | "/v1/responses" | "/v1/responses/compact"
    );
    let requested_model = if needs_model {
        match extract_requested_model(&body) {
            Some(model) => Some(model),
            None => return (StatusCode::BAD_REQUEST, "Missing top-level model").into_response(),
        }
    } else {
        None
    };

    let max_attempts = config.accounts.len().max(1);
    let mut attempted = HashSet::new();

    for _ in 0..max_attempts {
        let Some(account) = select_account(&state, &config, requested_model.as_deref()).await
        else {
            break;
        };
        if !attempted.insert(account.id.clone()) {
            break;
        }
        let Some(url) = upstream_url(&state.upstreams, &account.auth, &path, query.as_deref())
        else {
            return StatusCode::NOT_FOUND.into_response();
        };

        let mut builder = state.client.request(parts.method.clone(), &url);
        for (name, value) in &parts.headers {
            if should_forward_request_header(name) {
                builder = builder.header(name, value);
            }
        }
        builder = match &account.auth {
            CodexRouterAuth::OAuth {
                access_token,
                chatgpt_account_id,
                ..
            } => builder
                .bearer_auth(access_token)
                .header("chatgpt-account-id", chatgpt_account_id),
            CodexRouterAuth::ApiKey { api_key } => builder.bearer_auth(api_key),
        };
        if !body.is_empty() {
            builder = builder.body(body.clone());
        }

        let response = match builder.send().await {
            Ok(response) => response,
            Err(_) => {
                mark_retryable_failure(
                    &state,
                    &account.id,
                    requested_model.as_deref(),
                    RetryableFailure::Backoff,
                )
                .await;
                crate::logger::log_warn(
                    "codex_router",
                    &router_diagnostic(
                        &account.id,
                        requested_model.as_deref(),
                        0,
                        "upstream_transport_failure",
                    ),
                );
                continue;
            }
        };

        let status = response.status();
        if matches!(
            status,
            StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::TOO_MANY_REQUESTS
                | StatusCode::BAD_REQUEST
                | StatusCode::NOT_FOUND
        ) {
            let headers = response.headers().clone();
            let failure_body = match response.bytes().await {
                Ok(body) => body,
                Err(_) => Bytes::new(),
            };
            if let Some(failure) = classify_retryable_failure(status, &failure_body) {
                mark_retryable_failure(&state, &account.id, requested_model.as_deref(), failure)
                    .await;
                crate::logger::log_warn(
                    "codex_router",
                    &router_diagnostic(
                        &account.id,
                        requested_model.as_deref(),
                        status.as_u16(),
                        "precommit_failover",
                    ),
                );
                if attempted.len() < max_attempts {
                    continue;
                }
            }
            return build_buffered_response(status, &headers, failure_body);
        }

        *state.last_routed_account_id.lock().await = Some(account.id.clone());
        *state.last_routed_model.lock().await = requested_model.clone();
        state.routed_request_count.fetch_add(1, Ordering::SeqCst);
        crate::logger::log_info(
            "codex_router",
            &router_diagnostic(
                &account.id,
                requested_model.as_deref(),
                status.as_u16(),
                "forwarded",
            ),
        );
        return build_streaming_response(response, in_flight);
    }

    (
        StatusCode::SERVICE_UNAVAILABLE,
        "No eligible Codex account is available for this request",
    )
        .into_response()
}

async fn router_surface(State(state): State<RouterAppState>, request: Request) -> Response {
    match route_decision(request.method().as_str(), request.uri().path()) {
        RouterRouteDecision::Health => (StatusCode::OK, "ok").into_response(),
        RouterRouteDecision::Forward => forward_request(state, request).await,
        RouterRouteDecision::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED.into_response(),
        RouterRouteDecision::NotFound => StatusCode::NOT_FOUND.into_response(),
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterStatus {
    pub running: bool,
    pub base_url: Option<String>,
    pub last_routed_account_id: Option<String>,
    pub last_routed_model: Option<String>,
    pub routed_request_count: u64,
    pub client_coverage: HashMap<String, String>,
}

struct ListenerRuntime {
    base_url: String,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
}

pub struct CodexRouterManager {
    listener: AsyncMutex<Option<ListenerRuntime>>,
    config: Arc<AsyncMutex<Option<CodexRouterConfig>>>,
    selection_state: Arc<AsyncMutex<RouterRuntimeState>>,
    in_flight: Arc<AtomicU64>,
    in_flight_notify: Arc<Notify>,
    client: reqwest::Client,
    upstreams: RouterUpstreams,
    last_routed_account_id: Arc<AsyncMutex<Option<String>>>,
    last_routed_model: Arc<AsyncMutex<Option<String>>>,
    routed_request_count: Arc<AtomicU64>,
    manage_provider_config: bool,
}

impl Default for CodexRouterManager {
    fn default() -> Self {
        Self::new(RouterUpstreams::default(), true)
    }
}

impl CodexRouterManager {
    fn with_upstreams(upstreams: RouterUpstreams) -> Self {
        Self::new(upstreams, false)
    }

    fn new(upstreams: RouterUpstreams, manage_provider_config: bool) -> Self {
        Self {
            listener: AsyncMutex::new(None),
            config: Arc::new(AsyncMutex::new(None)),
            selection_state: Arc::new(AsyncMutex::new(RouterRuntimeState::default())),
            in_flight: Arc::new(AtomicU64::new(0)),
            in_flight_notify: Arc::new(Notify::new()),
            client: reqwest::Client::new(),
            upstreams,
            last_routed_account_id: Arc::new(AsyncMutex::new(None)),
            last_routed_model: Arc::new(AsyncMutex::new(None)),
            routed_request_count: Arc::new(AtomicU64::new(0)),
            manage_provider_config,
        }
    }

    fn app_state(&self) -> RouterAppState {
        RouterAppState {
            config: self.config.clone(),
            selection_state: self.selection_state.clone(),
            in_flight: self.in_flight.clone(),
            in_flight_notify: self.in_flight_notify.clone(),
            client: self.client.clone(),
            upstreams: self.upstreams.clone(),
            last_routed_account_id: self.last_routed_account_id.clone(),
            last_routed_model: self.last_routed_model.clone(),
            routed_request_count: self.routed_request_count.clone(),
        }
    }

    pub async fn start_listener(&self) -> Result<CodexRouterStatus, String> {
        let mut runtime_guard = self.listener.lock().await;
        if runtime_guard.is_some() {
            drop(runtime_guard);
            return Ok(self.status().await);
        }

        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|error| format!("Failed to bind Codex router loopback listener: {error}"))?;
        let address = listener
            .local_addr()
            .map_err(|error| format!("Failed to inspect Codex router listener: {error}"))?;
        if address.ip() != std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST) {
            return Err(format!(
                "Refusing non-loopback Codex router listener: {address}"
            ));
        }

        let base_url = format!("http://127.0.0.1:{}", address.port());
        let app = Router::new()
            .fallback(router_surface)
            .with_state(self.app_state());
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        let mut shutdown_tx = Some(shutdown_tx);
        let task = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        let health_url = format!("{base_url}/health");
        let mut healthy = false;
        for _ in 0..20 {
            if let Ok(response) = self.client.get(&health_url).send().await {
                if response.status() == reqwest::StatusCode::OK {
                    healthy = true;
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }

        if !healthy {
            if let Some(shutdown) = shutdown_tx.take() {
                let _ = shutdown.send(());
            }
            let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
            return Err("Codex router listener failed its loopback health check".to_string());
        }

        if self.manage_provider_config {
            if let Err(error) = crate::codex_sync::begin_codex_router_config(&base_url) {
                if let Some(shutdown) = shutdown_tx.take() {
                    let _ = shutdown.send(());
                }
                let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
                return Err(format!(
                    "Failed to enable Codex router provider config: {error}"
                ));
            }
        }

        *runtime_guard = Some(ListenerRuntime {
            base_url: base_url.clone(),
            shutdown: shutdown_tx,
            task,
        });
        drop(runtime_guard);
        Ok(self.status().await)
    }

    pub async fn stop_listener(&self) -> Result<CodexRouterStatus, String> {
        let runtime = self.listener.lock().await.take();
        let mut task = None;
        if let Some(mut runtime) = runtime {
            if let Some(shutdown) = runtime.shutdown.take() {
                let _ = shutdown.send(());
            }
            task = Some(runtime.task);
        }

        let deadline = Instant::now() + Duration::from_secs(10);
        while self.in_flight.load(Ordering::SeqCst) > 0 {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            let remaining = deadline.saturating_duration_since(now);
            let _ = tokio::time::timeout(remaining, self.in_flight_notify.notified()).await;
        }

        let restore_result = if self.manage_provider_config {
            crate::codex_sync::restore_codex_router_config()
        } else {
            Ok(())
        };

        if let Some(mut task) = task {
            if tokio::time::timeout(Duration::from_secs(2), &mut task)
                .await
                .is_err()
            {
                task.abort();
                let _ = task.await;
            }
        }

        restore_result
            .map_err(|error| format!("Failed to restore Codex provider config: {error}"))?;
        Ok(self.status().await)
    }

    pub async fn configure(&self, config: CodexRouterConfig) {
        let mut config_guard = self.config.lock().await;
        if let Some(previous) = config_guard.as_ref() {
            let refreshed_accounts: HashSet<String> = config
                .accounts
                .iter()
                .filter_map(|account| {
                    let previous_generation = previous
                        .accounts
                        .iter()
                        .find(|prior| prior.id == account.id)
                        .and_then(|prior| prior.model_catalog_fetched_at);
                    account
                        .model_catalog_fetched_at
                        .filter(|generation| Some(*generation) != previous_generation)
                        .map(|_| account.id.clone())
                })
                .collect();

            let routing_fingerprint = |snapshot: &CodexRouterConfig,
                                       account_id: &str,
                                       model: &str| {
                let mut pools: Vec<(String, String, Vec<String>)> = snapshot
                    .pools
                    .iter()
                    .filter(|pool| {
                        pool.model == model && pool.account_ids.iter().any(|id| id == account_id)
                    })
                    .map(|pool| {
                        (
                            pool.id.clone(),
                            pool.model_selection_mode.clone(),
                            pool.account_ids.clone(),
                        )
                    })
                    .collect();
                pools.sort_by(|left, right| left.0.cmp(&right.0));
                pools
            };

            self.selection_state
                .lock()
                .await
                .model_incompatible
                .retain(|(account_id, model)| {
                    !refreshed_accounts.contains(account_id)
                        && routing_fingerprint(previous, account_id, model)
                            == routing_fingerprint(&config, account_id, model)
                });
        }
        *config_guard = Some(config);
    }

    pub async fn status(&self) -> CodexRouterStatus {
        let base_url = self
            .listener
            .lock()
            .await
            .as_ref()
            .map(|runtime| runtime.base_url.clone());
        CodexRouterStatus {
            running: base_url.is_some(),
            base_url,
            last_routed_account_id: self.last_routed_account_id.lock().await.clone(),
            last_routed_model: self.last_routed_model.lock().await.clone(),
            routed_request_count: self.routed_request_count.load(Ordering::SeqCst),
            client_coverage: HashMap::from([(
                "sharedProvider".to_string(),
                "configured".to_string(),
            )]),
        }
    }
}

#[tauri::command]
pub async fn start_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    manager.start_listener().await
}

#[tauri::command]
pub async fn stop_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    manager.stop_listener().await
}

#[tauri::command]
pub async fn configure_codex_router(
    manager: tauri::State<'_, CodexRouterManager>,
    config: CodexRouterConfig,
) -> Result<CodexRouterStatus, String> {
    manager.configure(config).await;
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn get_codex_router_status(
    manager: tauri::State<'_, CodexRouterManager>,
) -> Result<CodexRouterStatus, String> {
    Ok(manager.status().await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn oauth_account(
        id: &str,
        models: Option<Vec<&str>>,
        windows: Vec<f64>,
        fetched_at: Option<i64>,
    ) -> CodexRouterAccount {
        CodexRouterAccount {
            id: id.to_string(),
            auth: CodexRouterAuth::OAuth {
                access_token: format!("token-{id}"),
                refresh_token: None,
                chatgpt_account_id: format!("chatgpt-{id}"),
            },
            available_model_ids: models
                .map(|items| items.into_iter().map(str::to_string).collect()),
            quota_windows: windows
                .into_iter()
                .map(|remaining_percent| RouterQuotaWindow {
                    remaining_percent,
                    duration_minutes: None,
                })
                .collect(),
            usage_fetched_at: fetched_at,
            model_catalog_fetched_at: None,
        }
    }

    fn pool(
        id: &str,
        model: &str,
        account_ids: &[&str],
        mode: &str,
        activated_at: i64,
    ) -> CodexRouterPool {
        CodexRouterPool {
            id: id.to_string(),
            model: model.to_string(),
            account_ids: account_ids.iter().map(|id| (*id).to_string()).collect(),
            model_selection_mode: mode.to_string(),
            activated_at,
        }
    }

    fn config(accounts: Vec<CodexRouterAccount>, pools: Vec<CodexRouterPool>) -> CodexRouterConfig {
        CodexRouterConfig {
            accounts,
            pools,
            applied_account_id: None,
        }
    }

    #[test]
    fn bottleneck_score_uses_minimum_known_remaining_window() {
        let hundred_one = oauth_account("a", None, vec![100.0, 1.0], Some(10));
        let sixty_sixty = oauth_account("b", None, vec![60.0, 60.0], Some(10));
        let weekly_only = oauth_account("c", None, vec![42.0], Some(10));
        let unknown = oauth_account("d", None, vec![], None);

        assert_eq!(bottleneck_score(&hundred_one), Some(1.0));
        assert_eq!(bottleneck_score(&sixty_sixty), Some(60.0));
        assert_eq!(bottleneck_score(&weekly_only), Some(42.0));
        assert_eq!(bottleneck_score(&unknown), None);
    }

    #[test]
    fn discovered_pool_excludes_member_that_does_not_confirm_model() {
        let cfg = config(
            vec![
                oauth_account("missing", Some(vec!["gpt-other"]), vec![90.0], Some(10)),
                oauth_account("supported", Some(vec!["gpt-target"]), vec![40.0], Some(10)),
            ],
            vec![pool(
                "strict",
                "gpt-target",
                &["missing", "supported"],
                "discovered",
                1,
            )],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("supported".to_string())
        );
    }

    #[test]
    fn manual_pool_keeps_unconfirmed_member_eligible() {
        let cfg = config(
            vec![
                oauth_account("manual", Some(vec!["gpt-other"]), vec![90.0], Some(10)),
                oauth_account("other", Some(vec!["gpt-target"]), vec![40.0], Some(10)),
            ],
            vec![pool(
                "manual-pool",
                "gpt-target",
                &["manual", "other"],
                "manual",
                1,
            )],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("manual".to_string())
        );
    }

    #[test]
    fn exact_ties_rotate_deterministically() {
        let cfg = config(
            vec![
                oauth_account("a", Some(vec!["gpt-target"]), vec![50.0], Some(10)),
                oauth_account("b", Some(vec!["gpt-target"]), vec![50.0], Some(10)),
            ],
            vec![pool("p", "gpt-target", &["a", "b"], "discovered", 1)],
        );
        let mut state = RouterRuntimeState::default();

        let first = state.select_account_for_model(&cfg, "gpt-target");
        let second = state.select_account_for_model(&cfg, "gpt-target");

        assert_eq!(first, Some("a".to_string()));
        assert_eq!(second, Some("b".to_string()));
    }

    #[test]
    fn completeness_and_freshness_break_score_ties_before_round_robin() {
        let cfg = config(
            vec![
                oauth_account("older", Some(vec!["gpt-target"]), vec![50.0], Some(10)),
                oauth_account(
                    "complete",
                    Some(vec!["gpt-target"]),
                    vec![50.0, 80.0],
                    Some(20),
                ),
            ],
            vec![pool(
                "p",
                "gpt-target",
                &["older", "complete"],
                "discovered",
                1,
            )],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("complete".to_string())
        );
    }

    #[test]
    fn backoff_is_scoped_to_account_and_model() {
        let cfg = config(
            vec![
                oauth_account("a", None, vec![90.0], Some(10)),
                oauth_account("b", None, vec![50.0], Some(10)),
            ],
            vec![
                pool("x", "model-x", &["a", "b"], "manual", 2),
                pool("y", "model-y", &["a", "b"], "manual", 1),
            ],
        );
        let mut state = RouterRuntimeState::default();
        state.mark_backoff("a", "model-x", Duration::from_secs(FAILURE_BACKOFF_SECS));

        assert_eq!(
            state.select_account_for_model(&cfg, "model-x"),
            Some("b".to_string())
        );
        assert_eq!(
            state.select_account_for_model(&cfg, "model-y"),
            Some("a".to_string())
        );
    }

    #[test]
    fn newest_matching_pool_wins() {
        let cfg = config(
            vec![
                oauth_account("old", None, vec![99.0], Some(10)),
                oauth_account("new", None, vec![1.0], Some(10)),
            ],
            vec![
                pool("old-pool", "gpt-target", &["old"], "manual", 10),
                pool("new-pool", "gpt-target", &["new"], "manual", 20),
            ],
        );
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "gpt-target"),
            Some("new".to_string())
        );
    }

    #[test]
    fn unmatched_model_falls_back_to_applied_account_and_unknown_quota_is_not_zero() {
        let mut cfg = config(vec![oauth_account("applied", None, vec![], None)], vec![]);
        cfg.applied_account_id = Some("applied".to_string());
        let mut state = RouterRuntimeState::default();

        assert_eq!(
            state.select_account_for_model(&cfg, "unmatched-model"),
            Some("applied".to_string())
        );
    }
}

#[cfg(test)]
mod listener_tests {
    use super::*;

    #[test]
    fn route_surface_allows_only_explicit_codex_paths_and_methods() {
        for path in [
            "/responses",
            "/responses/compact",
            "/v1/responses",
            "/v1/responses/compact",
        ] {
            assert_eq!(route_decision("POST", path), RouterRouteDecision::Forward);
            assert_eq!(
                route_decision("GET", path),
                RouterRouteDecision::MethodNotAllowed
            );
        }

        for path in ["/models", "/v1/models"] {
            assert_eq!(route_decision("GET", path), RouterRouteDecision::Forward);
            assert_eq!(
                route_decision("POST", path),
                RouterRouteDecision::MethodNotAllowed
            );
        }

        assert_eq!(
            route_decision("GET", "/health"),
            RouterRouteDecision::Health
        );
        assert_eq!(
            route_decision("POST", "/health"),
            RouterRouteDecision::MethodNotAllowed
        );
        assert_eq!(
            route_decision("GET", "/anything-else"),
            RouterRouteDecision::NotFound
        );
        assert_eq!(
            route_decision("POST", "/v1/chat/completions"),
            RouterRouteDecision::NotFound
        );
    }

    #[tokio::test]
    async fn manager_binds_only_loopback_on_an_os_assigned_port_and_health_is_live() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        let status = manager.start_listener().await.expect("router should start");

        assert!(status.running);
        let base_url = status
            .base_url
            .expect("running router should expose base URL");
        assert!(base_url.starts_with("http://127.0.0.1:"), "{base_url}");
        assert!(!base_url.ends_with(":0"), "OS must assign a non-zero port");

        let health = reqwest::Client::new()
            .get(format!("{base_url}/health"))
            .send()
            .await
            .expect("health request should connect");
        assert_eq!(health.status(), reqwest::StatusCode::OK);

        manager.stop_listener().await.expect("router should stop");
    }

    #[tokio::test]
    async fn unsupported_routes_are_rejected_by_listener_surface() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        let status = manager.start_listener().await.expect("router should start");
        let base_url = status.base_url.expect("base URL");
        let client = reqwest::Client::new();

        let unknown = client
            .get(format!("{base_url}/v1/chat/completions"))
            .send()
            .await
            .expect("request should reach local router");
        assert_eq!(unknown.status(), reqwest::StatusCode::NOT_FOUND);

        let wrong_method = client
            .get(format!("{base_url}/responses"))
            .send()
            .await
            .expect("request should reach local router");
        assert_eq!(
            wrong_method.status(),
            reqwest::StatusCode::METHOD_NOT_ALLOWED
        );

        manager.stop_listener().await.expect("router should stop");
    }
}

// QUOTASHIFT_CODEX_ROUTER_TASK3_FORWARDING_TESTS
#[cfg(test)]
mod forwarding_tests {
    use super::*;
    use axum::{body::to_bytes, extract::State};
    use std::sync::Arc;

    #[derive(Clone, Debug)]
    struct CapturedRequest {
        method: String,
        path: String,
        query: Option<String>,
        authorization: Option<String>,
        account_id: Option<String>,
        content_type: Option<String>,
        accept: Option<String>,
        body: Vec<u8>,
    }

    #[derive(Clone, Default)]
    struct CaptureState {
        requests: Arc<AsyncMutex<Vec<CapturedRequest>>>,
    }

    async fn capture_upstream(State(state): State<CaptureState>, request: Request) -> Response {
        let (parts, body) = request.into_parts();
        let body = to_bytes(body, 1024 * 1024).await.expect("capture body");
        let authorization = parts
            .headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let account_id = parts
            .headers
            .get("chatgpt-account-id")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let content_type = parts
            .headers
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let accept = parts
            .headers
            .get("accept")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);

        state.requests.lock().await.push(CapturedRequest {
            method: parts.method.to_string(),
            path: parts.uri.path().to_string(),
            query: parts.uri.query().map(str::to_string),
            authorization: authorization.clone(),
            account_id,
            content_type,
            accept,
            body: body.to_vec(),
        });

        match authorization.as_deref() {
            Some("Bearer token-a") => (
                StatusCode::TOO_MANY_REQUESTS,
                [("content-type", "application/json")],
                r#"{"error":{"code":"rate_limit_exceeded"}}"#,
            )
                .into_response(),
            Some("Bearer token-modelbad") => (
                StatusCode::NOT_FOUND,
                [("content-type", "application/json")],
                r#"{"error":{"code":"model_not_found"}}"#,
            )
                .into_response(),
            _ => (
                StatusCode::CREATED,
                [
                    ("content-type", "application/json"),
                    ("x-router-test", "ok"),
                ],
                r#"{"ok":true}"#,
            )
                .into_response(),
        }
    }

    async fn start_mock_upstream() -> (String, CaptureState, oneshot::Sender<()>, JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("bind mock upstream");
        let address = listener.local_addr().expect("mock address");
        let state = CaptureState::default();
        let app = Router::new()
            .fallback(capture_upstream)
            .with_state(state.clone());
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let task = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });
        (format!("http://{address}"), state, shutdown_tx, task)
    }

    fn oauth(id: &str, token: &str, score: f64) -> CodexRouterAccount {
        CodexRouterAccount {
            id: id.to_string(),
            auth: CodexRouterAuth::OAuth {
                access_token: token.to_string(),
                refresh_token: None,
                chatgpt_account_id: format!("chatgpt-{id}"),
            },
            available_model_ids: Some(vec!["gpt-test".to_string()]),
            quota_windows: vec![RouterQuotaWindow {
                remaining_percent: score,
                duration_minutes: Some(300.0),
            }],
            usage_fetched_at: Some(10),
            model_catalog_fetched_at: None,
        }
    }

    fn api_key(id: &str, key: &str) -> CodexRouterAccount {
        CodexRouterAccount {
            id: id.to_string(),
            auth: CodexRouterAuth::ApiKey {
                api_key: key.to_string(),
            },
            available_model_ids: None,
            quota_windows: vec![],
            usage_fetched_at: None,
            model_catalog_fetched_at: None,
        }
    }

    fn router_config(
        accounts: Vec<CodexRouterAccount>,
        pools: Vec<CodexRouterPool>,
        applied: Option<&str>,
    ) -> CodexRouterConfig {
        CodexRouterConfig {
            accounts,
            pools,
            applied_account_id: applied.map(str::to_string),
        }
    }

    #[test]
    fn response_model_extraction_is_top_level_only_and_keeps_original_bytes_separate() {
        let body = Bytes::from_static(br#"{"model":"gpt-test","input":"PRIVATE-PROMPT"}"#);
        assert_eq!(extract_requested_model(&body).as_deref(), Some("gpt-test"));

        let nested = Bytes::from_static(br#"{"input":{"model":"nested"}}"#);
        assert_eq!(extract_requested_model(&nested), None);
        assert!(std::str::from_utf8(&body)
            .unwrap()
            .contains("PRIVATE-PROMPT"));
    }

    #[tokio::test]
    async fn oauth_forwarding_preserves_request_shape_and_replaces_incoming_credentials() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![oauth("oauth", "oauth-secret", 80.0)],
                vec![],
                Some("oauth"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let private_body = r#"{"model":"gpt-test","input":"PRIVATE-PROMPT"}"#;

        let response = reqwest::Client::new()
            .post(format!("{base}/responses?trace=1"))
            .header("authorization", "Bearer incoming-secret")
            .header("chatgpt-account-id", "incoming-account")
            .header("content-type", "application/json")
            .header("accept", "text/event-stream")
            .body(private_body)
            .send()
            .await
            .expect("forwarded response");
        assert_eq!(response.status(), reqwest::StatusCode::CREATED);
        assert_eq!(response.headers().get("x-router-test").unwrap(), "ok");

        let requests = capture.requests.lock().await;
        assert_eq!(requests.len(), 1);
        let request = &requests[0];
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/responses");
        assert_eq!(request.query.as_deref(), Some("trace=1"));
        assert_eq!(
            request.authorization.as_deref(),
            Some("Bearer oauth-secret")
        );
        assert_eq!(request.account_id.as_deref(), Some("chatgpt-oauth"));
        assert_eq!(request.content_type.as_deref(), Some("application/json"));
        assert_eq!(request.accept.as_deref(), Some("text/event-stream"));
        assert_eq!(request.body, private_body.as_bytes());
        drop(requests);

        let diagnostic = router_diagnostic("oauth", Some("gpt-test"), 201, "forwarded");
        assert!(diagnostic.contains("oauth"));
        assert!(diagnostic.contains("gpt-test"));
        assert!(!diagnostic.contains("oauth-secret"));
        assert!(!diagnostic.contains("PRIVATE-PROMPT"));

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn api_key_models_request_injects_only_api_key_auth() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![api_key("api", "sk-test-secret")],
                vec![],
                Some("api"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");

        let response = reqwest::Client::new()
            .get(format!("{base}/v1/models?limit=2"))
            .header("authorization", "Bearer incoming-secret")
            .header("chatgpt-account-id", "incoming-account")
            .send()
            .await
            .expect("forwarded response");
        assert_eq!(response.status(), reqwest::StatusCode::CREATED);

        let requests = capture.requests.lock().await;
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].path, "/models");
        assert_eq!(requests[0].query.as_deref(), Some("limit=2"));
        assert_eq!(
            requests[0].authorization.as_deref(),
            Some("Bearer sk-test-secret")
        );
        assert_eq!(requests[0].account_id, None);
        drop(requests);

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn quota_failure_retries_next_eligible_member_before_downstream_commit() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![oauth("a", "token-a", 90.0), oauth("b", "token-b", 80.0)],
                vec![CodexRouterPool {
                    id: "pool".to_string(),
                    model: "gpt-test".to_string(),
                    account_ids: vec!["a".to_string(), "b".to_string()],
                    model_selection_mode: "discovered".to_string(),
                    activated_at: 10,
                }],
                Some("a"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");

        let response = reqwest::Client::new()
            .post(format!("{base}/responses"))
            .header("content-type", "application/json")
            .body(r#"{"model":"gpt-test","input":"hello"}"#)
            .send()
            .await
            .expect("router response");
        assert_eq!(response.status(), reqwest::StatusCode::CREATED);

        let requests = capture.requests.lock().await;
        let auth: Vec<_> = requests
            .iter()
            .map(|request| request.authorization.clone().unwrap_or_default())
            .collect();
        assert_eq!(auth, vec!["Bearer token-a", "Bearer token-b"]);
        drop(requests);

        let status = manager.status().await;
        assert_eq!(status.last_routed_account_id.as_deref(), Some("b"));
        assert_eq!(status.last_routed_model.as_deref(), Some("gpt-test"));
        assert_eq!(status.routed_request_count, 1);

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }

    #[tokio::test]
    async fn definitive_model_failure_marks_manual_candidate_incompatible() {
        let (upstream, capture, shutdown, upstream_task) = start_mock_upstream().await;
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager
            .configure(router_config(
                vec![
                    oauth("bad", "token-modelbad", 95.0),
                    oauth("good", "token-good", 70.0),
                ],
                vec![CodexRouterPool {
                    id: "manual".to_string(),
                    model: "gpt-test".to_string(),
                    account_ids: vec!["bad".to_string(), "good".to_string()],
                    model_selection_mode: "manual".to_string(),
                    activated_at: 10,
                }],
                Some("bad"),
            ))
            .await;
        let status = manager.start_listener().await.expect("start router");
        let base = status.base_url.expect("router URL");
        let client = reqwest::Client::new();

        for _ in 0..2 {
            let response = client
                .post(format!("{base}/responses"))
                .header("content-type", "application/json")
                .body(r#"{"model":"gpt-test","input":"hello"}"#)
                .send()
                .await
                .expect("router response");
            assert_eq!(response.status(), reqwest::StatusCode::CREATED);
        }

        let requests = capture.requests.lock().await;
        let auth: Vec<_> = requests
            .iter()
            .map(|request| request.authorization.clone().unwrap_or_default())
            .collect();
        assert_eq!(
            auth,
            vec![
                "Bearer token-modelbad",
                "Bearer token-good",
                "Bearer token-good",
            ]
        );
        drop(requests);

        manager.stop_listener().await.expect("stop router");
        let _ = shutdown.send(());
        let _ = upstream_task.await;
    }
}

// QUOTASHIFT_CODEX_ROUTER_TASK7_COVERAGE_TESTS
#[cfg(test)]
mod client_coverage_tests {
    use super::*;

    #[tokio::test]
    async fn status_reports_only_configured_shared_provider_coverage() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        let status = manager.status().await;

        assert_eq!(status.client_coverage.len(), 1);
        assert_eq!(
            status
                .client_coverage
                .get("sharedProvider")
                .map(String::as_str),
            Some("configured")
        );
    }
}

// QUOTASHIFT_CODEX_ROUTER_REVIEW_RUNTIME_TESTS
#[cfg(test)]
mod router_review_runtime_tests {
    use super::*;
    use std::convert::Infallible;

    fn review_config(mode: &str, catalog_fetched_at: i64) -> CodexRouterConfig {
        serde_json::from_value(serde_json::json!({
            "accounts": [{
                "id": "a",
                "auth": {
                    "kind": "oAuth",
                    "accessToken": "token-a",
                    "refreshToken": null,
                    "chatgptAccountId": "chatgpt-a"
                },
                "availableModelIds": ["gpt-review"],
                "quotaWindows": [{"remainingPercent": 80.0, "durationMinutes": 300.0}],
                "usageFetchedAt": 10,
                "modelCatalogFetchedAt": catalog_fetched_at
            }],
            "pools": [{
                "id": "pool",
                "model": "gpt-review",
                "accountIds": ["a"],
                "modelSelectionMode": mode,
                "activatedAt": 10
            }],
            "appliedAccountId": "a"
        }))
        .unwrap()
    }

    #[test]
    fn frontend_camel_case_auth_payload_deserializes() {
        let parsed = serde_json::from_value::<CodexRouterConfig>(serde_json::json!({
            "accounts": [{
                "id": "a",
                "auth": {
                    "kind": "oAuth",
                    "accessToken": "token-a",
                    "refreshToken": null,
                    "chatgptAccountId": "chatgpt-a"
                },
                "availableModelIds": null,
                "quotaWindows": [],
                "usageFetchedAt": null
            }],
            "pools": [],
            "appliedAccountId": "a"
        }));
        assert!(
            parsed.is_ok(),
            "frontend camelCase auth fields must deserialize: {parsed:?}"
        );
    }

    async fn selected(manager: &CodexRouterManager) -> Option<String> {
        let config = manager.config.lock().await.clone().unwrap();
        manager
            .selection_state
            .lock()
            .await
            .select_account_for_model(&config, "gpt-review")
    }

    #[tokio::test]
    async fn successful_catalog_rescan_clears_model_incompatibility() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        manager.configure(review_config("manual", 100)).await;
        manager
            .selection_state
            .lock()
            .await
            .mark_model_incompatible("a", "gpt-review");
        assert_eq!(selected(&manager).await, None);

        manager.configure(review_config("manual", 200)).await;
        assert_eq!(selected(&manager).await.as_deref(), Some("a"));
    }

    #[tokio::test]
    async fn explicit_pool_routing_edit_clears_model_incompatibility() {
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams::default());
        manager.configure(review_config("manual", 100)).await;
        manager
            .selection_state
            .lock()
            .await
            .mark_model_incompatible("a", "gpt-review");
        assert_eq!(selected(&manager).await, None);

        manager.configure(review_config("discovered", 100)).await;
        assert_eq!(selected(&manager).await.as_deref(), Some("a"));
    }

    async fn slow_stream_upstream() -> Response {
        let stream = futures_util::stream::unfold(0u8, |state| async move {
            match state {
                0 => Some((Ok::<Bytes, Infallible>(Bytes::from_static(b"first")), 1)),
                1 => {
                    tokio::time::sleep(Duration::from_millis(350)).await;
                    Some((Ok::<Bytes, Infallible>(Bytes::from_static(b"second")), 2))
                }
                _ => None,
            }
        });
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "application/octet-stream")
            .body(Body::from_stream(stream))
            .unwrap()
    }

    #[tokio::test]
    async fn in_flight_count_lives_until_stream_body_finishes() {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let app = Router::new().fallback(slow_stream_upstream);
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let upstream_task = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        let upstream = format!("http://{address}");
        let manager = CodexRouterManager::with_upstreams(RouterUpstreams {
            oauth_base: upstream.clone(),
            api_base: upstream,
        });
        manager.configure(review_config("manual", 100)).await;
        let status = manager.start_listener().await.unwrap();
        let base = status.base_url.unwrap();

        let response = reqwest::Client::new()
            .post(format!("{base}/responses"))
            .header("content-type", "application/json")
            .body(r#"{"model":"gpt-review","input":"hello"}"#)
            .send()
            .await
            .unwrap();

        assert_eq!(
            manager.in_flight.load(Ordering::SeqCst),
            1,
            "streaming response must remain in flight after headers"
        );
        let body = response.bytes().await.unwrap();
        assert_eq!(body.as_ref(), b"firstsecond");
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert_eq!(manager.in_flight.load(Ordering::SeqCst), 0);

        manager.stop_listener().await.unwrap();
        let _ = shutdown_tx.send(());
        let _ = upstream_task.await;
    }
}
