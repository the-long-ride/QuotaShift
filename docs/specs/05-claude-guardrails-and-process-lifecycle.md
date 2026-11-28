---
schema_version: 1
id: workflow.claude-guardrails-lifecycle
title: "Claude Guardrails and Process Lifecycle"
kind: workflow
status: verified
summary: "Monitor-only multi-profile Claude discovery, request-anchored polling scheduler, reset-credit API with verified Desktop LevelDB fallback, and one-shot process suspend/auto-resume."
tags: ["claude", "guardrails", "process", "reset-credits", "leveldb"]
source_paths: ["src-tauri/src/claude/accounts.rs", "src-tauri/src/claude/accounts/discovery.rs", "src-tauri/src/claude/accounts/metadata.rs", "src-tauri/src/claude/accounts/resets/backoff_tests.rs", "src-tauri/src/claude/accounts/resets/cache.rs", "src-tauri/src/claude/accounts/resets/client.rs", "src-tauri/src/claude/accounts/resets/desktop.rs", "src-tauri/src/claude/accounts/resets/mod.rs", "src-tauri/src/claude/accounts/resets/parse.rs", "src-tauri/src/claude/accounts/resets/tests.rs", "src-tauri/src/claude/accounts/tests.rs", "src-tauri/src/claude/accounts/types.rs", "src-tauri/src/claude/connect/commands.rs", "src-tauri/src/claude/connect/connections.rs", "src-tauri/src/claude/connect/journal.rs", "src-tauri/src/claude/connect/journal_sync.rs", "src-tauri/src/claude/connect/launcher.rs", "src-tauri/src/claude/connect/mod.rs", "src-tauri/src/claude/connect/retire.rs", "src-tauri/src/claude/connect/service.rs", "src-tauri/src/claude/connect/settings_keys.rs", "src-tauri/src/claude/connect/settings_patch.rs", "src-tauri/src/claude/connect/tests/launcher_tests.rs", "src-tauri/src/claude/connect/tests/service_fix_tests.rs", "src-tauri/src/claude/connect/tests/service_port_tests.rs", "src-tauri/src/claude/connect/tests/service_tests.rs", "src-tauri/src/claude/connect/tests/test_support.rs", "src-tauri/src/claude/connect/tests/tests.rs", "src-tauri/src/claude/ide_process.rs", "src-tauri/src/claude/inventory/commands.rs", "src-tauri/src/claude/inventory/creation.rs", "src-tauri/src/claude/inventory/installations.rs", "src-tauri/src/claude/inventory/launcher.rs", "src-tauri/src/claude/inventory/mod.rs", "src-tauri/src/claude/inventory/profiles.rs", "src-tauri/src/claude/inventory/tests.rs", "src-tauri/src/claude/mod.rs", "src-tauri/src/claude/monitor.rs", "src-tauri/src/claude/monitor/bridge.rs", "src-tauri/src/claude/monitor/bridge_tests.rs", "src-tauri/src/claude/monitor/cli.rs", "src-tauri/src/claude/monitor/login_notice.rs", "src-tauri/src/claude/monitor/payload.rs", "src-tauri/src/claude/monitor/profile_snapshots.rs", "src-tauri/src/claude/monitor/status.rs", "src-tauri/src/claude/monitor/tests.rs", "src-tauri/src/claude/monitor/transcript.rs", "src-tauri/src/claude/monitor/transcript_cache.rs", "src-tauri/src/claude/monitor/transcript_index.rs", "src-tauri/src/claude/monitor/types.rs", "src-tauri/src/claude/monitor/usage_scheduler/control.rs", "src-tauri/src/claude/monitor/usage_scheduler/mod.rs", "src-tauri/src/claude/monitor/usage_scheduler/tests.rs", "src-tauri/src/claude/process.rs", "src-tauri/src/claude/process/auto_resume.rs", "src-tauri/src/claude/process/classify.rs", "src-tauri/src/claude/process/current.rs", "src-tauri/src/claude/process/journal.rs", "src-tauri/src/claude/process/native.rs", "src-tauri/src/claude/process/tests.rs", "src-tauri/src/system/retry_after.rs", "src/components/claude/ClaudeAccountCards.tsx", "src/components/claude/ClaudeAccountUsageMeter.tsx", "src/components/claude/ClaudeConnectIcon.tsx", "src/components/claude/ClaudeControls.tsx", "src/components/claude/ClaudeLogo.tsx", "src/components/claude/ClaudeRescanIcon.tsx", "src/components/claude/ClaudeResetUnavailableBadge.tsx", "src/components/claude/ClaudeResumeIcon.tsx", "src/components/claude/ClaudeStackedAvatar.tsx", "src/components/claude/ClaudeTab.tsx", "src/components/claude/ClaudeUnauthenticatedCardBody.tsx", "src/components/claude/claude-account-card-helpers.ts", "src/components/claude/index.ts", "src/components/claude/profiles/ClaudeAddAccountModal.tsx", "src/components/claude/profiles/ClaudeProfileCreationDialog.tsx", "src/components/claude/profiles/ClaudeProfileCreator.tsx", "src/components/claude/profiles/ClaudeProfileDetailDialog.tsx", "src/components/claude/profiles/ClaudeResetCreditsDialog.tsx", "src/components/claude/useClaudePreferencesDraft.ts", "src/components/claude/useClaudeTabReorder.ts", "src/components/claude/wizard/ClaudeCodePoolConnectWizard.tsx", "src/components/claude/wizard/ClaudeConnectionModeStep.tsx", "src/components/claude/wizard/ClaudeGatewayConnections.tsx", "src/components/claude/wizard/ClaudeWizardExperimentalDialog.tsx", "src/hooks/claude/gateway/useClaudeCodePoolConnector.ts", "src/hooks/claude/gateway/useClaudeGatewayConnections.ts", "src/hooks/claude/gateway/useClaudeProfilePaths.ts", "src/hooks/claude/useClaudeAccountMonitor.ts", "src/hooks/claude/useClaudeAccountOrdering.ts", "src/hooks/claude/useClaudeAccountRefresh.ts", "src/hooks/claude/useClaudeAccountResume.ts", "src/hooks/claude/useClaudeCurrentAccountResolver.ts", "src/hooks/claude/useClaudeMonitor.ts", "src/hooks/claude/useClaudeResetCredits.ts", "src/hooks/claude/useQuotaPollingRefreshOnToggle.ts", "src/hooks/claude/useTrackedClaudeAccountIds.ts", "src/utils/claude/claude-account-refresh.ts", "src/utils/claude/claude-account-types.ts", "src/utils/claude/claude-current-account.ts", "src/utils/claude/claude-formatters.ts", "src/utils/claude/claude-monitor-types.ts", "src/utils/claude/claude-profile-paths.ts", "src/utils/claude/claude-reset-credits.ts", "src/utils/claude/claude-tier-summary.ts", "src/utils/claude/claude-tier-tooltip.ts", "src/utils/claude/claude-usage-cache.ts", "src/utils/claude/guardrails/claude-guardrail-notification.ts", "src/utils/claude/guardrails/claude-guardrails.ts", "src/utils/claude/guardrails/claude-polling.ts", "src/utils/claude/index.ts"]
related_specs: ["architecture.system-overview", "architecture.security-credentials", "feature.provider-monitoring-switching", "architecture.desktop-shell-overlay", "interface.settings-configuration", "feature.codex-routing-pools"]
last_doc_update_at: "2026-11-28T21:18:00Z"
last_verified_at: "2026-11-28T21:18:00Z"
last_verified_code_commit: 50fc1bc4ced3f3dd3ce67b93b719ff25622d1b7c
last_source_change_commit: 50fc1bc4ced3f3dd3ce67b93b719ff25622d1b7c
last_source_change_at: "2026-11-28T21:18:00Z"
source_fingerprint: "sha256:ec9863485e4f164f7e9cfcd44fd80f0654a38107da0eb82fd3c2a9b4b1c05417"
---

