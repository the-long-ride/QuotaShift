---
schema_version: 1
id: interface.settings-configuration
title: Settings and Configuration
kind: interface
status: verified
summary: "Six-section Settings UI, storage keys and defaults, poll cadences, global and in-app keyboard shortcuts, Monitoring toggles, and remaining-quota severity contract."
tags: ["settings", "preferences", "shortcuts", "configuration", "ui"]
source_paths: ["src/components/common/settings-fields/AdjustmentRow.tsx", "src/components/common/settings-fields/AutoMonitorOnApplySetting.tsx", "src/components/common/settings-fields/CardViewSetting.tsx", "src/components/common/settings-fields/ClaudeResetCreditsSetting.tsx", "src/components/common/settings-fields/CodexModelRoutingSetting.tsx", "src/components/common/settings-fields/IdlePollField.tsx", "src/components/common/settings-fields/IdlePollInputs.tsx", "src/components/common/settings-fields/MaxMonitoredCardsRow.tsx", "src/components/common/settings-fields/MonitoringToggles.tsx", "src/components/common/settings-fields/MultiTrackSettings.tsx", "src/components/common/settings-fields/OverlayAdjustmentGroup.tsx", "src/components/common/settings-fields/QuotaPercentModeSetting.tsx", "src/components/common/settings/AppearanceSettingsSection.tsx", "src/components/common/settings/BehaviorSettingsSection.tsx", "src/components/common/settings/HelpSettingsSection.tsx", "src/components/common/settings/LogsSettingsSection.tsx", "src/components/common/settings/SettingsModal.tsx", "src/components/common/settings/settings-helpers.ts", "src/components/common/settings/settings-types.ts", "src/components/common/settings/useSettingsModalTab.ts", "src/components/common/settings/useSettingsPollState.ts", "src/styles/settings/settings-platform.css", "src/utils/common/settings/auto-monitor-on-apply.ts", "src/utils/common/settings/claude-preference-types.ts", "src/utils/common/settings/claude-preferences.ts", "src/utils/common/settings/codex-model-routing.ts", "src/utils/common/settings/display-mode.ts", "src/utils/common/settings/max-monitored-cards.ts", "src/utils/common/settings/poll-interval.ts", "src/utils/common/settings/quota-percent-mode.ts", "src/utils/common/settings/restart-on-switch.ts", "src/utils/common/settings/shortcut-keys.ts", "src/utils/common/settings/shortcut-registration.ts", "src/utils/common/settings/shortcuts.ts", "src/utils/common/settings/use-global-shortcuts.ts"]
related_specs: ["architecture.system-overview", "architecture.desktop-shell-overlay", "workflow.claude-guardrails-lifecycle", "workflow.backup-recovery", "feature.codex-routing-pools", "feature.agent-api-cli-failover"]
last_doc_update_at: "2026-11-16T08:33:00Z"
last_verified_at: "2026-11-16T08:33:00Z"
last_verified_code_commit: f2f08c6b02846221898c955c0e5851c35fae0746
last_source_change_commit: 7a0913bd6c2aca62395d780a783ed20d078d2635
last_source_change_at: "2026-11-16T01:57:11+07:00"
source_fingerprint: "sha256:bd9302557048d5a1ec44edd77b07dabf7fbba60f5ce36c846efa56bd3ae573a1"
---

# 06 — Settings and Configuration

**Audience:** engineers & AI agents · **Verified against:** `1.3.0` · **Date:** 2026-11-16

Settings (`SettingsModal`) uses a vertical six-section navigation: Monitoring, Appearance, Keyboard Shortcuts, Data, Logs, and Help (`.settings-modal-box` sized at `min(560px, calc(100vh - 54px))` with shortcut row bottom dividers). Its header displays the app version link (`CHANGELOG.md`), theme toggle (with live shortcut keycaps), and close control. Pressing `Escape` closes Settings unless a nested Agent API modal (`.agent-api-overlay`) is open.

## Core preference defaults

