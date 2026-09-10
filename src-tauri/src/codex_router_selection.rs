use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use super::types::{
    CodexRouterAccount, CodexRouterConfig, CodexRouterPool, RetryableFailure, RouterAppState,
};

#[derive(Default)]
pub(crate) struct RouterRuntimeState {
    round_robin_cursor: HashMap<String, usize>,
    pub(crate) backoff_until: HashMap<(String, String), Instant>,
    pub(crate) model_incompatible: HashSet<(String, String)>,
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

pub(crate) fn applied_account(config: &CodexRouterConfig) -> Option<&CodexRouterAccount> {
    let applied_id = config.applied_account_id.as_deref()?;
    config
        .accounts
        .iter()
        .find(|account| account.id == applied_id)
}

pub(crate) async fn select_account(
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

pub(crate) async fn mark_retryable_failure(
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
        RetryableFailure::Backoff => runtime.mark_backoff(
            account_id,
            model,
            Duration::from_secs(super::FAILURE_BACKOFF_SECS),
        ),
        RetryableFailure::ModelIncompatible => runtime.mark_model_incompatible(account_id, model),
    }
}
