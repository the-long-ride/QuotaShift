# 04 — Desktop Shell and Overlay

**Audience:** engineers & AI agents · **Verified against:** `1.1.1` · **Date:** 2026-09-21

## Main dashboard shell

- Borderless Tauri window: default `960×700`, minimum `912×520`.
- Custom title bar supports minimize, maximize/restore, close-to-tray, confirmed quit, Settings, search, update status, and native edge/corner resize handles.
- Double-clicking a non-interactive title-bar region toggles maximize/restore.
- Quit opens a confirmation dialog; it does not terminate immediately.

### Search and shortcut discoverability

- Search is controlled by the application and can be focused by the configured in-app Focus Search shortcut.
- The search placeholder displays the current Focus Search binding.
- Buttons with in-app shortcuts expose the current binding through the shared custom tooltip. Tooltip bindings render as individual keycaps.
- The Settings header theme control retains its state-aware sun/moon icon; the combined light/dark artwork is limited to the Keyboard Shortcuts settings row.

### Native WebView zoom

- Persisted key: `quotashift_main_webview_zoom_v1`.
- Range: 70%–190%, step 10%, default 100%.
- `Ctrl+=` / `Ctrl++` zoom in, `Ctrl+-` zoom out, `Ctrl+0` reset, and Ctrl+wheel adjusts zoom.

## Dialog and modal geometry

All shared `.dialog-overlay` surfaces reserve the native title-bar region:

- Overlay starts at 38px and uses the remaining viewport height.
- Dialog max width is `calc(100vw - 32px)`.
- Dialog max height is `calc(100vh - 62px)`.
- Overflow is contained inside the dialog instead of spilling beyond the window during high zoom.
- Account-style dialogs use internal scrolling where appropriate.
- While a dialog is open, the visible application title bar is raised above it and receives a shadow for visual separation.
- Shared confirmation dialogs capture Escape as cancel/close and Enter as confirm.

## Desktop overlay

QuotaShift uses compact always-on-top overlay windows independent of the dashboard.

### Native base sizes

- Antigravity: 340×80.
- Codex and Claude compact overlays: 220×68.
- Overlay tooltip window default: 340×38.
- Whole-surface scale: 80%–200%, default 100%, stored in `quotashift_ui_adjustment_v1`.
- Themes: `glassmorphism` and `mono`; legacy `black-white` normalizes to `mono`.

### Tracked tray/overlay state

- Only the explicitly monitored provider/account may publish tracked tray usage.
- Tray payloads omit account label/email identity.
- Claude/Codex expose recognized available limit bars such as 5-hour, Weekly, and Monthly where available.
- Antigravity preserves grouped quota rows rather than flattening them into unrelated bars.
- Background polling of other accounts must not overwrite the tracked tray state.

### Screen topology

Overlay coordinates are clamped to current monitor work areas. Display topology changes (disconnect, reconnect, resolution/work-area changes) re-anchor the overlay to a visible primary-screen position when the stored position is no longer valid.

**Next →** [05 — Claude Guardrails and Process Lifecycle](05-claude-guardrails-and-process-lifecycle.md)
