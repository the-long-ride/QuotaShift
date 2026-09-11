use super::*;

#[test]
fn account_ids_cannot_escape_worker_root() {
    assert_eq!(sanitize_account_id("../A B"), "___A_B");
    let path = worker_profile_dir("../A B").unwrap();
    assert!(path.to_string_lossy().contains("antigravity-workers"));
    assert!(!path.to_string_lossy().contains("../"));
}
