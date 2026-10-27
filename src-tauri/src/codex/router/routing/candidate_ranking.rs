use super::types::CodexRouterAccount;

#[derive(Clone, Debug)]
pub struct RankedCandidate {
    pub id: String,
    pub score: Option<f64>,
    pub completeness: usize,
    pub freshness: i64,
}

pub fn bottleneck_score(account: &CodexRouterAccount) -> Option<f64> {
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

pub fn rank_and_filter_candidates(candidates: &mut Vec<RankedCandidate>) {
    if candidates.is_empty() {
        return;
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
}
