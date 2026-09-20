# Changelog

All notable changes to this project will be documented in this file.

## [1.1.1] - 2026-09-21

### Added

- **Codex pool usage modal**: each pool now exposes an Account / Tier / Usage view backed by the existing account usage cache, with refresh-all for eligible members, tier-aware Free/Plus quota windows, body-only table scrolling, and global warning/critical usage tones.
- **Persistent Codex usage snapshots**: successful account usage is restored from `quotashift_codex_usage_cache_v1` on launch; transient loading/error state is excluded, per-account requests are deduplicated, and fresh cached usage reduces unnecessary network requests.
- **Rebindable in-app shortcuts**: Keyboard Shortcuts is split into Global and In app groups. Added defaults for Add account (`Ctrl+N`), theme (`Ctrl+L`), card view (`Ctrl+E`), search (`Ctrl+F`), reload usage (`Ctrl+R`), Settings (`Ctrl+,`), and confirmed Quit (`Ctrl+Shift+Q`).
- **Shortcut discoverability**: shortcut-aware controls show the current binding as keycaps in the shared tooltip; Search shows its live binding in the placeholder.
- **Codex pool state persistence**: active-pool selection is persisted independently from the standalone applied Codex account and restored only when the stored pool still exists.

### Changed

- **Codex Pool Routing**: removed legacy pool auto-switch/apply behavior. One explicit active pool is authoritative, exact model matching is enforced, stale quota/model snapshots are excluded from routing decisions, active-pool OAuth credentials are refreshed/persisted before snapshots, and same-request failover remains inside the authenticated loopback router.
- **Codex pool cards**: pool avatars are square, Edit is icon-only and matches the 22px action geometry, the redundant `Selected pool` badge is removed, `Routing` appears only for confirmed routed traffic, and auth composition displays only nonzero `OAuth: n` / `API Key: n` values with `Pool empty` as the empty state.
- **Codex compact cards**: added a compact metadata row in the order `tier - email … last used`.
- **Global usage severity**: all remaining-usage surfaces now use the overlay warning orange (`#f97316`) below 20% and critical red below 10%.
- **Tracked tray usage**: native tray hover follows only the explicitly monitored Claude Code, Antigravity, or Codex account; identity is omitted and only recognized quota windows/grouped rows are published.
- **Modal/dialog shell**: shared dialogs are capped to the zoomed viewport, remain below the 38px application title bar, keep the title bar interactive with a separating shadow, and use Escape to cancel/close plus Enter to confirm.
- **Shortcut/action icons**: Keyboard Shortcuts uses action-matching icons while provider Add Account buttons retain their original provider-specific artwork; the Settings header retains its original state-aware sun/moon theme control.
- **Last-used tracking**: current local session reconciliation and successful Apply actions keep Last used meaningful across provider cards and sorting.
- **Antigravity logging**: successful quota refreshes emit one concise masked-account summary instead of routine successful low-level HTTP/diagnostic lines; failures remain diagnostic.
- **Codex diagnostics**: model-catalog and pool-router logs use masked request-boundary summaries without tokens, bodies, query strings, or credentials.
- **Code-quality consolidation**: centralized duplicated storage/release/routing constants, provider tier-summary rendering, Claude guardrail overlay payloads, copy-link/compact-refresh icons, and modal Escape handling; removed unused Settings icon exports without changing behavior.
- **Coverage scope**: production utility coverage now includes both root and nested compiled `src/utils` output; only test/build infrastructure, exact generated compatibility-shim paths, pure barrel modules, and type-only compiled modules are excluded. No business-logic `src/**` path is excluded to hide low coverage.
- Bumped application version to **1.1.1** across frontend, Rust package, Cargo lockfile, Tauri configuration, support material, and engineering specifications.

### Fixed

