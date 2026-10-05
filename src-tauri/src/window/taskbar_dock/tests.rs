use super::*;

const MONITOR: Rect = Rect {
    left: 0,
    top: 0,
    right: 1920,
    bottom: 1080,
};

fn r(left: i32, top: i32, right: i32, bottom: i32) -> Rect {
    Rect {
        left,
        top,
        right,
        bottom,
    }
}

#[test]
fn detects_each_taskbar_edge() {
    assert_eq!(detect_edge(r(0, 1032, 1920, 1080), MONITOR), Edge::Bottom);
    assert_eq!(detect_edge(r(0, 0, 1920, 48), MONITOR), Edge::Top);
    assert_eq!(detect_edge(r(0, 0, 62, 1080), MONITOR), Edge::Left);
    assert_eq!(detect_edge(r(1858, 0, 1920, 1080), MONITOR), Edge::Right);
}

#[test]
fn bottom_strip_sits_left_of_tray_at_100_percent() {
    let taskbar = r(0, 1032, 1920, 1080);
    let tray = r(1700, 1032, 1920, 1080);
    let rect = compute_strip_rect(Edge::Bottom, taskbar, Some(tray), (200.0, 40.0), 1.0);
    assert_eq!(rect, r(1498, 1034, 1698, 1078));
}

#[test]
fn top_strip_scales_with_dpi() {
    let taskbar = r(0, 0, 2880, 72);
    let tray = r(2500, 0, 2880, 72);
    let rect = compute_strip_rect(Edge::Top, taskbar, Some(tray), (200.0, 40.0), 1.5);
    assert_eq!(rect, r(2197, 3, 2497, 69));
}

#[test]
fn vertical_strips_sit_above_tray() {
    let left = r(0, 0, 62, 1080);
    let rect = compute_strip_rect(
        Edge::Left,
        left,
        Some(r(0, 900, 62, 1080)),
        (58.0, 120.0),
        1.0,
    );
    assert_eq!(rect, r(2, 778, 60, 898));
    let right = r(2787, 0, 2880, 1620);
    let tray = r(2787, 1350, 2880, 1620);
    let rect = compute_strip_rect(Edge::Right, right, Some(tray), (58.0, 120.0), 1.5);
    assert_eq!(rect, r(2790, 1167, 2877, 1347));
}

#[test]
fn missing_tray_anchors_to_taskbar_end_and_stays_clamped() {
    let taskbar = r(0, 1032, 300, 1080);
    let rect = compute_strip_rect(Edge::Bottom, taskbar, None, (100.0, 40.0), 1.0);
    assert_eq!(rect, r(198, 1034, 298, 1078));
    let wide = compute_strip_rect(Edge::Bottom, taskbar, None, (900.0, 40.0), 0.0);
    assert_eq!((wide.left, wide.right), (0, 300));
}

#[test]
fn display_mode_is_normalized() {
    assert_eq!(normalize_display_mode("none"), "none");
    assert_eq!(normalize_display_mode("bogus"), "overlay");
    let expected = if cfg!(target_os = "windows") {
        "taskbar"
    } else {
        "overlay"
    };
    assert_eq!(normalize_display_mode("taskbar"), expected);
}

#[test]
fn content_size_falls_back_and_accepts_valid_values() {
    set_taskbar_content_size(f64::NAN, -1.0);
    let (w, h) = content_size();
    assert!(w > 0.0 && h > 0.0);
    set_taskbar_content_size(210.0, 40.0);
    assert_eq!(content_size(), (210.0, 40.0));
}