| Area | Storage key | Default / range |
| --- | --- | --- |
| Tracked poll | `quotashift_tracked_poll_interval_secs` (also syncs `antigravity-poll-interval`, fallback `quotashift_poll_interval_secs`) | 30s; 5–1200s (recommended 30–120s) |
| Idle accounts poll | `quotashift_idle_poll_interval_secs` | 600s; 5–1200s (recommended 5–15 min) |
| Claude guardrail poll | `quotashift_claude_poll_interval_secs` | 20s; 5–1200s |
| Claude only watch running accounts | `quotashift_claude_only_watch_processing_accounts_v1` | true |
| Claude reset count in cards/overlay/taskbar | `quotashift_claude_reset_credits_enabled_v1` | false |
| Claude 5h guardrail enabled | `quotashift_claude_five_hour_stop_enabled` | false |
| Claude 5h threshold | `quotashift_claude_five_hour_stop_threshold_pct` | 95 (1–100) |
| Claude weekly guardrail enabled | `quotashift_claude_weekly_stop_enabled` | false |
| Claude weekly threshold | `quotashift_claude_weekly_stop_threshold_pct` | 98 (1–100) |
| Claude auto-resume | `quotashift_claude_auto_resume_at_reset_v1` | false |
| Claude low-usage reduction | `quotashift_claude_reduce_low_usage_frequency` | false |
| Theme | `antigravity-theme` | dark |
| Card layout | `quotashift_card_layout_mode` | expanded unless `"compact"` explicitly stored |
| Platform visibility | `quotashift_platform_visibility_v1` | all three providers visible (`true`) |
| Antigravity and multi-account Codex keep-alive | `keepAliveActive` | true |
| Persistent AG monitor (experimental) | `quotashift_antigravity_persistent_workers_v1` | false |
| Main WebView zoom | `quotashift_main_webview_zoom_v1` | 100%; 70–190% (step 10%) |
| Overlay UI | `quotashift_ui_adjustment_v1` | `glassmorphism`, 100%; scale 80–200% |
| Display mode | `quotashift_display_mode_v1` (last non-None in `quotashift_display_mode_last_v1`; syncs `quotashift_overlay_enabled`) | taskbar (Windows) / overlay (other); `none` / `overlay` / `circle` / `taskbar`; forced to `none` when untracked |
| Max monitored account cards | `quotashift_max_monitored_cards_v1` | 3 (1–20) |
| Track multiple accounts | `quotashift_multi_track_v2` | true (migrates `quotashift_multi_track_v1` if any provider was enabled) |
| Tracked account list | `quotashift_overlay_tracked_v2` | primary only; 1–3 `{provider, id}` entries (not backed up) |
| Auto-monitor applied account | `quotashift_auto_monitor_on_apply_v1` | false (enabling also turns on `quotashift_multi_track_v2`) |
| Unmonitor same provider on apply | `quotashift_unmonitor_same_provider_on_apply_v1` | false |
| Quota usage display mode | `quotashift_show_used_quota_v1` | true (`Used`; `false` = `Remaining`) |
| Restart running app on switch (experimental) | `quotashift_restart_on_switch_v1` | false |
| CLI account rotation (experimental) | `quotashift_cli_rotation_prompt_v1` | JSON: `enabled: false`, `continuationPrompt: "continue remaining works"`, `requiredFreshSamples: 2`, `minSampleSeparationSecs: 5`, `gracefulWaitSecs: 15`, `autoRestartAfterAppStart: false` |
| Use Codex Model Routing | `quotashift_codex_model_routing_v1` | false |
| Claude last-good usage cache | `quotashift_claude_usage_cache_v1` | per-account snapshot (not backed up) |

## Monitoring

The Monitoring tab (`activeTab === "poll"`) contains:

- **Poll rates**: **Monitored account(s) poll rate** (default `30s`, recommended `30–120s`) and **Other idle accounts poll rate** (default `600s`, recommended `5–15 min`), both clamped on commit to `5–1200s` with inline `<PollWarning />` banners outside the recommended range.
- **Track multiple accounts**: non-experimental (`quotashift_multi_track_v2`, default ON). Allows double-clicking cards in any tab to monitor up to `3` accounts from any mix of providers. Turning it OFF trims the tracked list to the primary entry.
- **Antigravity & ChatGPT Codex**:
  - **Keep-alive**: maintains saved Antigravity sessions and the local Codex sign-in in the background.
  - **Persistent AG monitor** `<Experimental>`: keeps isolated Antigravity monitoring workers running for exact quota updates.