- **Claude per-account refresh**: loading state now settles after both successful and failed target refreshes; process-suspended profiles remain blocked from target-only manual refresh while visible suspended profiles still receive idle background usage polling.
- **Pool usage refresh consistency**: pool usage refresh reuses the shared account fetcher/cache instead of issuing an independent usage pipeline.
- **High-zoom dialog overflow**: account, pool, confirmation, and other shared dialogs no longer overflow the application window or cover the title bar.
- **Backup import feedback**: wrong passphrases render inline below the passphrase input instead of using a transient error toast.
- **Quit/header regressions**: restored the compact quit icon sizing, state-aware Settings theme icon, provider-specific Add Account icons, and a stable named `QuitButton` export for Vite/HMR.
- **Codex sync-test isolation**: fixed test interference from shared fixed-name temporary directories by process-scoping the affected temp paths.
- **Provider tier consistency**: account cards, overlay badges, and overlay tooltips now share provider-specific canonical plan mapping and the freshest detected plan source. Codex distinguishes Free, Go, Plus, Pro, Business (including legacy Team), Enterprise, Edu, and API accounts; Claude distinguishes Free, Pro, Max, Team, and Enterprise; Antigravity distinguishes Free, Plus, Pro, and Ultra.
- **CI security-policy regression**: restored the root `SECURITY.md` required by the glib mitigation contract so Windows, Linux, and macOS CI no longer fail during the frontend test step.

### Security

- Added a root `SECURITY.md` with private reporting guidance and the exact temporary dependency-exception policy.
- `RUSTSEC-2024-0429` / `GHSA-wrw7-89jp-8q8g` remains source-mitigated by the immutable reviewed `glib 0.18.5` backport required by Tauri's GTK3 dependency graph; Dependabot/audit metadata documents that the version ignore is not the runtime mitigation.
- Sensitive account persistence continues to use the authenticated AES-256-GCM native store with an OS-keyring-held encryption key; router and diagnostic changes preserve the existing secret-redaction and loopback-only boundaries.

### Testing

- Expanded frontend unit/contract coverage for persisted usage, Claude formatters/preferences/overlay sync, Codex tray state, shortcut behavior, pool UI, modal geometry, usage tones, secure-storage helpers, adapter/facade lifecycle paths, and release/spec synchronization.
- The hardened production-utility coverage gate now measures **97.96% line**, **90.07% branch**, and **97.10% function** coverage, up from the pre-cleanup 92.87% / 83.11% / 92.44%; enforced minimums are 95% line, 85% branch, and 95% function.
- Frontend suite passes **748 tests**; Rust suite passes **164 tests across 9 suites**; formatting, LOC, production-build, and TypeScript unused-symbol gates pass.
## [1.1.0] - 2026-09-19

### Added

- **Desktop Window Controls & Custom Shell**:
  - QuotaShift now opens as a normal borderless desktop window (`decorations: false`, `minWidth: 912`, `minHeight: 520`, default `960×700`) with custom titlebar controls: Minimize, Maximize/Restore, Close-to-Tray, and a confirmed Quit dialog.
  - Added native 8-direction edge and corner resize handles (`WindowResizeHandles`) without window decoration flicker or conflicts with titlebar drag regions.
  - Double-clicking the titlebar immediately toggles window maximization / restoration natively.
  - Closing the window hides to system tray; right-clicking the tray icon provides direct access to open the dashboard, toggle the overlay, refresh usage, or quit.
  - Replaced settings gear icon and quit button icon with refined theme-adaptive SVGs.
- **Dedicated Settings Logs Tab & Durable Backend Logger**:
  - `quotashift.log` now persists only `WARN` and `ERROR` records durably across app restarts to minimize disk I/O and maintain clean logs.
  - Added a dedicated "Logs" tab in SettingsModal with persistent log file size readout, "Open Location" folder opener, and a confirmed "Remove Logs" dialog (`CustomDialog`).
  - Live in-memory Session Logs terminal viewer capturing all debug, info, warn, and error records from startup to shutdown (starts fresh on next launch).
  - Terminal log viewer styled at compact `6pt` monospace font with an auto-scroll switch button (`codex-pool-switch`) and an icon-only "Copy all logs" button with visual feedback.
  - Short local timestamp formatting (`[HH:MM:SS]`) across both Rust stderr and frontend console/session logs.
- **Help Tab & AI Support Guide**:
  - Added root-level `llm.txt`, a versioned end-user support reference for AI chatbots covering provider workflows, overlay, settings, Claude guardrails/visibility, security, backup, troubleshooting, and UX tips.
  - Added Settings → Help with a copyable AI-support prompt containing the GitHub `llm.txt` link and a clear user-question placeholder.
  - Made AI support version-safe: the prompt injects the installed app version, prefers the exact tagged `v{version}/llm.txt`, falls back to main/changelog only when needed, and instructs AI assistants to flag unverified cross-version differences.
  - The issue template now injects the packaged app version instead of hard-coding a release number.
  - Added one-row author/source/Issues links plus an icon-only copy action for a simple bug/feature-request issue template.