# 05 — Claude Guardrails and Process Lifecycle

**Audience:** engineers & AI agents · **Verified against:** `1.3.3` · **Date:** 2026-11-28

Claude Code remains credential monitor-only while QuotaShift discovers local profiles, monitors local/CLI usage, fetches optional reset-credit availability, creates isolated launchers and Model Pools bindings, and suspends/resumes verified Claude-owned processes when quota guardrails trigger.

## Profile, identity, and visibility model

- **Profile identity**: profiles are keyed by normalized `CLAUDE_CONFIG_DIR` (`normalize_config_dir_key`: canonicalized path, `/` separators, lowercase on Windows) with deterministic IDs (`claude-<sha256[..16]>`). `~/.claude` maps to `Default`.
- **Automatic discovery (`src-tauri/src/claude/accounts/discovery.rs`)**: scans `~/.claude`, `~/.claude*` (excluding `.claude.json`), `~/.openclaude*`, multi-profile stores (`~/claude-profiles`, `~/.claude-profiles`, `~/.quotashift/claude-profiles` harmonized with `managed_profile_root()`, `~/.ccs/instances`, `~/.agentsroom/claude-profiles`), shell startup files (`.zshrc`, `.bashrc`, `.bash_profile`, `.profile`, `.zprofile`, `.config/fish/config.fish`, PowerShell `Microsoft.PowerShell_profile.ps1` and `profile.ps1` under `Documents/PowerShell` and `WindowsPowerShell`), and `config.json` (`home`, `~/.quotashift`, `cwd`) for `enabled_profiles` and `profiles_config`.
- **Manual custom roots**: additional directories can be added and persisted locally in `quotashift_claude_manual_profile_paths_v1`.
- **Credential & identity boundary (`accounts/metadata.rs`)**: reads `.credentials.json` or macOS Keychain (`Claude Code-credentials-<sha256[..8]>`), accepts populated `claudeAiOauth` OAuth sessions even when `subscriptionType` is `null` (falling back to top-level `subscriptionType`), and resolves identity from `.claude.json` / `~/.claude.json` `oauthAccount`. Secret token fields are never serialized, logged, or named in `metadata.rs`/`types.rs`. Managed profiles under `~/.quotashift/claude-profiles` containing `settings.json` with no OAuth credentials are emitted immediately as unauthenticated cards (`authenticated: false`, `launcherCommand: "claude-<name>"`, `source: "managed"`) unless `settings.json` indicates a Model-Pool gateway-only profile (`apiKeyHelper` or `env.ANTHROPIC_BASE_URL`). Unauthenticated cards render via `ClaudeUnauthenticatedCardBody` (`"Not signed in"`, copyable `account.launcherCommand`, clickable `account.configDir`, and sign-in hint while retaining `.claude-account-folder-btn`), omit double-click monitoring, polling switch, reset badges, refresh, and resume buttons, and upgrade in-place with the exact same `id` after sign-in; `ClaudeProfileCreationDialog` invokes `onProfileCreated` (`handleRescanProfiles` in `ClaudeTab`) on successful creation and on close only if a profile was created during that dialog session.
- **Tier normalization, sub-tiers, usage meter & collapsed folder action (`src/utils/claude/claude-tier-summary.ts`, `claude-tier-tooltip.ts`, `src/components/claude/{ClaudeAccountCards,ClaudeAccountUsageMeter}.tsx`)**: canonical tier summary classifies into `FREE`, `PRO`, `MAX`, `TEAM`, `ENTERPRISE`, and `OTHER`; `metadata.rs` prefers `userRateLimitTier` over `rateLimitTier`, and `resolveClaudeDisplayTier(subscriptionType, rateLimitTier)` resolves card/overlay display badges (`Max 20x`, `Max 5x`, `PRE` for `5x`/`20x`/premium Team seats, `STD` for standard/default Team seats including `default_raven`) with `tierBadgeSlug` CSS styling and multiline hover tooltips comparing against individual Pro (`1×`). `ClaudeAccountUsageMeter` renders shared `useQuotaPercentMode` / `getUsageTone` meters, and collapsed (`compact`) Claude cards render a 22×22px right-most Open Home Folder button (`.claude-account-folder-btn` using `OpenLocationSvgIcon`) calling `open_path_in_file_manager(account.configDir)`.
- **Master runtime gate**: Claude platform visibility (`platformVisible`) drives `set_claude_features_enabled` in Rust (`ClaudeUsageScheduler::enabled`). Hidden Claude disables frontend polling, guardrail evaluation, statusline bridge setup, usage event handling, manual/overlay refresh, and backend auto-resume checks, and clears queued scheduler requests.