- **Account Switching**:
  - **Restart running app on switch** `<Experimental>`: restarts running desktop apps, IDEs, and `agy` CLI in a fresh terminal (or stops Codex CLI/IDE extension sessions) upon account switch.
- **Auto-monitoring**:
  - **Auto-monitor applied account**: adds an applied account to monitoring (up to the strict 3-account capacity without evicting existing entries). Enabling automatically enables multi-account tracking.
  - **Unmonitor other accounts on the same platform** (shown when Auto-monitor is ON): removes previously monitored accounts of the same provider before adding the applied account; never untracks other providers.
- **CLI Rotation**:
  - **CLI account rotation** `<Experimental>`: enables unattended CLI pool failover (`useCliPoolAutoFailover`, guarded by `assertAutoRotationStillEligible`). Requires `Restart running app on switch` ON, an enabled `autoSwitch` pool, two fresh consecutive zero-remaining samples (`requiredFreshSamples: 2`, `minSampleSeparationSecs: 5`), a 300s per-window cooldown, and a successful native preflight (`cli_pool_preflight_auto_rotation`).
  - **Continuation prompt**: editable instruction passed on CLI resume (default `'continue remaining works'`), validated for non-empty trimmed text, `<= 2000` Unicode code points, and no NUL (`\0`) bytes, with reset-to-default and save actions.
- **AI Agent API**:
  - **AI Agent API** (`Configure`): opens the local AI Agent API modal (also accessible from `BackgroundStatusModal`).
  - **Use Codex Model Routing** (`quotashift_codex_model_routing_v1`, default `false`): gates Codex Model Pools subtabs, Model Routing authorization on Codex cards, and Claude's **Connect to QuotaShift** action.
- **Claude Code**:
  - **Reduce frequency refresh claude code usage**: throttles usage probes when usage is below 10%.
  - **Show Claude reset count**: non-experimental, default OFF. Gates Claude reset-count fetching itself, including card badges and overlay/taskbar counts. Unknown provider data is not zero.

## Appearance

The Appearance tab (`activeTab === "appearance"`, `AppearanceSettingsSection`) organizes three groups top-to-bottom:

- **General**:
  - **Card view** (`CardViewSetting`): `Compact` / `Expand` (`quotashift_card_layout_mode`).
  - **How to show quota usage** (`QuotaPercentModeSetting`): segmented switch (`Remaining` / `Used`, default `Used`, `quotashift_show_used_quota_v1`) controlling account cards, overlay, taskbar, and tooltips while leaving warning thresholds based on remaining quota.
- **Platform**: visibility toggles for `Antigravity`, `ChatGPT Codex`, and `Claude Code` (`quotashift_platform_visibility_v1`; `.settings-subsection--platform` has no bottom divider, with `.settings-platform-*` styles in `src/styles/settings/settings-platform.css`).
- **Monitored Display**: `QuotaDisplayRow` (`None | Card | Circle | Taskbar`), conditional `CircleOrientationRow` ("Overlay stack layout": `Vertical | Horizontal`, shown whenever `displayMode === "overlay" || displayMode === "circle"`), `MaxMonitoredCardsRow` (`quotashift_max_monitored_cards_v1`, `1–20`, default `3` simultaneous accounts across Card/Circle overlay & Taskbar), and `OverlayAdjustmentGroup` (`quotashift_ui_adjustment_v1` theme + `80–200%` scale + reset).

## Codex Router telemetry

The Router telemetry modal is opened from the Codex Router controls. It refreshes while visible and provides 1h, 24h, 7d, 30d, and all-time ranges, aggregate token/cache metrics, hourly charts, and per-model breakdowns. Telemetry is informational and does not introduce a user preference or change account routing by itself.

## Keyboard Shortcuts

The tab (`ShortcutSettings`) is split into two independent groups. Clicking a binding badge sets `document.documentElement.dataset.shortcutRecording = "true"` (pausing in-app shortcut dispatch), rejects modifier-only or unmodified keys, cancels on `Escape`, and shows a reset-to-default icon button when a binding differs from its default.

### Global shortcuts