- **Persistent Account Sorting & Claude Profile Reordering**:
  - Added the same drag-and-drop persistent card ordering to Claude Code profiles that Antigravity and Codex already use.
  - Added a right-most icon-only Sort action to every provider account bar.
  - Sort fields include Alias name, Email, Tier, Usage, and Last used, with explicit Asc and Desc choices for every field.
  - Sort actions persist the resulting card order across launches and share the same order storage as manual dragging.
  - Usage sorting normalizes consumed quota capacity before applying `weekly + (5-hour / 6)`: Antigravity Free/Plus/Pro/Ultra use `0.3×/1×/3×/15×`; Codex Pro and Pro x20 use `5×/20×` Plus capacity, while four Free monthly allowances equal one Plus 5-hour allowance; Claude Max x5 uses `5×` 5-hour and `3×` weekly capacity, while Max x20 uses `20×` and `6.5×`.
  - Claude last-used ordering is persisted from active/processing profile detection so it remains useful after relaunch.
- **Claude Code Low-Usage Resource Saver & Guardrail Defaults**:
  - Added toggle in `Settings → Monitoring`: "Reduce frequency refresh claude code usage" (description: "reduce frequency refresh claude code usage to saving device resource", default OFF).
  - When enabled, automatically throttles CLI probe frequency when usage is under 10% of limit to save device battery and CPU cycles.
  - Default suspend percentage values for Claude Code 5-hour and weekly limits are 95% and 98%.
- **Multi-Monitor Display Topology Re-anchoring**:
  - Desktop overlay monitors display topology changes (e.g. HDMI disconnect / reconnection); automatically re-clamps and resets overlay to the bottom-right corner of the primary screen if disconnected or out-of-bounds.
- **Codex Pool Routing & Backup Integration**:
  - Removed redundant separate import/export pool buttons in favor of integrated full app backup/restore supporting account pool definitions.
  - Aligned Codex pool card "Apply" button visual styling to match Antigravity and Codex active session buttons.
- **Native Main-Window Zoom**:
  - Added persisted WebView zoom ranging from 70% to 190% in 10% steps.
  - Supports keyboard shortcuts (`Ctrl+=`, `Ctrl+-`, `Ctrl+0`) and Ctrl+mouse-wheel zooming.
- **Claude Code Multi-Profile Monitoring**:
  - Added support for monitoring multiple Claude Code profiles keyed by their `CLAUDE_CONFIG_DIR` directories without modifying user credentials.
  - Automatic discovery of local Claude Code profiles, alongside manual profile directory addition via `ClaudeAddAccountModal`.
  - Account card visual and interaction parity with Antigravity and Codex cards: card header, tier badges, usage tone indicators, formatted limit labels, copy config directory path, and reauthenticate action buttons.
  - Added an icon-only per-account refresh action that forces usage refresh for only the selected Claude profile; suspended profiles keep refresh disabled.
  - Added active local session detection: automatically resolves running Claude Code CLI sessions to the active profile.
- **Claude Code Guardrails & Safe Process Suspension**:
  - Independent 5-hour and weekly quota threshold stop switches with adaptive guardrail polling intervals.
  - One-shot suspension mechanism: automatically suspends Claude Code CLI and background processes when usage exceeds configured thresholds, auto-disabling switches upon trigger.
  - Cross-platform native OS notifications (`tauri-plugin-notification`) and in-app alert banners upon guardrail suspension.
  - Safe process resumption: verifies exact PID, process start time, and profile directory before resuming; optional auto-resume at quota reset only triggers when all relevant quota windows reset and telemetry data is fresh and valid.
- **Vertical Settings Navigation**:
  - Reorganized Settings into a clean seven-section vertical sidebar: Monitoring, Appearance, Keyboard Shortcuts, Data, Overlay, Logs, and Help.
  - Replaced legacy HTML checkboxes with accessible segmented `<Switch>` button toggles.
  - Keyboard shortcuts now feature individual enable/disable toggle switches that unregister listeners and dim disabled bindings.
- **Responsive Account Card Columns**:
  - Added dynamic 1 to 4 column responsive grid layout (`useAccountCardGridColumns`) that scales with container width.
  - Added toggleable Compact and Expanded card layout modes persisted to `localStorage`.
