use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tokio::sync::{broadcast, Mutex};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthTransport {
    Siwc { access_token: String },
    OpenAiApiKey { api_key: String },
}

impl AuthTransport {
    pub fn billing_domain(&self) -> &'static str {
        match self {
            Self::Siwc { .. } => "chatgpt_subscription",
            Self::OpenAiApiKey { .. } => "api_metered_billing",
        }
    }

    pub fn auth_header_value(&self) -> String {
        match self {
            Self::Siwc { access_token } => format!("Bearer {}", access_token),
            Self::OpenAiApiKey { api_key } => format!("Bearer {}", api_key),
        }
    }

    pub fn is_siwc(&self) -> bool {
        matches!(self, Self::Siwc { .. })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SseStreamOutcome {
    Completed,
    Failed(String),
    Incomplete(String),
    Truncated,
}

pub fn process_sse_stream(events: &[String]) -> SseStreamOutcome {
    for event_str in events {
        let lines: Vec<&str> = event_str.lines().map(|l| l.trim()).collect();
        let mut event_type = None;
        let mut data_payload = None;

        for line in lines {
            if let Some(ev) = line.strip_prefix("event:") {
                event_type = Some(ev.trim());
            } else if let Some(dt) = line.strip_prefix("data:") {
                data_payload = Some(dt.trim());
            }
        }

        match event_type {
            Some("response.completed") => {
                let Some(payload) = data_payload else {
                    return SseStreamOutcome::Truncated;
                };
                let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) else {
                    return SseStreamOutcome::Truncated;
                };
                if json["type"] == "response.completed" && json["response"]["status"] == "completed"
                {
                    return SseStreamOutcome::Completed;
                }
                return SseStreamOutcome::Truncated;
            }
            Some("response.failed") => {
                let err = data_payload.unwrap_or("response.failed");
                return SseStreamOutcome::Failed(err.to_string());
            }
            Some("response.incomplete") => {
                let reason = data_payload.unwrap_or("response.incomplete");
                return SseStreamOutcome::Incomplete(reason.to_string());
            }
            _ => (),
        }
    }
    SseStreamOutcome::Truncated
}

#[derive(Debug, Default)]
pub struct StreamCommitTracker {
    committed: bool,
    cancelled: AtomicBool,
}

impl StreamCommitTracker {
    pub fn new() -> Self {
        Self {
            committed: false,
            cancelled: AtomicBool::new(false),
        }
    }

    pub fn mark_downstream_committed(&mut self) {
        self.committed = true;
    }

    pub fn can_failover(&self) -> bool {
        !self.committed
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

pub struct RefreshGate {
    execution_count: AtomicUsize,
    is_running: Mutex<Option<broadcast::Sender<Result<String, String>>>>,
}

impl Default for RefreshGate {
    fn default() -> Self {
        Self::new()
    }
}

impl RefreshGate {
    pub fn new() -> Self {
        Self {
            execution_count: AtomicUsize::new(0),
            is_running: Mutex::new(None),
        }
    }

    pub fn execution_count(&self) -> usize {
        self.execution_count.load(Ordering::SeqCst)
    }

    pub async fn execute_refresh<F, Fut>(&self, refresh_fn: F) -> Result<String, String>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<String, String>>,
    {
        let mut rx = {
            let mut guard = self.is_running.lock().await;
            if let Some(ref tx) = *guard {
                tx.subscribe()
            } else {
                let (tx, _rx) = broadcast::channel(1);
                *guard = Some(tx.clone());
                drop(guard);

                self.execution_count.fetch_add(1, Ordering::SeqCst);
                let result = refresh_fn().await;

                let mut guard = self.is_running.lock().await;
                *guard = None;
                let _ = tx.send(result.clone());
                return result;
            }
        };

        rx.recv().await.map_err(|e| e.to_string())?
    }
}
