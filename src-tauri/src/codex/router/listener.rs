use std::collections::HashSet;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex as AsyncMutex, Notify};

use super::selection::RouterRuntimeState;
use super::types::CodexRouterConfig;

pub async fn wait_for_health(client: &reqwest::Client, health_url: &str) -> bool {
    for _ in 0..20 {
        if let Ok(response) = client.get(health_url).send().await {
            if response.status() == reqwest::StatusCode::OK {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    false
}

pub async fn drain_in_flight(
    in_flight: &Arc<AtomicU64>,
    in_flight_notify: &Arc<Notify>,
    max_duration: Duration,
) {
    let deadline = Instant::now() + max_duration;
    while in_flight.load(Ordering::SeqCst) > 0 {
        let now = Instant::now();
        if now >= deadline {
            break;
        }
        let remaining = deadline.saturating_duration_since(now);
        let _ = tokio::time::timeout(remaining, in_flight_notify.notified()).await;
    }
}

pub async fn reconcile_model_incompatibilities(
    selection_state: &Arc<AsyncMutex<RouterRuntimeState>>,
    previous: &CodexRouterConfig,
    config: &CodexRouterConfig,
) {
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

    let routing_fingerprint = |snapshot: &CodexRouterConfig, account_id: &str, model: &str| {
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

    selection_state
        .lock()
        .await
        .model_incompatible
        .retain(|(account_id, model)| {
            !refreshed_accounts.contains(account_id)
                && routing_fingerprint(previous, account_id, model)
                    == routing_fingerprint(config, account_id, model)
        });
}