- **Desktop Overlay Enhancements**:
  - Floating translucent HUD with selectable Glassmorphism and Mono themes synchronized with the application theme.
  - Dedicated Overlay UI scale controls (80% to 200%) from a fixed 340×80 base geometry with uniform whole-surface scaling.
  - Multi-monitor screen edge clamping on Windows with persistent window coordinates.
  - Overlay right-click context menu: Refresh Tracked Account, Open Full Dashboard, Toggle Theme, and Hide Overlay.
  - Provider-specific branding logos and tier badges for Google Antigravity, OpenAI Codex, and Claude Code.
- **Authentication Resilience & Polling Suspension**:
  - Automatic error detection and polling suspension for unauthenticated or expired accounts (`useAccountPollSuspension`) to eliminate quota request spam on 401/403 errors.
  - Visual error banners on affected account cards with a direct Reauthenticate action.

### Changed

- **Claude Idle Polling Reliability**: visible Claude profiles no longer stop usage refresh merely because they are untracked, inactive/non-processing, or process-suspended. Those profiles use the configured Other idle accounts poll rate, while active/tracked profiles retain their faster applicable cadence. Hiding the Claude platform remains the hard stop; suspended cards still block target-only manual refresh.
- **Last Used Accuracy**: applying Antigravity or Codex now immediately persists and renders the account's Last used timestamp. Startup and every idle-account polling cycle also reconcile the current local Antigravity/Codex session and update the matching saved account when present.
- **Settings Modal Geometry**: Settings now keeps a stable height across tabs, scrolls content internally, and starts below the 38px app title bar so window/titlebar controls remain visible and interactive.
- **Backup Import Validation**: wrong import passphrases now remain in the passphrase dialog as a red inline error below the input, clearing on edit, instead of producing an error toast.
- **Claude Card Alignment**: Claude account tier badges are vertically centered within their card action row.
- Replaced the tray-attached dashboard panel with a standalone desktop window; closing hides to tray and the tray menu reopens QuotaShift without tray-edge positioning.
- Removed legacy CSS panel scaling in favor of native WebView zoom.
- Renamed the overlay `Black & White` theme to `Mono`; legacy persisted `black-white` preferences migrate automatically to the canonical `mono` value.
- Overlay sizing is provider-independent and follows measured content, expanding when necessary to prevent clipping while avoiding redundant native resize calls.
- Updated shared refresh artwork across header and card controls to use the approved dual-arrow SVG design.
- Replaced Data import and export action buttons with approved SVG icons.
- Updated header logo to theme-aware 512px assets (`quota-shift-logo-512.png` and `quota-shift-logo-dark-512.png`) that visually fill the titlebar frame.
- Release download priority is standardized to Windows → macOS → Linux.
- Bumped application version to 1.1.0 across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.

### Fixed

- Fixed `SyntaxError: The requested module does not provide an export named 'resolveTrackedProviderTab'`.
- Fixed monitored Antigravity account and local session usage polling intervals and refresh button triggering.
- Codex tracked tray quota stays synchronized after startup and subsequent usage refreshes.
- Newly added Codex accounts persist their detected subscription tier, and multi-workspace browser login refreshes every created workspace.
- Claude shows `Resets tomorrow at ...` for next-local-calendar-day resets and reopens directly to the Claude tab when Claude is tracked.
- Track Current Account accepts raw Codex `auth.json` text returned by the backend and publishes the complete monitored-account usage payload.
- Tracked Codex tray usage is preserved when Antigravity polling is unavailable.
- Borderless resize handles no longer compete with titlebar dragging; tracked-account UI state stays synchronized; legacy Codex tracking fallback remains available; failed overlay resizes can retry.
- Prevented unauthenticated Claude profiles from triggering infinite polling loops on quota error responses.
- Claude Code platform visibility now acts as a hard feature gate: hiding Claude stops automatic usage polling, usage-event handling, guardrail evaluation, statusline setup, manual/overlay refresh work, and backend auto-resume until Claude is shown again.
- While Claude is enabled, usage polling skips suspended profiles, probes only active/processing profiles plus the explicitly tracked profile, immediately queues a fresh probe after a complete auto-resume, and uses the Claude guardrail poll rate while guardrails are enabled or the global tracked-account rate otherwise.
- Fixed overlay window coordinate drifts when dragging near multi-monitor boundary edges.

## [1.0.6] - 2026-09-15

### Added

- **Keyboard Shortcut Toggles**: Added enable/disable switch buttons for each global shortcut binding in Settings, unregistering disabled shortcuts from global listeners and dimming inactive bindings.
- **Collapsed Guardrail Summary**: When the Claude guardrails section is collapsed, the summary line dynamically reflects the active poll rate and configured stop thresholds for 5-hour and weekly limits.

