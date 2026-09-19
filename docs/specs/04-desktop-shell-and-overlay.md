# 04 — Desktop Shell and Overlay

**Audience:** engineers & AI agents · **Scope:** window management, UI zoom, and the HUD overlay · **Verified against:** `1.1.0`

QuotaShift renders two native operating system windows: the primary Dashboard Shell (`main`) and the floating Desktop Overlay HUD (`overlay`).

## 1. Main Window Desktop Shell

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Logo] QuotaShift   [Search...]   [Quit] [Status] | [ _ ] [ □ ] [ X ]       │ <- WindowControls.tsx
├─────────┬───────────────────────────────────────────────────────────────────┤
│ Sidebar │ Account Cards Grid (1 to 4 responsive columns)                    │
│ Tabs    │                                                                   │
│         │ ┌──────────────────────┐ ┌──────────────────────┐                 │
│         │ │ Card 1               │ │ Card 2               │                 │
│         │ └──────────────────────┘ └──────────────────────┘                 │
└─────────┴───────────────────────────────────────────────────────────────────┘
```

### Window Geometry & Native Controls
- **Borderless Execution**: Configured with `decorations: false`, `minWidth: 912`, `minHeight: 520`, and default bounds `960×700`.
- **Custom Titlebar (`WindowControls.tsx`, `QuitButton.tsx`)**:
  - `Minimize`: Minimizes the main window to the taskbar.
  - `Maximize / Restore`: Toggles maximized window state via native Tauri window APIs.
  - `Titlebar Double-Click`: Double-clicking any draggable non-interactive header region immediately toggles window maximization / restoration.
  - `Close to Tray`: Hides the window from the taskbar into the system notification tray.
  - `Quit Button`: Features a dedicated power icon and opens an interactive confirmation modal (`CustomDialog`) before shutting down the app, ensuring proxy settings and workers are stopped cleanly.
  - `Settings Button`: Features a theme-adaptive gear icon opening the vertical Settings modal.
- **Native 8-Direction Resize Handles (`WindowResizeHandles.tsx`)**:
  - Borderless window edges (`top`, `bottom`, `left`, `right`) and corners (`top-left`, `top-right`, `bottom-left`, `bottom-right`) expose native hit areas that invoke `window.startDragging()` and `window.startResize()` without conflicting with header drag zones.
- **Universal Button Tooltip Contract (`Tooltip.tsx`)**:
  - 100% of interactive `<button>` elements across the dashboard, window header, tabs, and modals must provide a meaningful `data-tooltip` attribute.
  - Buttons must never use the native HTML `title` attribute, ensuring tooltips are handled uniformly through the custom floating `Tooltip` component without native OS popup overlap.

### Native WebView Zoom
- Replaced legacy CSS panel transforms with native Chromium/WebView2 page zoom.
- **Range & Step**: 70% to 190% in 10% increments (1.0 default).
- **Triggers**:
  - `Ctrl + =` or `Ctrl + +`: Zoom In (+10%).
  - `Ctrl + -`: Zoom Out (-10%).
  - `Ctrl + 0`: Reset Zoom (100%).
  - `Ctrl + Mouse Wheel`: Interactive zoom scaling.
- **Persistence**: Persisted to `localStorage` under `main_window_zoom` and restored during DOM hydration.

---

## 2. Desktop Overlay HUD

The desktop overlay (`OverlayApp.tsx`) is a lightweight, floating head-up display providing at-a-glance visibility into the tracked provider account.

```text
┌────────────────────────────────────────────────────────┐
│ [Logo] Provider Tier Badge          Hover for Tooltip  │
│ 5h: [████████████░░░░] 78% (Resets in 1h 12m)          │
│ Wk: [████████████████] 100% (Resets Fri 00:00)         │
└────────────────────────────────────────────────────────┘
```

### Key Capabilities
- **Fixed Base Geometry & Uniform Scale**:
  - Standard base dimensions: `340×80` px.
  - Scaled uniformly via whole-surface UI scale (80% to 200%) configured in Settings.
- **Theme Support**:
  - **Glassmorphism Theme**: Translucent acrylic backdrop filter (`backdrop-filter: blur(16px)`), specular border highlight, no harsh drop-shadows.
  - **Mono Theme**: High-contrast solid dark/light appearance for minimalist setups.
- **Dynamic Sizing Bridge (`OverlayWindowSizingBridge.tsx`)**:
  - Measures rendered account quota density (e.g. single-limit vs dual-limit accounts).
  - Adjusts native window dimensions automatically to prevent text clipping while suppressing redundant native resize IPC calls.
- **Screen Clamping & Multi-Monitor Positioning**:
  - Uses Windows multi-monitor workspace coordinates. Clamps overlay coordinates so the window never floats off-screen or gets trapped behind system taskbars.
  - **Display Disconnect / HDMI Topology Changes**: Automatically detects monitor disconnects or resolution changes; if the current coordinates are no longer visible on any active monitor, the overlay safely re-anchors to the bottom-right corner of the primary display.
- **Right-Click Context Menu**:
  - `Refresh Tracked Account`: Immediately triggers quota poll.
  - `Open Full Dashboard`: Restores and focuses the main application window.
  - `Toggle Theme`: Swaps between Glassmorphism and Mono.
  - `Hide Overlay`: Dismisses the HUD.

**Related:** [`01-system-overview`](01-system-overview.md) · [`06-settings-and-configuration`](06-settings-and-configuration.md)

**Next →** [`05-claude-guardrails-and-process-lifecycle`](05-claude-guardrails-and-process-lifecycle.md)