## Usage sources and frontend retention cache

- **Official-first `statusLine` bridge (default + managed profiles) & local transcripts (`src-tauri/src/claude/{accounts.rs,monitor.rs}`, `monitor/{bridge,bridge_tests,profile_snapshots}.rs`, `monitor/transcript*.rs`)**:
  - `get_claude_account_statuses` installs QuotaShift's `--claude-statusline-bridge` hook idempotently via `ensure_claude_statusline_bridge_for_dir` only for authenticated profiles whose `config_dir` is the default `~/.claude` or a QuotaShift-managed profile under `~/.quotashift/claude-profiles` (`is_default_config_dir` / `discovery::is_managed_profile_dir_at`), skipping third-party/external/manual profile stores while preserving existing options and saving prior `statusLine` commands under `~/.quotashift/claude-statusline-previous/<hash>.json` (or `~/.quotashift/claude-statusline-previous.json` for `~/.claude`).
  - Executing `--claude-statusline-bridge` resolves active `CLAUDE_CONFIG_DIR` (defaulting to `~/.claude`), writes per-profile snapshots atomically to `~/.quotashift/claude-profile-sessions/<hash>.json` (and updates legacy `~/.quotashift/claude-session.json` for `~/.claude`), and chain-forwards to that profile's saved previous `statusLine` command.
  - `get_claude_account_statuses` ingests per-profile `statusLine` snapshots for all authenticated profiles (and `get_claude_reset_credits` ingests piggybacked `five_hour`/`seven_day` windows from `/api/oauth/usage`) into `ClaudeUsageScheduler` via `ingest_external_snapshot`.
  - Local JSONL transcripts are scanned incrementally (`parsed_len`, 2s `TRANSCRIPT_CACHE`).