### Changed

- **Guardrail Badge Outline & Padding**: Matched Claude overlay guardrail badge border-radius (`4px`) and padding (`0 2px`) to the account tier badge design.
- Claude guardrails are controlled directly by the independent 5-hour and weekly switches; enabling either activates the dedicated guardrail poll rate, while values remain editable when a switch is off.
- Tracked Claude overlays use the Claude logo avatar and percentage-only outline badges for enabled 5-hour/weekly stop thresholds, with hover explanations.
- Release downloads are ordered Windows → macOS → Linux.

## [1.0.5] - 2026-09-15

### Added

- Claude guardrails with independent 5-hour and weekly stop thresholds, per-window switches, and a master enable/disable control.
- Configurable guardrail polling with a 20-second default; while tracked and enabled, Claude uses its dedicated poll rate, otherwise tracking follows the global tracked-account rate.
- Safe auto-stop for Claude Desktop and CLI; IDE integrations recycle only the Claude extension backend without closing the IDE.

## [1.0.4] - 2026-09-14

### Added

- Configurable global shortcuts for toggling the desktop overlay and refreshing usage.
- macOS release builds and packaged release artifacts.
- Backup and restore support for Codex pools alongside Antigravity and Codex accounts.

### Changed

- Improved local Antigravity session synchronization, quota refresh behavior, HTTP fallback handling, pointer-based card reordering, and update/backup UX.
- Bumped application version to 1.0.4 across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

### Fixed

- Prevented refreshed local Antigravity credentials from being overwritten by stale same-session disk state.
- Prevented Linux and macOS portable release artifacts from colliding by using platform-specific file names.
- Guarded model-logo rendering against missing model names to avoid `toLowerCase` crashes.
- Restored Codex pool state immediately after backup import.

## [1.0.3] - 2026-09-12

### Added

- **Settings Version Link**:
  - Shows the current app version in the Settings header using secondary text styling.
  - Clicking the version opens the repository `CHANGELOG.md` on GitHub.

### Changed

- **Automatic Browser Account Names**:
  - Removed the manual account alias field from Codex and Antigravity browser login.
  - Browser-added accounts now prefer the authenticated profile display name, fall back to the email local-part before `@`, and preserve an existing account label when reconnecting.
  - Codex keeps the workspace name as a suffix when one login returns multiple workspaces.
- **GitHub Actions Runtime Migration**:
  - Migrated workflows to Node.js 24-compatible action majors (`actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`, `actions/upload-artifact@v7`, `actions/download-artifact@v8`, `softprops/action-gh-release@v3`).
- Bumped application version to 1.0.3 across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.

### Fixed

- **Codex Plus Overlay Tier**:
  - Preserved the actual Codex plan when publishing overlay data so ChatGPT Plus is no longer collapsed to `FREE`.
  - Added explicit `PLUS` rendering in the overlay tier badge.

## [1.0.2] - 2026-09-11

### Added

- **Account Search Filtering**:
  - Real-time search bar in the header filters account cards across both Antigravity and Codex tabs simultaneously as the user types.
  - Search is wired as a controlled component from `App.tsx` through `Header` down to each tab, with backward-compatible uncontrolled fallback.
- **Export Success Dialog**:
  - After a successful backup export, a dialog confirms the operation and shows the exported file path.
  - "Open in Explorer" button reveals the file in the OS file manager on all platforms (Windows: `explorer /select,<path>`; macOS: `open -R <file>`; Linux: `xdg-open <dir>`).
- **Import Panel Auto-Open**:
  - Selecting an import file via the OS file picker immediately shows the main dashboard panel and opens the passphrase input modal, eliminating the need to manually re-open the panel.
  - Panel is also restored when the user cancels the file picker (no layout disruption).
- **Avatar URL Refresh Detection**:
  - When polling account quotas, if the remote profile picture URL differs from the locally cached value, the UI automatically applies the updated avatar image.
- **Poll Rate Persistence**:
  - Configured tracked and idle poll intervals are saved to `localStorage` and restored on next app launch.
  - Default values: tracked = 30 s, idle = 10 min.
- **Compact Mode Layout**:
  - New `compact-mode.css` providing full compact layout styles for the panel.
  - ChatGPT Codex account section anchored to the right side in compact mode.
- **Settings Modal**:
  - New `SettingsModal` component with dedicated `settings-modal.css` styling.