These remain registered system-wide while the dashboard is hidden in the tray (`useGlobalShortcuts` + serialized `createShortcutRegistrationController`). Each binding has an enable switch and is rebindable.

| Action | Storage key (binding / enabled) | Default |
| --- | --- | --- |
| Cycle quota display (`None -> Overlay -> Taskbar`) | `quotashift_shortcut_toggle_overlay` / `quotashift_shortcut_toggle_overlay_enabled` | `CommandOrControl+Alt+D` / `true` |
| Refresh Usage (monitored/all) | `quotashift_shortcut_refresh_account` / `quotashift_shortcut_refresh_account_enabled` | `CommandOrControl+Alt+R` / `true` |

### In-app shortcuts

These execute only while the QuotaShift WebView is open (`useInAppShortcuts` + `useAppInAppShortcuts`). They are persisted and rebindable.

| Action | Storage key | Default | Behavior |
| --- | --- | --- | --- |
| Add account | `quotashift_in_app_shortcut_add_account` | `CommandOrControl+N` | Closes Settings and opens Add for the active provider tab |
| Toggle theme | `quotashift_in_app_shortcut_toggle_theme` | `CommandOrControl+L` | Dark/light |
| Toggle card view | `quotashift_in_app_shortcut_toggle_card_view` | `CommandOrControl+E` | Compact/expanded |
| Focus search | `quotashift_in_app_shortcut_focus_search` | `CommandOrControl+F` | Closes Settings and focuses `.header-search-input` |
| Reload full usage | `quotashift_in_app_shortcut_refresh_all` | `CommandOrControl+R` | Forces full usage refresh |
| Open settings | `quotashift_in_app_shortcut_open_settings` | `CommandOrControl+,` | Opens Settings |
| Untrack all accounts | `quotashift_in_app_shortcut_untrack_all` | `CommandOrControl+Shift+U` | Dispatches `quotashift:untrack-all-request` (Untrack All confirmation) |
| Zoom in | `quotashift_in_app_shortcut_zoom_in` | `CommandOrControl+=` | Dispatches `quotashift:zoom` (`+1`, +10%) |
| Zoom out | `quotashift_in_app_shortcut_zoom_out` | `CommandOrControl+-` | Dispatches `quotashift:zoom` (`-1`, -10%) |
| Reset zoom | `quotashift_in_app_shortcut_zoom_reset` | `CommandOrControl+0` | Dispatches `quotashift:zoom` (`0`, 100%) |
| Quit app | `quotashift_in_app_shortcut_quit_app` | `CommandOrControl+Shift+Q` | Closes Settings and opens quit confirmation |

Shortcut-aware buttons include their live binding (`data-shortcut`) in the custom `Tooltip` component (500ms hover delay) as individual `<kbd className="app-tooltip-keycap">` keycaps. Search is the exception: its current binding is shown in the placeholder.

## Appearance

- **Header actions**: theme toggle button (sun/moon artwork) is placed immediately to the left of the close button.
- **Card view**: segmented switch for `Compact` vs `Expand` card modes.
- **Monitored Display**:
  - **Monitored Display Visibility**: segmented switch choosing **None**, **Card**, **Circle**, or **Taskbar** (Windows only). Options other than **None** are disabled when no account is tracked.
  - **Overlay & taskbar theme**: segmented switch choosing `Glassmorphism` or `Mono` (`Mono` follows the main window light/dark theme).
  - **Overlay & taskbar tooltip UI scale**: numeric input and slider adjusting scale between `80%` and `200%`.
  - **Reset monitor display**: icon button resetting overlay scale (`100%`) and theme (`glassmorphism`) to defaults.
- **Platform**: independent toggle cards for Antigravity, ChatGPT Codex, and Claude Code. Hiding a platform switches away from it if active and stops its idle/monitored polling (hiding Claude Code stops all Claude background polling and feature execution), while hidden platforms remain eligible for Keep-Alive.

## Data, Logs, and Help tabs

- **Data**:
  - **Codex Models**: **Rescan all Codex models** (displays `Scanning X / Y` progress while active; closes Settings on trigger).
  - **Account Credentials**: **Export credentials** and **Import credentials** (encrypted Antigravity and Codex account credentials only).
  - **Full Backup**: **Export backup** and **Import backup** (accounts, pools, and `BACKUP_SETTING_KEYS` preferences). Importing settings triggers a 1200ms delayed window reload after flushing secure storage; `CLI_ROTATION_PREFERENCES_KEY` resets `enabled` and `autoRestartAfterAppStart` to `false` on restore.