- **Live quota probe fallback (`monitor/cli.rs`, `monitor/login_notice.rs`, `monitor/usage_scheduler/control.rs`)**: invokes `claude -p /usage` with `CLAUDE_CONFIG_DIR` (`CREATE_NO_WINDOW` on Windows) on manual Refresh or when `is_cli_probe_needed` determines a profile has no fresh external snapshot within the user's configured `idlePollInterval` (or its cached 5-hour `resets_at` has passed). Unauthenticated profiles are skipped. If `/usage` yields no quota lines, probing errors and triggers at most one OS login notification per launch (`notify_not_logged_in_once`).
- **Renderer usage cache (`src/utils/claude/claude-usage-cache.ts`)**: `quotashift_claude_usage_cache_v1` retains `fiveHour` and `sevenDay` snapshots for up to 7 days, discarding windows whose `resetsAt <= nowSecs`. Retained entries refill missing live windows with `usageFresh: false` for display only and are never evaluated by guardrails.

## Polling precedence, scheduler, and adaptive backoff

1. Hidden Claude: no Claude polling (`set_claude_features_enabled(false)` clears scheduler queue).
2. Visible and either guardrail enabled: with **Only watch running Claude accounts** on, profiles mapped to a running Claude process use the dedicated Claude cadence (`pollIntervalSecs`); inactive profiles use the **Other idle accounts** cadence (`idlePollIntervalSecs`), even when tracked. With the setting off, active and explicitly tracked profiles use the dedicated Claude cadence when eligible.
3. Visible, guardrails off, explicitly tracked profiles: global tracked-account cadence (`pollIntervalSecs`). When multiple Claude accounts are tracked, all monitored account IDs (`monitored_account_ids`) are passed to `get_claude_account_statuses`, ensuring every tracked account receives the monitored cadence. (`useClaudeMonitor` also syncs `set_poll_interval` when `platformVisible && trackedProvider === "claude" && guardrailsActive`.)
4. Other visible profiles, including inactive, untracked, or process-suspended profiles: **Other idle accounts** cadence (`idlePollIntervalSecs`).

Scheduler & timing rules:

- `ClaudeUsageScheduler` (`src-tauri/src/claude/monitor/usage_scheduler/mod.rs`) runs a single `VecDeque` worker that coalesces duplicate profile requests, anchors `next_due_at = requested_at + interval` so long-running probes do not cause skipped ticks, preserves the last-good snapshot on error, and emits `claude-account-usage-updated`.
- `get_claude_account_statuses` clamps `max_age_secs` (default `60`) and `idle_poll_interval_secs` to `1..1200`; `useClaudeAccountMonitor` passes `maxAgeSecs = pollIntervalSecs` and `disabled_account_ids` (`guardrailsActive ? [] : loadDisabledQuotaPollingIds("claude")` from `quotashift_quota_polling_disabled_v1`). Authenticated Claude cards render `<AccountQuotaPollingSwitch required={monitored || guardrailsActive} />`; idle/scheduled probes skip disabled accounts unless forced, targeted manually, monitored, or `guardrailsActive` (`useClaudeMonitor` calls `enableAllQuotaPolling("claude", ...)` when Guardrails enable, and `useQuotaPollingRefreshOnToggle` reacts to `QUOTA_POLLING_CHANGED_EVENT`).
- **Adaptive polling & low-usage resource saver (`src/utils/claude/guardrails/claude-polling.ts`)**: when `guardrailsActive || reduceLowUsageFrequency` (except when `!guardrailsActive && monitoredAccountIds.length > 0`), `claudeAdaptivePollIntervalSecs` backs off by `0.15` per `10%` step outside the eager margins (`10%` below 5-hour threshold, `3%` below weekly threshold, capped at `1200s`). When **Reduce frequency refresh claude code usage** (`quotashift_claude_reduce_low_usage_frequency`, OFF by default) is enabled and accounts are safely outside the eager zone with usage below `10%`, the interval is multiplied by at least `5x` and clamped to `300s–1200s`.

Defaults and bounds:

- Claude guardrail poll (`quotashift_claude_poll_interval_secs`): `20s` default, `5s–1200s` allowed.
- Global tracked poll: `30s` default.
- Other idle accounts: `600s` default.
- Optional low-usage resource saver: OFF by default; reduces eligible polling when usage is below 10% of limit.

Per-account manual Refresh is disabled while that profile is process-suspended. `useClaudeAccountRefresh` always clears its loading state after success or failure.

## Optional reset-count monitoring (`cedar_ember`) and fallback

