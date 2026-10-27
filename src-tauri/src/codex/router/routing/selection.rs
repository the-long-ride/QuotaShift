use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

pub(crate) use super::candidate_ranking::bottleneck_score;
use super::candidate_ranking::{rank_and_filter_candidates, RankedCandidate};
use super::types::{
    CodexRouterAccount, CodexRouterConfig, CodexRouterPool, RetryableFailure, RouterAppState,
};

#[derive(Default)]
pub struct RouterRuntimeState {
    round_robin_cursor: HashMap<String, usize>,
    pub backoff_until: HashMap<(String, String), Instant>,
    pub model_incompatible: HashSet<(String, String)>,
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

    pub(crate) fn is_account_blocked(&mut self, account_id: &str, model: &str) -> bool {
        self.is_backed_off(account_id, model, Instant::now())
            || self
                .model_incompatible
                .contains(&(account_id.to_string(), model.to_string()))
    }

    fn matching_pool<'a>(
        &self,
        config: &'a CodexRouterConfig,
        requested_model: &str,
    ) -> Option<&'a CodexRouterPool> {
        let active_pool_id = config.active_pool_id.as_deref()?;
        config
            .pools
            .iter()
            .find(|pool| pool.id == active_pool_id && pool.model == requested_model)
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

                if self.is_backed_off(account_id, requested_model, now) {
                    return None;
                }

                if self
                    .model_incompatible
                    .contains(&(account_id.clone(), requested_model.to_string()))
                {
                    return None;
                }

                if strict
                    && !account
                        .available_model_ids
                        .as_ref()
                        .map(|models| models.iter().any(|model| model == requested_model))
                        .unwrap_or(false)
                {
                    return None;
                }

                Some(RankedCandidate {
                    id: account.id.clone(),
                    score: bottleneck_score(account),
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

    fn choose_ranked_candidate_by_key(
        &mut self,
        cursor_id: &str,
        model: &str,
        mut candidates: Vec<RankedCandidate>,
    ) -> Option<String> {
        if candidates.is_empty() {
            return None;
        }

        rank_and_filter_candidates(&mut candidates);

        let cursor_key = format!("{}:{}", cursor_id, model);
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
        let pool = self.matching_pool(config, requested_model).cloned()?;
        let candidates = self.eligible_candidates(config, &pool, requested_model);
        self.choose_ranked_candidate_by_key(&pool.id, requested_model, candidates)
    }

    pub(crate) fn select_account_for_route_members(
        &mut self,
        config: &CodexRouterConfig,
        route: &super::route_context::ResolvedRoute,
    ) -> Option<String> {
        let accounts: HashMap<&str, &CodexRouterAccount> = config
            .accounts
            .iter()
            .map(|account| (account.id.as_str(), account))
            .collect();
        let now = Instant::now();
        let strict = route.model_selection_mode == "discovered";

        if route.routing_policy == super::pool_registry::PoolRoutingPolicy::Balanced {
            let candidates: Vec<RankedCandidate> = route
                .member_account_ids
                .iter()
                .filter_map(|account_id| {
                    let account = accounts.get(account_id.as_str()).copied()?;
                    if self.is_backed_off(account_id, &route.upstream_model_id, now) {
                        return None;
                    }
                    if self
                        .model_incompatible
                        .contains(&(account_id.clone(), route.upstream_model_id.clone()))
                    {
                        return None;
                    }
                    if strict
                        && !account
                            .available_model_ids
                            .as_ref()
                            .map(|models| models.iter().any(|m| m == &route.upstream_model_id))
                            .unwrap_or(false)
                    {
                        return None;
                    }
                    Some(RankedCandidate {
                        id: account.id.clone(),
                        score: bottleneck_score(account),
                        completeness: account
                            .quota_windows
                            .iter()
                            .filter(|w| w.remaining_percent.is_finite())
                            .count(),
                        freshness: account.usage_fetched_at.unwrap_or(i64::MIN),
                    })
                })
                .collect();

            return self.choose_ranked_candidate_by_key(
                &route.pool_id,
                &route.upstream_model_id,
                candidates,
            );
        }

        // Ordered first-to-bottom member selection
        for account_id in &route.member_account_ids {
            let Some(account) = accounts.get(account_id.as_str()).copied() else {
                continue;
            };
            if self.is_backed_off(account_id, &route.upstream_model_id, now) {
                continue;
            }
            if self
                .model_incompatible
                .contains(&(account_id.clone(), route.upstream_model_id.clone()))
            {
                continue;
            }
            if strict
                && !account
                    .available_model_ids
                    .as_ref()
                    .map(|models| models.iter().any(|m| m == &route.upstream_model_id))
                    .unwrap_or(false)
            {
                continue;
            }
            return Some(account.id.clone());
        }

        None
    }
}

pub(crate) fn applied_account(config: &CodexRouterConfig) -> Option<&CodexRouterAccount> {
    let applied_id = config.applied_account_id.as_deref()?;
    config
        .accounts
        .iter()
        .find(|account| account.id == applied_id)
}

pub(crate) async fn select_account_for_route(
    state: &RouterAppState,
    config: &CodexRouterConfig,
    route: &super::route_context::ResolvedRoute,
) -> Option<CodexRouterAccount> {
    let account_id = state
        .selection_state
        .lock()
        .await
        .select_account_for_route_members(config, route)?;
    config
        .accounts
        .iter()
        .find(|account| account.id == account_id)
        .cloned()
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