- **Logs**:
  - **Persistent log file**: displays byte size of `~/.quotashift/quotashift.log` (warnings and errors only), **Open log file location** (`open_logs_folder`), and **Remove logs** (`clear_log_file` with `CustomDialog` confirmation).
  - **Session Logs**: polls `get_session_logs_revision` and `get_session_logs` every `1500ms` while visible, with an **Auto-scroll** switch (default ON) and **Copy all logs below** button.
- **Help**:
  - Resolves installed app version (`getVersion()` with `package.json` fallback), provides a copyable **Example support prompt** (referencing version-pinned `llm.txt`, release tag, main `llm.txt`, `CHANGELOG.md`, and safety rules), external **Project** links (`Author: the-long-ride`, `Source`, `Issues`), and a copyable **Quick issue template**.

## Usage color contract

All remaining-usage displays share the same thresholds:

- `<10%`: critical red.
- `10%–<20%`: warning orange `#f97316` (the same orange as the overlay warning bar).
- `>=20%` or unavailable: normal treatment.

## Dialog/confirmation behavior

- Shared dialogs remain below the 38px app title bar and are capped to the available viewport at high zoom.
- The title bar remains visible/interactable and gains a shadow while a dialog is open.
- Confirmation dialogs use Escape for cancel/close and Enter for confirm.
- Wrong backup passphrases are shown inline below the passphrase input rather than as a toast.

## Codex non-secret state

| State | Storage key |
| --- | --- |
| Accounts | secure facade key `antigravity-codex-accounts` |
| Pool definitions | `quotashift_codex_account_pools_v1` |
| Active pool | `quotashift_codex_active_pool_id_v1` |
| Pool routing requested | `quotashift_codex_pool_routing_v1` |
| Model catalog cache | `quotashift_codex_model_catalog_v1` |
| Successful usage cache | `quotashift_codex_usage_cache_v1` |

The usage cache persists successful snapshots only and removes transient loading/error flags before storage.

**Next →** [07 — Backup and Recovery](07-backup-and-recovery.md)

## Concurrent Codex Model Pools UI (V2)

The **Codex → Model Pools** tab uses independent **Enabled** switches, rather than choosing one global active pool. Every enabled pool is routable concurrently by its unique public model name; multiple pools may point at the same upstream model. Enabling an alias collision fails without disabling other pools. Pool display names are not routing keys.

The **Pool Routing** switch starts/stops the local gateway for all enabled pools. If all pools are disabled, the gateway cannot be enabled and will stop when the last pool is disabled. Definitions live at `quotashift_codex_model_pools_v2`. The legacy `quotashift_codex_active_pool_id_v1` is a one-time migration input, not the active routing selection. The global Codex CLI applied account is independent of enabled Model Pools.

### Claude Code through Model Pools

The **Claude Code** tab includes **Connect to QuotaShift**. It routes Claude Code through the local gateway (`/v1/messages`) to an enabled Model Pool. Requests are translated from Anthropic Messages to OpenAI Responses and streamed back in Anthropic format.

Setup: pick an installation and profile, choose a mode, and map Claude slots (Default, Sonnet, Opus, Haiku, Fable) to pool aliases. The **Default slot is required**: unmapped Claude models use its pool, and Connect refuses without it ("Map the Default slot: unmapped Claude models use it.").

- **Launch once**: starts Claude Code with temporary env; the token lives only in memory. A new launch-once connect revokes the token of an earlier launch-once session.
- **Persist for this profile** (internal id `persistent-profile`): writes `apiKeyHelper` (`"<exe>" --claude-gateway-token <profile_id>`), the base URL and the slot env keys into the profile `settings.json`. No token is written there. Gateway bindings are encrypted at rest and survive restarts.

Connect refusals:

- The profile's own `settings.json` env has `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` (QuotaShift does not edit them; remove the key and retry).
- Launch once: `settings.json` env.ANTHROPIC_BASE_URL is set to a different URL than the gateway's. Settings override the process environment, so Claude Code would bypass the gateway. Remove or fix that key.
- Persist for this profile: the router is not on a fixed port. The address is written into `settings.json`, so it must survive restarts. In Model Pools > Router Server enter a Port (1024-65535) and click Apply, then connect again. A random port, or a start that fell back because the saved port was taken, does not count. Launch once works on any port.
- A mapped alias is not an enabled pool, or is a legacy Codex OAuth pool. Use an enabled SIWC or API-key pool.

These cannot be checked at connect time and will override `apiKeyHelper`: project-level `.claude/settings*.json` env, managed/organisation policy settings, and `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` exported in the shell.

The **Connected profiles** section of the wizard lists connections and their state:

| State | Meaning / action |
| --- | --- |
| Connected (no suffix) | Active. **Disconnect** revokes the token and restores `settings.json`. |
| `, router stopped` | Not cleanup-pending, but the local router is not running, so the connection is not live. Start Model Pool Routing: it works again when the router comes back on the same address, which a fixed port guarantees. If the address differs, the row changes to the next state. |
| `, router address changed - reconnect` | `settings.json` still holds the address the router had when you connected, but the router now listens elsewhere (for example the saved fixed port was taken at startup and it fell back to a random port, or you changed the port). Claude Code cannot reach the router. Free the saved port and click Apply on the Port setting (or stop and start Model Pool Routing), or connect again to write the new address. QuotaShift never rewrites your `settings.json` on its own. |
| `, cleanup pending` | The settings revert failed (for example a managed key was edited); the message names the key. **Clean up** retries the revert. **Dismiss** stops tracking, leaves `settings.json` as is (token already revoked); remove `apiKeyHelper` / `ANTHROPIC_BASE_URL` yourself. After Dismiss, leftover keys are treated as your originals on a later reconnect. |

Behaviour and errors:

- If an account fails before any text or tool output, QuotaShift tries the next account in the pool (`precommit_failover` in `quotashift.log`). After content has started streaming a failure ends that response; there is no mid-stream switch.
- 429: `QuotaShift pool '<alias>' has no account with remaining quota. Switch this Claude slot to another pool in QuotaShift.` Map the slot to another pool or wait for quota.
- 502: `Every account in pool '<alias>' failed; last failure: <reason>.` Check the accounts.
- Both the 429 and the 502 carry `x-should-retry: false`, so Claude Code shows them at once instead of retrying for minutes.
- Other upstream error messages are passed through unchanged.

Manual verification steps: `docs/superpowers/plans/2026-10-26-claude-code-manual-check.md`.

### Routing key regeneration

Regenerating the routing secret key displays a confirmation dialog with an automated profile synchronization switch (default ON). When accepted:
- If ON, QuotaShift updates the routing key in `settings.json` for all QuotaShift-created Claude profiles and alerts with a toast listing updated profiles.
- If OFF or if no profiles exist, it regenerates the key and alerts with a standalone confirmation toast.

## v1.3.0 preference additions

| Key | Default | Semantics |
| --- | --- | --- |
| `quotashift_show_used_quota_v1` | true (Used) | Segmented Remaining/Used display for cards, overlay, taskbar and tooltip; alarms still reflect remaining quota. |
| `quotashift_multi_track_v2` | true | Track up to 3 accounts across providers simultaneously. |
| `quotashift_auto_monitor_on_apply_v1` | false | Add account to monitoring after a successful supported-provider Apply. Enabling turns on multi-account tracking. |
| `quotashift_unmonitor_same_provider_on_apply_v1` | false | On Apply, optionally untrack other monitored accounts of that provider before adding the target; never untrack other providers. |
| `quotashift_codex_model_routing_v1` | false | Show Codex Model Pools subtabs, card Model Routing authorization, and Claude's Connect to QuotaShift button. |
| `quotashift_in_app_shortcut_untrack_all` | `CommandOrControl+Shift+U` | Open the Untrack All confirmation dialog. |
| `quotashift_in_app_shortcut_zoom_in` | `CommandOrControl+=` | Increase main window zoom level. |
| `quotashift_in_app_shortcut_zoom_out` | `CommandOrControl+-` | Decrease main window zoom level. |
| `quotashift_in_app_shortcut_zoom_reset` | `CommandOrControl+0` | Reset main window zoom level to 100%. |