- **Opt-in gate (`Settings > Monitoring > Show Claude reset count`)**: stored in `quotashift_claude_reset_credits_enabled_v1` (default OFF). Turning OFF stops all queries and hides reset badges in account cards, the overlay, and the taskbar.
- **Polling (`src/hooks/claude/useClaudeResetCredits.ts`)**: when ON, queries `get_claude_reset_credits` every 3 hours (`3 * 60 * 60 * 1000` ms) across authenticated non-`claude-local` `accountStatuses`, honors `isQuotaPollingEnabled("claude", id)`, skips background sweeps when `document.hidden` (unless tracked), staggers multi-account sweeps (`2.5s` + jitter), syncs manual refreshes via `CLAUDE_RESET_CREDITS_UPDATED_EVENT`, preserves last-known valid counts as `stale: true` on 429/errors, and logs skips/failures under `claude:resets`.
- **Read-only CLI endpoint (`src-tauri/src/claude/accounts/resets/client.rs`)**: sends a read-only `GET` (10s timeout) to `https://api.anthropic.com/api/oauth/usage?cedar_ember=1&skip_spend=1` with `anthropic-beta: oauth-2025-04-20` and `User-Agent: claude-cli/{version} (external, cli)`, returning both reset grants and extracted `five_hour`/`seven_day` windows (`reset_credits_outcome_for_config`) plus parsed `Retry-After` headers on HTTP 429. Discovers the installed CLI version once (`CLI_VERSION`) checking direct `claude --version`, `shell_version()` (`cmd /C` / `sh -lc`), and `cli_fallback_paths` (`%APPDATA%\npm\claude.cmd`, `~/.local/bin/claude(.exe)`, `/usr/local/bin/claude`, `/opt/homebrew/bin/claude`). Expired tokens (`expiresAt <= now_ms`) return `"token_expired"` without refreshing; tokens and response bodies are never logged or read as error text.
- **Grant filtering, persistent 3h cache & 429 backoff (`resets/parse.rs`, `resets/cache.rs`, `resets/mod.rs`, `system/retry_after.rs`)**: `live_grant` ignores paused, expired (`ends_at <= now`), future (`starts_at > now`), or zero-remaining grants. Definitive results (`"available"`, `"none"`, `"surface"`) persist in `~/.quotashift/claude-reset-cache.json` for **3 hours (`10_800s`)**; non-429 cached results invalidate when `!entry.credits.stale && has_expired_grant`; transient non-429 failures back off for **90s** (`FAILURE_CACHE_TTL_SECS`); HTTP 429 parses `Retry-After` (`300s` floor, `21_600s` cap) combined with persistent `15m→30m→1h→2h→4h` exponential backoff (`record_429_backoff`) and a shared 10-minute `provider_circuit_until` (`PROVIDER_CIRCUIT_BREAKER_SECS = 600`) checked via `effective_retry_after`. Active 429 cooldowns cannot be bypassed even when `force = true` (`FORCE_COOLDOWN_SECS = 60` gates other forced refreshes). `.credentials.json` mtime changes invalidate only `"token_expired"` entries so active 429 cooldowns and fresh caches are never cleared; last-known valid `count`/`grants` are preserved (with expired grants pruned) marked `stale: true` + `retryAfterAt` instead of erasing to `RC?`.
- **Verified Claude Desktop LevelDB fallback (`resets/desktop.rs`)**: during active per-account 429 or `provider_circuit_until` backoff (`in_backoff`), or when `fetch_fresh_remote` returns `"ineligible"`, `"unavailable"`, or any `Err(_)` (including `http_429`, `network_error`, `token_expired`, `no_credentials`, `cli_version_unknown`), QuotaShift performs a read-only scan of Claude Desktop's `Local Storage/leveldb` (`.ldb` and `.log` files sorted newest mtime first under `%APPDATA%\Claude\Local Storage\leveldb`, `~/Library/Application Support/Claude/Local Storage/leveldb`, or `~/.config/Claude/Local Storage/leveldb`; never touches `Cookies`). A fallback entry is accepted only when `expected_email` matches case-insensitively and embedded `"cedar_ember"` JSON (`MAX_BACKWARD_SCAN_BYTES = 32_768`, `MAX_FORWARD_SCAN_BYTES = 65_536`) yields `status` `"available"` or `"none"`.
- **UI & overlay badges**:
  - Account cards (`ClaudeAccountCards.tsx`) render a background `<ClaudeLogo>` behind the foreground alias initial letter in `.claude-card-avatar`, show `<AccountResetCount>` when `status` is `"available"` or `"none"` (including stale-429 rate-limit tooltips; `count > 0` opens `ClaudeResetCreditsDialog`), and render `<ClaudeResetUnavailableBadge>` (`RC?`) when `status` is `"ineligible"` or `"unavailable"`.
  - `ClaudeResetUnavailableBadge.tsx` tooltips distinguish `reason === "surface" || reason === "cli_version"` from other reasons, include `${reason}` (and retry time when rate-limited), and clarify `this does not mean 0 remaining resets`.
  - `ClaudeResetCreditsDialog.tsx` displays `Unknown` when count is unavailable, surfaces a stale/rate-limit retry banner when `stale`/`retryAfterAt` is set, provides a manual Refresh action, and offers an **Open Claude Usage Settings** button (`https://claude.ai/settings/usage`) when `status` is `"ineligible"` or `"unavailable"`.
  - Overlay/taskbar fields (`resetCreditsToOverlayFields`) publish `resetCount` and `resetNearestExpiresAt` only when `status === "available"`.

## Processing-account guardrail scope

The **Only watch running Claude accounts** preference defaults on (`quotashift_claude_only_watch_processing_accounts_v1`). When on, guardrail usage checks and automatic suspension apply only to discovered profiles with a running Claude process mapped to their config directory. A process can be idle at its prompt and still count as running. Inactive profiles continue to refresh at the **Other idle accounts** cadence and cannot trigger automatic guardrail suspension. Turning the setting off restores guardrail monitoring for every discovered account. Explicit manual refresh remains available when an account is inactive.

