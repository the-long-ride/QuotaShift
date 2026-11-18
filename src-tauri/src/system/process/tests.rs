use super::*;
use std::time::Instant;

#[test]
fn scan_process_records_returns_current_process_and_measures_latency() {
    let current_pid = std::process::id();
    let mut samples_ms = Vec::new();
    let mut found_self = false;

    for _ in 0..3 {
        let start = Instant::now();
        let records = scan_process_records();
        let _ag = scan_processes();
        samples_ms.push(start.elapsed().as_secs_f64() * 1000.0);
        if records
            .iter()
            .any(|r| r.pid == current_pid && !r.name.is_empty())
        {
            found_self = true;
        }
    }
    samples_ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_ms = samples_ms[samples_ms.len() / 2];
    println!(
        "process_scan_median_ms={:.2} samples={:?}",
        median_ms, samples_ms
    );

    assert!(
        found_self,
        "scan_process_records must include current test PID {current_pid}"
    );
}