- **Overlay Tooltip**:
  - New `OverlayTooltipApp` component and `overlay-tooltip.ts` utility for richer hover information in the desktop overlay.
- **Codex Process Killer**:
  - Backend utility (`process.rs`) detects and terminates Codex CLI, ChatGPT desktop app, and Codex IDE extension processes, surfaced as a Tauri command.
- **Cross-Platform File Manager Command**:
  - New `open_path_in_file_manager` Tauri command backed by `system/explorer.rs`; reused internally by `open_logs_folder`.
- **Track Current Account Icon Centering**:
  - Icon-only "Track Current" button now correctly centers its SVG icon at 20 × 20 px when no label text is present.
- **`CustomDialog` Cancel Label Customisation**:
  - Optional `cancelText` prop (default `"Cancel"`) lets callers display `"Close"` for non-destructive dismiss actions.

### Changed

- **Global Thin Scrollbar**:
  - Applied `scrollbar-width: thin` at `:root` level in `base.css` so all scrollable regions share a consistent narrow track (previously each panel styled scrollbars independently).
- **CI Node Version**:
  - Bumped `actions/setup-node` to `@v6` with Node 24 across all workflows.
- Bumped application version to 1.0.2 across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

### Fixed

- **Search Input Interaction**:
  - Fixed the header search box being unclickable and unable to receive keyboard input caused by a global `user-select: none` rule overriding the input element. Added explicit `user-select: text; -webkit-user-select: text; cursor: text` to `.header-search-input`.
- **Security — Credential File Exclusion**:
  - Added `recovered-*.json` and `exported-*.json` glob patterns to `.gitignore` to prevent accidental commits of local account recovery or passphrase-encrypted export files that may contain real OAuth tokens.

## [1.0.1] - 2026-09-10

### Added

- **Confirmation Dialog for Account Deletion**:
  - Modal confirmation prompt before removing Antigravity or Codex accounts to prevent accidental deletions.
  - Displays both target account name/label and email address with clean left-aligned text.
  - Dedicated red accent danger button (`Delete`) using `.dialog-btn--danger`.
- **Codebase Modularization & LOC Verification**:
  - Decomposed monolithic styles and components into modular units (`styles/base.css`, `panel.css`, `antigravity.css`, `codex-cards.css`, `codex-pools.css`, `codex-router.css`, `modals.css`, `overlay.css`, `claude.css`).
  - Added automated LOC limit verification script `scripts/check-loc.mjs` (.tsx <= 350, .ts <= 300, .rs <= 300, .css <= 600) with Prettier format checks.
  - Enforced 85% code coverage verification gate (`scripts/check-coverage.mjs`).

### Changed

- **Settings Menu Toggles**:
  - Replaced dot status indicators for Keep-Alive, Persistent AG Monitor, and Desktop Overlay with `codex-pool-switch` switch buttons.
  - Widened settings gear dropdown menu width by 2rem (`calc(175px + 2rem)`).
- **Quota Refresh UX Alignment**:
  - Standardized Antigravity card quota refresh button to match Codex (`codex-card-refresh-btn` with 11×11 circular refresh SVG, hover accent dim background, and spinning animation).
  - Updated Codex rescan models button icon.
  - Replaced account card separator with clean dash SVG icon.
- Bumped application version to 1.0.1 across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

### Fixed

- Handled undefined or uncaptured local session quotas safely in `AntigravityQuotaRows` and `AntigravityTab` to prevent blank UI states.
- Synced dashboard monitored pulse icon strictly with the active desktop overlay tracked provider and account ID.
- Made desktop overlay logos, avatars, and icons non-draggable to eliminate ghost drag selection artifacts.
- Resolved all Rust compiler warnings and clippy lints across the backend.

## [1.0.0] - 2026-09-10

### Added

- **Desktop Overlay & Liquid Glass HUD**:
  - Floating translucent desktop overlay with acrylic saturation, specular highlight, and no outer box-shadow.
  - Multi-monitor screen clamping hook with edge awareness on Windows.
  - Dynamic overlay sizing adapting automatically to account platform (Codex ~70% width, Antigravity full width).
  - Overlay right-click context menu: refresh tracked account, open full dashboard, and toggle overlay visibility.
  - Double-click detection with dedicated time and distance thresholds for dragging and docking.
  - Persistent tracking: restores monitored account and provider across restarts without blanking.
  - Standalone Claude statusline monitoring bridge and desktop overlay integration with "Track Claude" button.