The collapsed `ClaudeControls` header summarizes auto-resume, running-account scope, polling rate, and enabled thresholds. Overlay guardrail badge tooltips use concise `Auto-suspend at N%` wording for the 5-hour and weekly limits.

## Guardrail windows

There is no separate master guardrail source of truth. The derived `enabled` state is `true` when either window switch is enabled (`fiveHour.enabled || weekly.enabled`).

| Window | Default enabled | Default threshold | Allowed range | Storage keys |
| --- | --- | --- | --- | --- |
| 5-hour | `false` | `95%` used | `1–100%` | `quotashift_claude_five_hour_stop_enabled`, `quotashift_claude_five_hour_stop_threshold_pct` |
| Weekly | `false` | `98%` used | `1–100%` | `quotashift_claude_weekly_stop_enabled`, `quotashift_claude_weekly_stop_threshold_pct` |

Stale (`!usageFresh`), errored (`error != null`), or missing usage cannot trigger a suspension decision. Retained cache snapshots (kept when `/usage` returns no quota lines) are display-only and never evaluated.

## Suspension lifecycle

### Process classification and exclusion (`process/classify.rs`, `ide_process.rs`)

- **Excluded**: current PID, PID `0`, QuotaShift usage probes (`is_claude_usage_probe`), `quotashift`, and IDE hosts (`is_ide_host_process`: VS Code, Insiders, Cursor, Windsurf, VSCodium, Codium, Zed, Visual Studio, JetBrains IDEs, `* helper`, and non-Claude `extensionHost`).
- **Targeted**: CLI, Claude Desktop, agent/LSP binaries (`claude-agent`, `claude-language-server`, `claude-ls`, `claude-lsp`), and Claude IDE backend processes (`is_claude_ide_backend_process`).
- **Profile mapping**: resolved via `CLAUDE_CONFIG_DIR`, command-line directory match, transitive parent-PID inheritance, or default `~/.claude` fallback for CLI/Desktop.

### Trigger and suspension sequence

When a fresh enabled window crosses its configured threshold (enforcing a 30s per-account cooldown in `useClaudeAccountMonitor`):

1. QuotaShift resolves target processes belonging to the profile and verifies identity (`pid` + `start_time`).
2. It suspends Claude-owned processes (`Windows`: `NtSuspendProcess` / `NtQueryInformationThread` suspend count `35`; `Unix`: `SIGSTOP` / `ProcessStatus::Stop|Tracing`) without suspending IDE hosts or usage probes.
3. It writes `{app_data_dir}/claude-suspensions.json` atomically (`process/journal.rs`, returning `persistenceError` on failure). On startup, `restore_claude_suspension_journal` (`app/setup.rs`) keeps entries whose `pid + start_time` match and `is_process_still_suspended != Some(false)`.
4. Guardrail switches (`enabled`, `fiveHour.enabled`, `weekly.enabled`) are disabled as a one-shot safety action via `saveClaudePreferences`, breaking after the first fired account in a pass; `!guardrailsPersisted` or `persistenceError` warnings are surfaced.
5. In-app toast and native desktop notifications (`show_desktop_notification` with plugin fallback) report the suspension.

## Resume

### Manual

Before resuming via `resume_claude_account_processes`, QuotaShift verifies that the recorded `pid` still matches the expected `start_time` and resolved profile key before issuing OS resume (`NtResumeProcess` / `SIGCONT`).

### Auto-resume at reset (`process/auto_resume.rs`)

- OFF by default (`quotashift_claude_auto_resume_at_reset_v1`).
- Background worker checks every `30s` (`AUTO_RESUME_CHECK_SECS`), running only while `scheduler.is_enabled()` (Claude platform visibility is enabled).
- Requires `auto_resume == true` and trustworthy `reset_at` timestamps for every triggered window (`auto_resume_deadline()` takes the maximum `reset_at`).
- Missing, stale, or errored reset telemetry fails closed and leaves processes suspended.
- Before resuming each entry, verifies `pid`, `start_time`, and resolved profile key match.
- Partial resume (`retry` non-empty) preserves the remaining suspension state until all recorded processes resolve; complete resumption clears the profile entry and queues an immediate forced usage probe (`scheduler.request_profiles(..., 1, true)`).

