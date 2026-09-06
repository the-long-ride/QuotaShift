use std::path::PathBuf;

fn repo_file(path: &str) -> String {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let full_path = manifest.join(path);
    std::fs::read_to_string(&full_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {}", full_path.display(), error))
}

#[test]
fn tray_panel_show_is_guarded_from_immediate_focus_loss() {
    let lib = repo_file("src/lib.rs");

    assert!(
        lib.contains("PANEL_FOCUS_GUARD_MS"),
        "tray panel needs a short activation guard on Windows"
    );
    assert!(
        lib.contains("arm_panel_focus_guard"),
        "every panel show path must arm the activation guard"
    );
    assert!(
        lib.contains("should_hide_panel_on_focus_loss"),
        "focus-loss auto-hide must consult the activation guard"
    );
    assert!(
        lib.contains("if should_hide_panel_on_focus_loss()"),
        "Focused(false) must not unconditionally hide a freshly shown panel"
    );
}

#[test]
fn left_click_does_not_open_native_tray_menu() {
    let lib = repo_file("src/lib.rs");

    assert!(
        lib.contains(".show_menu_on_left_click(false)"),
        "left-click must be reserved for the quota panel; the native tray menu should remain right-click only"
    );
}