- **Codex Pool Router & Model Discovery**:
  - Local loopback pool router with dynamic port binding (`127.0.0.1:0`) and per-listener secret generation (32 random bytes from `OsRng`).
  - Model catalog auto-discovery and account capability discovery with conservative shared model coverage.
  - Model pools manager supporting custom routing pools, account assignment, and failover strategies.
  - Automated Codex `config.toml` provider configuration sync with byte-exact restore on exit or tray quit and crash recovery on startup.
- **Account & Quota Experience Improvements**:
  - Independent keep-alive loops maintaining session freshness across all registered Antigravity and Codex accounts.
  - Real-time tier summaries and badge counts on Codex and Antigravity tabs.
  - Precise quota reset formatting with absolute timestamps (`Resets at: HH:MM`, `Tomorrow at HH:MM`, and calendar dates).
  - Exact Antigravity language server quota capture using isolated worker profiles without disrupting the active IDE session.
- **Security Hardening**:
  - OS-backed secure credential storage using `keyring` (Windows Credential Manager, macOS Keychain, Linux Secret Service) with AES-256-GCM encryption.
  - Fail-closed storage adapter facade intercepting sensitive `localStorage` keys into in-memory cache with serialized backend writes.
  - Safe update flow: replaced unsigned installer execution and asset downloading with direct manual download link to the official GitHub releases page.
  - Process argument hardening: removed credentials from `sys.argv` across all Python helper scripts in favor of piped JSON `sys.stdin`.
  - Owner-only Unix permissions (`0600` files, `0700` directories), symlink rejection (`O_NOFOLLOW`), and exclusive file creation (`O_EXCL`).

### Changed

- Bumped application version to 1.0.0 across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- Upgraded dependencies: `tauri` to 2.11.5, `vite` to 8.2.2, `serde` to 1.0.229, `react` to 19.2.8, `toml_edit` to 0.25.12, `crossbeam-epoch` to 0.9.20, `anyhow` to 1.0.103, `event-listener` to 5.4.2, `plist` to 1.10.1.
- Modernized CI workflows with manual desktop build triggers and matrix tests across Windows and Ubuntu runners.

### Fixed

- Hoisted account loader functions to module scope to eliminate temporal dead zone (TDZ) ReferenceErrors during startup.
- Prevented unauthorized proxy access with constant-time bearer token validation and strict loopback host/origin checks.
- Addressed development dependency advisories (Browserslist >= 4.28.7, baseline-browser-mapping >= 2.11.0).

## [0.0.11] - 2026-07-22

### Added

- Local language server integration for exact Antigravity quota polling using isolated background worker profiles.
- Added "Local Antigravity Session" card pinned above the monitored account list with one-click session capture.
- Pointer-based drag-and-drop account card reordering with midpoint calculation and four-pixel movement threshold.
- Contract test suites covering local session capture, worker lifecycle, and pointer reordering.

### Changed

- Bumped application version to 0.0.11 across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

## [0.0.10] - 2026-07-21

### Added

- Drag-to-reorder account cards on both Antigravity and ChatGPT Codex tabs. Each card has a grab handle; dropping a card on another card inserts it before the target. Tab-specific order is persisted to `localStorage` and restored on startup.

### Changed

- Bumped application version to 0.0.10 across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

## [0.0.9] - 2026-07-20

### Added

- New `ci.yml` GitHub Actions workflow: on every push/PR to `main`, builds the frontend (`pnpm build`), runs Rust tests (Linux only), and runs `cargo check` on both Windows and Linux. Uses pnpm and `actions/setup-node@v4` with Node 24.
- Release (`publish.yml`) now runs `pnpm build` and `cargo test` (Linux) plus `cargo check` (both OS) before building the desktop bundle, so broken builds fail fast before the release artifact stage.

### Fixed

