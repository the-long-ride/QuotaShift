use super::*;
use crate::cli_pools::types::QuotaWindowKind;

fn sample(
    account_id: &str,
    window: QuotaWindowKind,
    used: Option<f64>,
    remaining: Option<f64>,
    reset_at: Option<u64>,
    sampled_at: u64,
) -> WindowSample {
    WindowSample {
        account_id: account_id.to_string(),
        window,
        used_percent: used,
        remaining_percent: remaining,
        reset_at,
        sampled_at,
        explicit_quota_exhausted: false,
        is_transient_error: false,
    }
}

#[test]
fn test_5h_used_100_percent_confirmed_after_2_samples() {
    let now = 1000;
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        980,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        990,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Exhausted);
    assert_eq!(evidence.triggered_window, Some(QuotaWindowKind::FiveHour));
    assert_eq!(evidence.reset_epoch, Some(2000));
}

#[test]
fn test_weekly_used_100_percent_confirmed_after_2_samples() {
    let now = 1000;
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::Weekly,
        Some(100.0),
        None,
        Some(5000),
        980,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::Weekly,
        Some(100.0),
        None,
        Some(5000),
        990,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::Weekly],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Exhausted);
    assert_eq!(evidence.triggered_window, Some(QuotaWindowKind::Weekly));
}

#[test]
fn test_monthly_used_100_percent_confirmed_after_2_samples() {
    let now = 1000;
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::Monthly,
        Some(100.0),
        None,
        Some(10000),
        980,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::Monthly,
        Some(100.0),
        None,
        Some(10000),
        990,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::Monthly],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Exhausted);
    assert_eq!(evidence.triggered_window, Some(QuotaWindowKind::Monthly));
}

#[test]
fn test_99_99_percent_is_not_exhausted() {
    let now = 1000;
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(99.99),
        Some(0.01),
        Some(2000),
        980,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(99.99),
        Some(0.01),
        Some(2000),
        990,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Available);
}

#[test]
fn test_missing_or_nan_percent_is_unknown() {
    let now = 1000;
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(f64::NAN),
        None,
        Some(2000),
        980,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        None,
        None,
        Some(2000),
        990,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Unknown);
}

#[test]
fn test_expired_sample_is_unknown() {
    let now = 1000;
    // Sample is 200s old (TTL is 120s)
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        750,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        790,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Unknown);
}

#[test]
fn test_single_sample_is_unknown_until_second_sample_arrives() {
    let now = 1000;
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        995,
    );
    let evidence =
        evaluate_exhaustion("acc-1", &[QuotaWindowKind::FiveHour], &[s1], now, 120, 5, 2);
    assert_eq!(evidence.status, QuotaStatus::Unknown);
}

#[test]
fn test_samples_too_close_together_under_5s_remain_unknown() {
    let now = 1000;
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        990,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        992,
    ); // only 2s apart
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Unknown);
}

#[test]
fn test_reset_already_passed_is_not_exhausted() {
    let now = 2500;
    // reset_at was 2000, now is 2500
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        2480,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        2490,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_ne!(evidence.status, QuotaStatus::Exhausted);
}

#[test]
fn test_transient_429_is_not_quota_exhaustion() {
    let now = 1000;
    let mut s1 = sample("acc-1", QuotaWindowKind::FiveHour, None, None, None, 980);
    s1.is_transient_error = true;
    let mut s2 = sample("acc-1", QuotaWindowKind::FiveHour, None, None, None, 990);
    s2.is_transient_error = true;
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Unknown);
}

#[test]
fn test_explicit_authoritative_quota_error_confirms_immediately() {
    let now = 1000;
    let mut s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        None,
        None,
        Some(3000),
        990,
    );
    s1.explicit_quota_exhausted = true;
    let evidence =
        evaluate_exhaustion("acc-1", &[QuotaWindowKind::FiveHour], &[s1], now, 120, 5, 2);
    assert_eq!(evidence.status, QuotaStatus::Exhausted);
    assert_eq!(evidence.triggered_window, Some(QuotaWindowKind::FiveHour));
    assert_eq!(evidence.reset_epoch, Some(3000));
}

#[test]
fn test_mismatched_account_id_is_rejected() {
    let now = 1000;
    let s1 = sample(
        "acc-other",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        980,
    );
    let s2 = sample(
        "acc-other",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        990,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::FiveHour],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Unknown);
}