The three-account monitoring capacity is strict. If full, add-only mode does not evict an account.

## v1.3.0 local AI Agent API

The opt-in local AI Agent API (`Settings > Monitoring > AI Agent API` or `Background Services > Agent API > Configure`) exposes `http://localhost:<port>` (bound strictly to loopback `127.0.0.1:<port>`, default port `45692`, valid range `1024–65535`):

- **Non-backed-up local state (`localStorage`)**: `quotashift_agent_api_enabled_v1` (default `"false"`), `quotashift_agent_api_port_v1` (default `45692`), and `quotashift_agent_api_write_v2` (**Allow account rotation**, ON by default unless explicitly set `"false"`). Because the listener is a per-device privileged endpoint, these keys stay excluded from settings backups (`tests/shared/settings-backup-coverage.test.mjs`). `useAgentApiBridge` starts the listener automatically on app boot if `quotashift_agent_api_enabled_v1 === "true"`, republishes snapshots when account/cache/CLI-pool configuration changes, and executes `quotashift:agent-rotation` operations exclusively through a shared switch slot (`switchBusy`).
- **Header switch & confirmation**: Toggling the Agent API off from the modal header prompts a confirmation dialog (`Disable Agent API?`) before stopping the listener.
- **API key section**: Groups key management into a single row with the manual key input (`16–512` characters, no whitespace/control characters, editable while stopped) and four inline icon-only action buttons with tooltips (`Show`/`Hide`, `Copy`, `Rotate`, `Save`), backed by the OS keyring (`com.the-long-ride.quotashift.agent-api` / `agent-api-key-v1`).
- **Endpoints & reference**: `Endpoint` (`http://localhost:<port>` with a copy icon button when running, `Disabled` otherwise) and `Test API connection` share the same row. Below it, a collapsible `API endpoints (4)` panel documents `GET /v1/accounts`, `GET /v1/pools`, `POST /v1/rotation` (`mode=auto` or `mode=account`), and `GET /v1/operations/{id}` with parameters and sample JSON payloads. When expanded, the `API endpoints (4)` header sticks to the top while scrolling inside the reference and smoothly scrolls back to the toggle button on collapse. Read operations return account IDs and usage only (never emails or aliases).
- **Agent environment setup**: Copies a prompt-based setup snippet or runs user-scope setup directly in Terminal/PowerShell (`agent_api_run_env_setup`) using the saved keyring secret automatically, saving `QUOTASHIFT_AGENT_API_URL` and `QUOTASHIFT_AGENT_API_KEY` to user scope while printing the exact executed commands without writing the secret into script files.
- **Per-agent skills**: Displays install/uninstall `<CommonSwitch>` toggles for `Claude Code`, `Codex`, `Antigravity`, and `OpenCode` (`quotashift-rotation` canonical skill under `~/.agents/skills/quotashift-rotation`, synced per agent) alongside selectable slash command usage guidance (`/quotashift-rotation` in Claude Code / Antigravity / OpenCode and `$quotashift-rotation` or `/skills` in Codex). Managed skill tracking records installed content hashes so QuotaShift can cleanly overwrite older managed versions or remove unmodified managed files—including deleting the canonical `~/.agents/skills/quotashift-rotation` directory when all per-agent switches are disabled.

## Code map

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Settings Modal & Sections | `src/components/common/settings/{SettingsModal,BehaviorSettingsSection,AppearanceSettingsSection,ShortcutSettings,DataSettingsSection,LogsSettingsSection,HelpSettingsSection}.tsx` | Six-tab Settings dialog, poll warnings, appearance switches, shortcut binder, backup triggers, log viewer, support prompt |
| Reusable Setting Fields | `src/components/common/settings-fields/**`, `src/components/common/CommonSwitch.tsx` | Segmented quota mode (`Used`/`Remaining`), `AutoMonitorOnApplySetting`, `ClaudeResetCreditsSetting`, shared toggle switch |
| Settings State & Helpers | `src/utils/common/settings/**`, `src/hooks/common/**` | Poll interval clamps, `display-mode.ts` (`Taskbar` Windows default), shortcut registry/formatting, Claude preference sanitizers |