## Overlay synchronization

`syncClaudeGuardrailsToOverlay` (`src/utils/common/overlay/claude-overlay-sync.ts`) updates `quotashift_overlay_data` with guardrail display settings only when `provider === "claude"`. Existing non-Claude overlay payloads are left unchanged. `app-overlay-helpers.ts` handles both legacy `claude-local` and per-account `buildClaudeAccountOverlayPayload` payloads.

## Profile inventory, launchers, and Model Pools connection

- **Managed isolated profiles (`src-tauri/src/claude/inventory/*`)**: created under `~/.quotashift/claude-profiles` (`prof_<base64url(sha256(canonical)[0..8])>`, name 1–48 `[a-zA-Z0-9_-]`) using `Default` or `CopySettings` (13-key safe whitelist), rejecting WSL paths.
- **Executable launchers**: creates `~/.quotashift/bin/claude-{name}.cmd` (clearing `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY` and updating HKCU `Environment\Path` on Windows). `ClaudeProfileDetailDialog` displays the copyable `.quotashift\bin\{profile_executable}` path and provides `Save settings` (`save_claude_profile_settings`) and `Restore to default` (`restore_claude_profile_settings`).
- **Model Pools connector (`src-tauri/src/claude/connect/*`, `src/components/claude/wizard/*`, `src/hooks/claude/gateway/*`)**:
  - `launch-once`: creates an ephemeral `:launch-once` client binding, retires older ephemeral bindings, and spawns Claude (`CREATE_NEW_CONSOLE` on Windows) with gateway `ANTHROPIC_BASE_URL` and token env vars.
  - `persistent-profile`: requires `fixed_port`, patches `settings.json` (`apiKeyHelper` invoking `--claude-gateway-token`, `env.ANTHROPIC_BASE_URL`, model slot env vars, `CLAUDE_CODE_AUTO_MODE_SERVER=0`, `CLAUDE_CODE_ATTRIBUTION_HEADER=0`, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, context/thinking/`effortLevel`), and writes an atomic rollback journal under `{gateway_store_parent}/claude-connect-journals/{binding_id}.json` (CAS conflict detection excludes `effortLevel` and `env.CLAUDE_CODE_EFFORT_LEVEL`).
  - Regenerating a Model Pool routing key propagates to patched Claude profile `settings.json` and active `ClientBinding` secrets via `update_claude_profiles_routing_key`.
  - Disconnecting a binding from `ClaudeGatewayConnections` calls `disconnect_claude_code` and attempts `delete_claude_profile` if the target is managed.

**Next →** [06 — Settings and Configuration](06-settings-and-configuration.md)

## Code map

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Discovery, Resets & Desktop Fallback | `src-tauri/src/claude/accounts/{discovery,metadata}.rs`, `resets/{mod,client,parse,desktop}.rs` | `CLAUDE_CONFIG_DIR` scan, Keychain/`.credentials.json` metadata, `cedar_ember` OAuth poll, read-only Claude Desktop LevelDB fallback |
| Monitor & Scheduler | `src-tauri/src/claude/{monitor,monitor/{bridge,cli,login_notice,transcript*},monitor/usage_scheduler/*}.rs` | `ClaudeUsageScheduler` (`next_due_at = requested_at + interval`), statusline hook, JSONL transcript tailing, login notice |
| Process Guardrails & Auto-Resume | `src-tauri/src/claude/{process,process/*,ide_process}.rs` | PID + `start_time` + profile verification, `NtSuspendProcess`/`SIGSTOP`, `claude-suspensions.json`, 30s auto-resume worker |
| Profiles, Launchers & Gateway Connect | `src-tauri/src/claude/{inventory,connect}/**` | Managed `.quotashift/claude-profiles`, `.cmd` launchers, `launch-once` & `persistent-profile` bindings |
| Claude Frontend UI, Hooks & Utils | `src/components/claude/**`, `src/hooks/claude/**`, `src/utils/claude/**` | Profile cards, `RC?` badge & `ClaudeResetCreditsDialog`, adaptive/low-usage polling, retention cache, Connect Wizard |
