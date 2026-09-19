# 06 — Settings and Configuration

**Audience:** engineers & AI agents · **Scope:** application configuration, storage keys, and defaults · **Verified against:** `1.1.0`

QuotaShift provides a centralized, accessible Settings dialog organized into a seven-tab vertical sidebar navigation system.

## 1. Settings Navigation Architecture

```text
SettingsModal.tsx
  ├── Sidebar Navigation (Vertical Tabs)
  │     ├── Monitoring (Poll Rates, Adaptive Intervals, Low-Usage Saver, Guardrail Rate)
  │     ├── Appearance (App Theme, Card View Modes, Platform Visibility)
  │     ├── Keyboard Shortcuts (Overlay Toggle, Quota Refresh, Key Rebinding)
  │     ├── Data (Passphrase Encrypted Export & Import, Backup Reveal)
  │     ├── Overlay (Overlay Toggle, Theme, UI Scale, Reset Geometry)
  │     ├── Logs (Persistent Log File Controls, Live Session Logs Terminal)
  │     └── Help (AI support prompt, llm.txt guide, project links, issue template)
  └── Content Pane (Divided Rows with Segmented Switch Toggles)
```

## 2. Configuration Options & Defaults

| Section        | Setting Key                                    | Description                                                                                          | Type / Values               | Default                                   |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| **Monitoring** | `poll_interval_tracked`                        | Polling frequency for the actively tracked account; tracked Claude uses this when guardrails are off | integer (seconds)           | `30` (30s)                                |
| **Monitoring** | `poll_interval_idle`                           | Background polling frequency for untracked accounts                                                  | integer (seconds)           | `600` (10 min)                            |
| **Monitoring** | `quotashift_claude_reduce_low_usage_frequency` | Reduce usage refresh frequency when < 10% limit to save resources                                    | boolean                     | `false`                                   |
| **Monitoring** | `claude_guardrail_poll_interval`               | Dedicated base polling rate for eligible Claude profiles while either guardrail is active            | integer (seconds)           | `20` (20s)                                |
| **Appearance** | `theme`                                        | Application visual mode (Dark / Light)                                                               | `'dark' \| 'light'`         | `'dark'`                                  |
| **Appearance** | `card_layout_mode`                             | Account card density mode                                                                            | `'compact' \| 'expanded'`   | `'compact'`                               |
| **Appearance** | `platform_visibility`                          | Toggle provider tabs; disabling Claude also hard-disables its feature runtime                        | Record<string, boolean>     | `{ ag: true, codex: true, claude: true }` |
| **Shortcuts**  | `shortcuts_overlay_toggle`                     | Global key binding to show/hide overlay                                                              | string shortcut             | `CommandOrControl+Shift+O`                |
| **Shortcuts**  | `shortcuts_refresh_quota`                      | Global key binding to refresh monitored usage                                                        | string shortcut             | `CommandOrControl+Shift+R`                |
| **Shortcuts**  | `shortcuts_enabled`                            | Per-binding registration switch                                                                      | boolean                     | `true`                                    |
| **Overlay**    | `overlay_theme`                                | Overlay aesthetic HUD style                                                                          | `'glassmorphism' \| 'mono'` | `'glassmorphism'`                         |
| **Overlay**    | `overlay_ui_scale`                             | Whole-surface overlay scale                                                                          | float (0.8 to 2.0)          | `1.0` (100%)                              |
| **Shell**      | `main_window_zoom`                             | Native WebView zoom scale                                                                            | float (0.7 to 1.9)          | `1.0` (100%)                              |
| **Logs**       | `logs_file_controls`                           | Persistent log file readout (`~/.quotashift/quotashift.log`), Explorer reveal, confirmed purge       | UI Action                   | —                                         |
| **Logs**       | `logs_session_stream`                          | Live in-memory app session logs with switch auto-scroll and icon-only copy button                    | UI Stream                   | 6pt mono                                  |
| **Help**       | `llm_support_guide`                            | Copyable AI support prompt linking to root `llm.txt`, project links, and issue template              | UI Action                   | —                                         |

### Claude Polling Precedence