- Upgraded GitHub Actions from Node 20 to Node 24 (`actions/setup-node@v4`). Node 20 is being deprecated on GitHub Actions runners and is incompatible with `pnpm@11.9.0` (which requires Node >= 22.13 due to the `node:sqlite` built-in module used by pnpm's store). Without the bump, every workflow failed at `actions/setup-node` with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` while computing the pnpm cache path.

## [0.0.8] - 2026-06-28

### Added

- Active badge now shows the account that is actually applied/running in the IDE, not just the tracked/monitored card. Separate `appliedId` prop tracks the true active session.
- Plan detection now maps `advanced-tier` / `advanced` / `google_ai_pro` / `google-ai-pro` / `ai-pro` to "Google AI Pro" and `ultra-tier` / `ultra` / `google_ai_ultra` / `google-ai-ultra` / `ai-ultra` to "Google AI Ultra" in both Rust parser and frontend resolver.
- Auto-detect OAuth client credentials from the user's installed Antigravity IDE (`main.js`) at runtime, with fallback to gcloud ADC and compile-time defaults.
- OAuth credentials extracted to `secrets.rs` with compile-time env var overrides (`QUOTASHIFT_*`).
- Loading spinner moved to the left of the Apply button in account card headers.
- Per-account usage cache with 5-minute TTL; "Best" button on Codex and Antigravity tabs switches to the account with the most remaining quota across visible windows.
- Recommend `vadimcn.vscode-lldb` in `.vscode/extensions.json` for in-IDE Rust debugging.

### Fixed

- Apply Antigravity account now refreshes the access token before writing the session, preventing 401 errors from expired tokens.
- Preserved existing `lastPlan` and `lastBalance` on card when quota fetch returns no plan/credits data (e.g. from language server fallback), instead of overwriting with defaults.
- Removed "Live - just now" timestamp and "Fetching live quota..." / "Fetching usage..." text from account cards.
- Fetch ChatGPT (Codex) OAuth `client_id` at runtime from the `openai/codex` GitHub raw source, cache to `~/.quotashift/codex_client_id.txt`; replaces the compile-time env var that previously shipped empty and broke browser login with "Authentication Error / empty_string".
- Fetch Antigravity consumer Google OAuth `client_id` + `client_secret` at runtime from the `skainguyen1412/antigravity-usage` GitHub raw source, cache to `~/.quotashift/ag_client_id.txt` + `ag_client_secret.txt`; replaces compile-time defaults that were not reaching the OAuth flow, causing browser login to fail with "Missing required parameter: client_id" (Error 400: invalid_request).
- Antigravity cloud `retrieveUserQuota` buckets with no `window` field now apply their percentage to both 5h and weekly pools instead of defaulting the missing window to `"5h"` (which left the weekly column stuck at 100%).
- Antigravity browser login no longer overwrites the IDE's current session; the `write_antigravity_session` call is removed from the browser login path. Users must explicitly click "Apply" on an account card to switch the IDE session.
- Codex Plus (and above) accounts now display only the weekly limit column — OpenAI removed the monthly cap for these tiers. Falls back to `weekly_window` field when `secondary_window` is absent.

## [0.0.7] - 2026-06-25

### Added

- Added "Unsaved Active IDE Session" banner at the top of the Antigravity tab when the running IDE session uses an unsaved account, with a one-click Capture button.

### Fixed

- Fixed backend session token decoding to successfully resolve access and refresh tokens from protobuf format regardless of base64 prefixes.
- Automatically aligned and cleared the active account badge if the user switches to an unsaved account in the IDE.

## [0.0.6] - 2026-06-25

### Fixed

- Handled background terminal command execution silently on Windows (no flashing console windows).
- Fixed double quotes being added to the installation directory in the NSIS installer.
- Added auto-recovery of active Codex session from `~/.codex/auth.json` on token expiry/401 errors.
- Synchronized refreshed Codex session tokens back to `~/.codex/auth.json` to keep the active CLI/extension session logged in.

## [0.0.4] - 2026-06-24

### Fixed

- Removed enclosing quotes from `InstallLocation` registry key.
- Configured passive installer flags (`/UPDATE`, `/P`, `/R`) in update process to automate update installation and application restart.

## [0.0.2] - 2026-06-24

### Fixed

- Resolved account switching issue in Codex and Antigravity by introducing direct credentials and session state injection.
- Handled session capture/import by linking quota tracking to account emails instead of raw session IDs, preventing overwrites.
- Added password phrase handling for improved security when importing/ exporting backup data sessions.
- Prevented duplicate account cards in the UI when importing a session for an existing account.

## [0.0.1] - 2026-04-20

### Added

- Manage Antigravity and Codex accounts in a single interface.
- Real-time monitoring of 5-Hour and Weekly limits for both Antigravity and Codex.
- System tray tooltip displaying active model and quota limits.
- Floating overlay dashboard with active model details and remaining credits.
- Custom polling intervals, light/dark themes, and update notifications.
- Auto-centering of monitored model and interdependent limit updates.
- Support for multiple accounts and quick swapping between them.
