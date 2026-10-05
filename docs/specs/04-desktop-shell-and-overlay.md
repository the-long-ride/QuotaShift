# 04 — Desktop Shell and Overlay

**Audience:** engineers & AI agents · **Verified against:** `1.1.4` · **Date:** 2026-10-06

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

- The native window is fitted to the measured overlay card (content-sized in both axes) via `resolveMeasuredOverlaySize`. The base sizes below are the fallback until the card is measured, and growth is capped at 2x them.
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
- Claude reset badge: opt-in (Settings > Monitoring > Show Claude reset count, key `quotashift_claude_reset_credits_enabled_v1`, default off). The badge shows only for the tracked non-local Claude account; every real Claude account is queried for the account cards (which always show a non-zero count, like Codex), through the unofficial read-only `/api/oauth/usage?cedar_ember=1` endpoint, at most every 30 minutes; any failure hides the badge.
- Hovering the Claude reset badge shows only the number of resets remaining. Codex's reset tooltip continues to include the nearest expiry when known.

### Screen topology

Overlay coordinates are clamped to current monitor work areas. Display topology changes (disconnect, reconnect, resolution/work-area changes) re-anchor the overlay to a visible primary-screen position when the stored position is no longer valid.

## Display mode

The Overlay settings tab offers three display modes: **None**, **Overlay** and **Taskbar** (`src/utils/common/display-mode.ts`, key `quotashift_display_mode_v1`). The legacy `quotashift_overlay_enabled` flag is migrated (`"false"` becomes None) and kept in sync. The quick toggle (header button / global shortcut) cycles None → Overlay → Taskbar → None, skipping Taskbar where it is unsupported. Taskbar is Windows-only for now; other platforms show it disabled and fall back to Overlay. The frontend calls `set_display_mode`, which shows exactly one of the `overlay` / `taskbar` windows.

### Taskbar strip

`src-tauri/src/window/taskbar_dock.rs` docks the `taskbar` window (`index.html?window=taskbar`) inside `Shell_TrayWnd`, inset 2px and ending just left of `TrayNotifyWnd`; vertical taskbars stack it above the tray. A watcher re-places it every 750ms (covers Explorer restarts and DPI or taskbar moves), re-asserts topmost, and hides it while the taskbar auto-hides or a non-shell window is fullscreen. The strip reports its natural content width (`scrollWidth`; the strip never flex-shrinks) through `set_taskbar_content_size`, so every tracked account fits. The strip and its hover card always use the glass look (dark translucent pills with a specular edge), independent of the overlay theme and the app light/dark theme. `TaskbarApp` renders one compact item per tracked account: the account avatar (initial on a provider colour when there is no image or it fails to load; Claude logo for Claude) with the overlay's tier, reset and provider badges, and at most two text lines with low values tinted: `5H` and `WK` (or a single `MO`) for Codex and Claude, and for Antigravity a Gemini line and a Claude/OpenAI line formatted `5H%/WK%`. Item side padding exceeds the 4px badge overhang, the root is start-aligned with the strip pushed right by `margin-left: auto` (overflow spills right, never left), and Rust rounds the reported width up, so nothing is clipped. Hover publishes `details` (`TaskbarTooltipDetails`) to the `overlay-tooltip` window, which renders a multi-line hover card (name, email, platform, tier, reset count, then every family or window with a meter), measures it, sizes the window to fit and centres it above the item; double-click opens the dashboard on that account's provider tab.

### Multiple tracked accounts

One experimental switch, "Track multiple accounts" (`quotashift_multi_track_v2`, migrated from the v1 per-provider switches), enables tracking several accounts. With it on, double-clicking an account card in any tab adds or removes it from one ordered list shared by all providers (`quotashift_overlay_tracked_v2` of `{provider, id}` entries, min 1, max 3; migrated from the v1 per-provider lists). Turning it off keeps only the primary account. The payload keeps the primary card at the top level and carries the others, from any provider, in `additionalAccounts`, so tray and tooltip consumers stay unchanged. The overlay stacks the cards vertically, and the sizing bridge measures `.overlay-cards` with a height cap that scales with the card count. Interval polling refreshes every tracked Antigravity/Codex account; Claude accounts keep their own monitor.

Double-clicking an overlay card, or choosing "Open dashboard" from its menu, calls `show_dashboard` with that card's provider as `tab` (read from the card slot's `data-overlay-card-provider`). Rust validates it (`dashboard_tab`) and emits it as the `window-shown` payload, which the dashboard prefers over the tracked-provider default. "Restart running app on switch" is also marked experimental.

**Next →** [05 — Claude Guardrails and Process Lifecycle](05-claude-guardrails-and-process-lifecycle.md)