1. If Claude platform visibility is OFF, the Claude subsystem is disabled: no scheduled usage probes, guardrail evaluation, usage-event handling, statusline setup, manual/overlay refresh, or auto-resume work runs. This rule overrides every polling cadence below.
2. If Claude is visible and either guardrail is enabled, active/processing Claude profiles and the explicitly tracked Claude profile use the dedicated Claude poll rate when eligible for fast probing.
3. If guardrails are disabled and a Claude profile is explicitly tracked, that profile uses the global tracked-account poll rate.
4. Every other visible Claude profile—including inactive, untracked, non-processing, and process-suspended profiles—continues scheduled usage refresh on **Other idle accounts poll rate**.
5. A process-suspended profile remains blocked from target-only manual card Refresh, but its background idle usage probe remains eligible. A complete automatic resume immediately queues one forced fresh probe. Hiding Claude is the only platform-level hard stop for scheduled Claude usage polling.

### Settings Modal Geometry

- The Settings surface has a stable content height across all seven tabs.
- Its overlay starts below the 38px application title bar rather than covering the full window.
- The title bar remains visible and interactive while Settings is open, including drag/maximize and window controls.
- Settings tab content scrolls inside the modal body when it exceeds the stable height.

### Backup Passphrase Error UX

- An invalid import passphrase or unreadable encrypted backup keeps the passphrase modal open.
- The error is displayed in red directly below the passphrase input instead of using a toast.
- Editing the passphrase clears the inline error so the user can retry immediately.

## 3. Storage Hierarchy & Key Catalog

```text
Secure Vault (OS Keyring via Keyring Crate)
  ├── ag_accounts                  (Antigravity account sessions, refresh tokens)
  ├── codex_accounts               (Codex account tokens, workspace IDs)
  └── codex_pools                  (Loopback routing pools, member accounts)

localStorage (Non-Sensitive UI Preferences)
  ├── poll_interval_tracked        (Tracked poll rate in seconds)
  ├── poll_interval_idle           (Idle poll rate in seconds)
  ├── quotashift_claude_reduce_low_usage_frequency (Low usage polling throttle)
  ├── theme                        (Dark / light mode)
  ├── main_window_zoom             (Dashboard zoom factor)
  ├── card_layout_mode             (Compact / expanded view)
  ├── overlay_theme                (HUD visual theme; legacy black-white values migrate to mono)
  ├── overlay_ui_scale             (HUD scale percentage)
  ├── overlay_window_pos           (Last known X/Y screen coordinates)
  ├── shortcuts_config             (Custom key combination bindings)
  ├── ag_card_order / codex_card_order (Custom drag-and-drop sort order)
  └── quotashift-claude-last-used-v1 (Persisted Claude profile last-use timestamps)
```

## 4. UI Switch Component Contract

All boolean configuration controls utilize the custom `<Switch>` component:

- Segmented pill track with sliding circular thumb.
- Supports keyboard navigation (`Space` / `Enter` toggle).
- Accessible ARIA role `role="switch"` with `aria-checked` states.
- Clean white active pill styling on dark backgrounds with zero outline bleed.

## 5. Button and Tooltip Component Contract

All interactive buttons in Settings, Modals, and Dashboard Views conform to the strict UI tooltip contract:

- **Mandatory `data-tooltip`**: Every `<button>` element must declare a descriptive `data-tooltip` attribute describing its direct user action.
- **Prohibition of `title` Attribute**: The HTML `title` attribute is prohibited on `<button>` tags across the entire application to avoid jarring, un-styled native browser tooltip overlays.
- **Contract Enforcement**: Enforced by comprehensive automated AST contract tests (`tests/all-buttons-tooltip-contract.test.mjs`).

## 6. Help & AI Support

The Help tab is designed for end-user support without bundling a chatbot into QuotaShift:

- Shows a copyable example prompt that tells the user to replace a clear placeholder with their own question and injects the packaged QuotaShift version automatically.
- The copied prompt links to the exact tagged guide first (`blob/v{installedVersion}/llm.txt`), then provides main/latest `llm.txt` and the changelog only as fallbacks.
- The prompt explicitly tells the AI that the installed app version is authoritative, forbids assuming newer main-branch behavior exists in an older release, and requires unverified differences to be labeled.
- Shows links to author `the-long-ride`, the QuotaShift source repository, and the repository Issues page.
- Provides an icon-only copy action for a short bug/feature-request issue template.
- The support prompt and issue template explicitly steer users away from sharing credentials, tokens, cookies, or backup secrets.

**Related:** [`04-desktop-shell-and-overlay`](04-desktop-shell-and-overlay.md) · [`07-backup-and-recovery`](07-backup-and-recovery.md)

**Next →** [`07-backup-and-recovery`](07-backup-and-recovery.md)