#[test]
fn test_unconfigured_window_does_not_trigger() {
    let now = 1000;
    // 5h is exhausted, but only Weekly is in trigger_windows
    let s1 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        980,
    );
    let s2 = sample(
        "acc-1",
        QuotaWindowKind::FiveHour,
        Some(100.0),
        Some(0.0),
        Some(2000),
        990,
    );
    let evidence = evaluate_exhaustion(
        "acc-1",
        &[QuotaWindowKind::Weekly],
        &[s1, s2],
        now,
        120,
        5,
        2,
    );
    assert_eq!(evidence.status, QuotaStatus::Unknown);
}

#[test]
fn test_deduplicator_prevents_duplicate_triggers_for_same_epoch() {
    let mut dedup = QuotaDeduplicator::new();
    let key = ConfirmedQuotaKey {
        account_id: "acc-1".to_string(),
        window: QuotaWindowKind::FiveHour,
        reset_epoch: Some(2000),
    };
    assert!(dedup.record_and_check(key.clone()));
    assert!(!dedup.record_and_check(key));
}

#[test]
fn test_deduplicator_prunes_past_epochs() {
    let mut dedup = QuotaDeduplicator::new();
    let key = ConfirmedQuotaKey {
        account_id: "acc-1".to_string(),
        window: QuotaWindowKind::FiveHour,
        reset_epoch: Some(2000),
    };
    assert!(dedup.record_and_check(key.clone()));
    dedup.prune(2500); // 2500 > 2000 -> pruned!
    assert!(dedup.record_and_check(key));
}

#[test]
fn test_new_available_sample_invalidates_old_exhaustion() {
    let samples = [
        sample(
            "acc",
            QuotaWindowKind::FiveHour,
            Some(100.0),
            None,
            Some(2000),
            980,
        ),
        sample(
            "acc",
            QuotaWindowKind::FiveHour,
            Some(100.0),
            None,
            Some(2000),
            990,
        ),
        sample(
            "acc",
            QuotaWindowKind::FiveHour,
            Some(20.0),
            None,
            Some(2000),
            995,
        ),
    ];
    assert_eq!(
        evaluate_exhaustion(
            "acc",
            &[QuotaWindowKind::FiveHour],
            &samples,
            1000,
            120,
            5,
            2
        )
        .status,
        QuotaStatus::Available
    );
}

#[test]
fn test_samples_must_be_consecutive_and_from_one_reset_epoch() {
    for middle_used in [None, Some(20.0)] {
        let samples = [
            sample(
                "acc",
                QuotaWindowKind::FiveHour,
                Some(100.0),
                None,
                Some(2000),
                980,
            ),
            sample(
                "acc",
                QuotaWindowKind::FiveHour,
                middle_used,
                None,
                Some(2000),
                985,
            ),
            sample(
                "acc",
                QuotaWindowKind::FiveHour,
                Some(100.0),
                None,
                Some(2000),
                990,
            ),
        ];
        assert_eq!(
            evaluate_exhaustion(
                "acc",
                &[QuotaWindowKind::FiveHour],
                &samples,
                1000,
                120,
                5,
                2
            )
            .status,
            QuotaStatus::Unknown
        );
    }
    let samples = [
        sample(
            "acc",
            QuotaWindowKind::FiveHour,
            Some(100.0),
            None,
            Some(2000),
            980,
        ),
        sample(
            "acc",
            QuotaWindowKind::FiveHour,
            Some(100.0),
            None,
            Some(3000),
            990,
        ),
    ];
    assert_eq!(
        evaluate_exhaustion(
            "acc",
            &[QuotaWindowKind::FiveHour],
            &samples,
            1000,
            120,
            5,
            2
        )
        .status,
        QuotaStatus::Unknown
    );
}

#[test]
fn test_invalid_or_conflicting_percentages_do_not_trigger_rotation() {
    for (used, remaining) in [(101.0, 0.0), (100.0, -1.0), (f64::NAN, 0.0), (100.0, 50.0)] {
        let samples = [980, 990].map(|at| {
            sample(
                "acc",
                QuotaWindowKind::FiveHour,
                Some(used),
                Some(remaining),
                Some(2000),
                at,
            )
        });
        assert_eq!(
            evaluate_exhaustion(
                "acc",
                &[QuotaWindowKind::FiveHour],
                &samples,
                1000,
                120,
                5,
                2
            )
            .status,
            QuotaStatus::Unknown
        );
    }
}
