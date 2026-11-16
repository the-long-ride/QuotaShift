---
schema_version: 1
id: feature.provider-monitoring-switching
title: Provider Monitoring and Switching
kind: feature
status: verified
summary: "Antigravity, OpenAI Codex, and Claude Code usage normalization, tier classification, native session capture, keep-alive workers, and restart-on-switch flows."
tags: ["providers", "antigravity", "codex", "claude", "quota", "switching"]
source_paths: ["src-tauri/src/antigravity/exact.rs", "src-tauri/src/antigravity/keep_alive.rs", "src-tauri/src/antigravity/keep_alive/registry.rs", "src-tauri/src/antigravity/keep_alive/tests.rs", "src-tauri/src/antigravity/mod.rs", "src-tauri/src/antigravity/quota.rs", "src-tauri/src/antigravity/quota/available.rs", "src-tauri/src/antigravity/quota/normalize.rs", "src-tauri/src/antigravity/quota/tests.rs", "src-tauri/src/antigravity/quota/window.rs", "src-tauri/src/antigravity/remote.rs", "src-tauri/src/antigravity/remote/logging.rs", "src-tauri/src/antigravity/remote/platform.rs", "src-tauri/src/antigravity/token.rs", "src-tauri/src/antigravity/usage.rs", "src-tauri/src/antigravity/usage/parser.rs", "src-tauri/src/antigravity/usage/tests.rs", "src-tauri/src/antigravity/worker.rs", "src-tauri/src/antigravity/worker/ops.rs", "src-tauri/src/antigravity/worker/process.rs", "src-tauri/src/antigravity/worker/profile.rs", "src-tauri/src/antigravity/worker/tests.rs", "src-tauri/src/quota/mod.rs", "src-tauri/src/quota/parser.rs", "src-tauri/src/quota/parser/buckets.rs", "src-tauri/src/quota/parser/models.rs", "src-tauri/src/quota/parser/tests.rs", "src-tauri/src/quota/quota.rs", "src-tauri/src/quota/refresh.rs", "src/components/antigravity/AntigravityAccountActions.tsx", "src/components/antigravity/AntigravityCardHeader.tsx", "src/components/antigravity/AntigravityCardPlan.tsx", "src/components/antigravity/AntigravityEmptyState.tsx", "src/components/antigravity/AntigravityExactErrorBanner.tsx", "src/components/antigravity/AntigravityIcons.tsx", "src/components/antigravity/AntigravityQuotaRows.tsx", "src/components/antigravity/AntigravityTab.tsx", "src/components/antigravity/index.ts", "src/components/antigravity/modal/AddAntigravityAccountModal.tsx", "src/components/antigravity/modal/AntigravityCaptureTab.tsx", "src/components/antigravity/modal/AntigravityModalFooter.tsx", "src/components/antigravity/modal/AntigravityModalTabs.tsx", "src/components/antigravity/modal/AntigravityOAuthStepView.tsx", "src/components/antigravity/modal/antigravity-card-helpers.ts", "src/components/antigravity/modal/antigravity-tab-types.ts", "src/components/antigravity/modal/useLocalAntigravitySession.ts", "src/hooks/antigravity/useAntigravityAccountOps.ts", "src/hooks/antigravity/useLocalSession.ts", "src/utils/antigravity/antigravity-keep-alive.ts", "src/utils/antigravity/app-antigravity-ops.ts", "src/utils/antigravity/capture-account-ops.ts", "src/utils/antigravity/capture-import.ts", "src/utils/antigravity/current-local-session.ts", "src/utils/antigravity/index.ts", "src/utils/antigravity/local-antigravity-session.ts", "src/utils/antigravity/quota/antigravity-exact-ops.ts", "src/utils/antigravity/quota/antigravity-exact.ts", "src/utils/antigravity/quota/antigravity-quota-carry.ts", "src/utils/antigravity/quota/antigravity-quota.ts", "src/utils/antigravity/quota/antigravity-tier-summary.ts"]
related_specs: ["architecture.system-overview", "architecture.security-credentials", "architecture.desktop-shell-overlay", "workflow.claude-guardrails-lifecycle", "feature.codex-routing-pools", "feature.agent-api-cli-failover"]
last_doc_update_at: "2026-11-15T18:57:14Z"
last_verified_at: "2026-11-16T08:05:00Z"
last_verified_code_commit: 7a0913bd6c2aca62395d780a783ed20d078d2635
last_source_change_commit: 87e44a844f42ca07d2a4dd7f09fe7cb213bf84e3
last_source_change_at: "2026-11-16T01:57:07+07:00"
source_fingerprint: "sha256:fa2da61e486b1e318168a019f0fb2e12165a0d68eee17e0703c722ac0856624f"
---

# 03 — Provider Monitoring and Switching

**Audience:** engineers & AI agents · **Verified against:** `1.3.0` · **Date:** 2026-11-16

## Provider capability matrix

| Capability                 | Antigravity     | OpenAI Codex             | Claude Code                   |
| -------------------------- | --------------- | ------------------------ | ----------------------------- |
| Usage monitoring           | Yes             | Yes                      | Yes                           |
| Account switching          | Yes             | Yes                      | No — monitor-only credentials |
| Local active detection     | IDE/CLI session | Codex session/auth state | CLI/profile process state     |
| Pool routing               | No              | Yes                      | No                            |
| Process guardrails         | No              | No                       | Yes                           |
| Persistent card order/sort | Yes             | Yes                      | Yes                           |

## Shared account behavior

- Provider cards support persistent ordering and one-shot sorting (`AccountSortMenu`) by alias, email, tier, normalized usage, and last used. Sorting is disabled while search or tier filtering is active so filtered subsets never overwrite the full saved order.
- Applying a supported Antigravity or Codex account updates Last used immediately. Startup/idle reconciliation also marks the locally active account/profile when it can be identified.
- Compact and expanded modes share global remaining-usage tones: `<20%` warning orange and `<10%` critical red.
- Codex compact cards expose a second metadata row in the order `tier - email … last used`.
- Account cards, overlay badges, and overlay tooltips use the same provider-specific canonical tier classifier (`computeAntigravityTierSummary` for Antigravity) and the freshest detected provider plan rather than separate display heuristics.
- Canonical display tiers are: Antigravity `FREE / PLUS / PRO / ULTRA`; Codex `FREE / GO / PLUS / PRO / BUSINESS / ENTERPRISE / EDU / API`; Claude `FREE / PRO / MAX / TEAM / ENTERPRISE`. Legacy ChatGPT `Team` is normalized to the current `BUSINESS` name.
- When navigating from the overlay HUD, taskbar strip, or context menus, `scrollToAccountCard` automatically switches to the account's provider tab, smoothly centers the card within its scroll container, and applies the `.account-card--focused` visual attention highlight.

## 1. Antigravity

### Usage

- Quota is obtained through two complementary paths:
  - **Cloud/API path** (`src-tauri/src/antigravity/remote.rs`, `usage.rs`, `quota.rs`, `src-tauri/src/quota/refresh.rs`): queries `loadCodeAssist`, `retrieveUserQuotaSummary` (`daily-cloudcode-pa.googleapis.com`, falling back to project URL), and `fetchAvailableModels` with a 10s timeout, `User-Agent: antigravity/cli/{version} {platform}`, and `X-Client-Name: antigravity`.
  - **Isolated local worker path** (`src-tauri/src/antigravity/worker/`, `exact.rs`, `src-tauri/src/quota/parser.rs`): launches headless/minimized Antigravity instances under per-account directories (`~/.quotashift/antigravity-workers/{sanitized_account_id}`) with `worker-marker.json` (`WORKER_SCHEMA_VERSION = 1`, `ownership_nonce`) and SQLite credentials written via JSON stdin (`write_worker_vscdb.py`). Exact refreshes run sequentially under an `AtomicBool` lock, verify email parity against `expected_email` (`parse_exact_status`), and strictly terminate only `owned_process_ids`. Persistent workers (`quotashift_antigravity_persistent_workers_v1`, default `false`) cap auto-restarts at `MAX_PERSISTENT_RESTARTS = 3` within `600s` (reset by `stop_all`).
- OAuth token refresh proactively triggers `< 300s` before JWT `exp` without narrowing scopes, trying `[consumer, original, enterprise]` fallback order based on `auth_method`.
- Cloud usage is sanitized and grouped into model pools: **Gemini Models** (`gemini-5h` / `gemini-weekly`), **Claude & OpenAI Models** (`3p-5h` / `3p-weekly`), and dynamically **Gemini 4 Argon**.
  - A valid `fetchAvailableModels` catalog is authoritative for Gemini and Claude/OpenAI pool membership, including an empty catalog (`isInternal` models ignored). `retrieveUserQuotaSummary` supplies usage values but cannot restore a family absent from the catalog; missing or malformed catalogs fall back to quota-reported families, and API failures retain cached usage.
  - When `retrieveUserQuotaSummary` omits explicit Argon buckets while returning user buckets, `shares_gemini_quota` compares catalog Argon buckets against Gemini (fraction delta `<= 0.01` or equal rounded percent, and reset delta `<= 120s`). Ultra-style shared accounts merge Argon into Gemini; independent Pro-style Argon emits a weekly-only **Gemini 4 Argon** pool (filtering out 5h-classified catalog resets).
- Frontend quota normalization (`carryForwardQuotaLanes`) replaces stale arrays with fresh responses, retains missing 5-hour/weekly lane values only until their recorded reset timestamp expires, and retains depleted (`weeklyPercent === 0`) **Gemini 4 Argon** lanes across responses omitting Argon until reset expires, tagged `quotaCarried: true` (display-only; never treated as fresh rotation evidence).
- Gemini-only account cards use the Codex-style two-column 5-hour/weekly layout in expanded and compact modes, without Gemini or Claude/OpenAI headings or icons. Both windows remain visible; missing lane values are marked unavailable rather than inferred. Cards with multiple pools render grouped family rows (`.antigravity-quota-group--argon` shows a single `Argon` Weekly bar).
- Antigravity card headers intentionally omit retrieval-source badge icons, display `Last exact <datetime>` when a prior exact snapshot exists and the current source is not `"exact"`, and surface `ReauthenticateAccountButton` / `AntigravityExactErrorBanner` on suspension or re-auth errors.
- Successful refresh logging is one concise masked-account summary (`he***il@domain`). Routine successful low-level HTTP lines are omitted; failures remain diagnostic.
- Multi-account keep-alive (`src-tauri/src/antigravity/keep_alive.rs`, `DEFAULT_INTERVAL_MINS = 240`) regularly verifies quota and maintains fresh OAuth sessions for all saved Antigravity accounts, emitting `antigravity-keep-alive-tokens` back to frontend storage.

### Apply and restart on switch

Applying an Antigravity account refreshes usable OAuth state, updates the supported local session representation (`switch_antigravity_account`), and recycles only QuotaShift-owned/targeted helpers as required. Secrets sent to SQLite helper scripts use JSON stdin. When invoked without confirmation (`skipConfirm`, such as via the local AI Agent API), any IDE/desktop/CLI restart failure throws an error so automated rotations do not report success after partial restart failure. If `autoMonitorOnApply` is enabled, the applied account is added to the monitored list (up to 3 accounts).

When experimental **Restart running app on switch** (`quotashift_restart_on_switch_v1`) is enabled:

- Running Antigravity IDE and desktop app processes are closed and reopened.
- A running `agy` CLI session is detected with its active directory, process parameters, and active conversation ID (`src-tauri/src/system/cli_restore/`). On Windows, QuotaShift captures a live snapshot, stops the process, and attempts to resume the conversation directly within the active Windows Terminal tab or console window, or respawns it using `--resume <conversation_id>`. When several instances run in the same folder, conversations are assigned newest process first so each keeps its own and none is shared. Value-taking Codex flags (`--add-dir`, `--local-provider`, `--enable`, `--disable`, `-m`, `-c`, and similar) keep their operand in the rebuilt command. Non-Windows platforms or non-running sessions are left untouched.
- The outcome and CLI resumption status (e.g., resumed in same tab or reopened in a new tab) are reported in the switch confirmation message and toast notification.
- Apps and sessions that are not running are left alone.
- The Apply confirmation dialog explicitly informs the user which running targets will be restarted.

### Capture

Add Account reads the shared Antigravity 2.0/agy session and older IDE SQLite profiles, then imports distinct identities into the saved list without applying them (`importCapturedAntigravityAccounts` / `uniqueCapturedAntigravityAccounts`). The capture label is optional; the account name or email supplies a fallback. `AddAntigravityAccountModal` tags accounts with `authSource` (`"native_capture"` vs `"browser_oauth"`). When capturing an email that matches an existing saved account, it preserves `id`, `customLabel`/label, and saved account order (`ANTIGRAVITY_ORDER_KEY`) while upgrading `authSource` to `"native_capture"`. `AntigravityCaptureTab` auto-probes `read_antigravity_sessions` on mount (`useProbeLocalAntigravitySession`) to surface a banner when a local Antigravity 2.0 session is ready for capture or upgrade. `audit_granted_scopes` (`src-tauri/src/auth/oauth.rs`) reports any `AG_GOOGLE_SCOPES` missing from a granted scope string.

## 2. OpenAI Codex

### Router telemetry and session affinity

- The local Codex Router records request counts and input, output, cached, and reasoning token totals, including cache-hit request counts. It retains hourly aggregates for up to 90 days and per-model totals, with a persisted all-time summary.
- The telemetry view supports 1-hour, 24-hour, 7-day, 30-day, and all-time ranges; charts expose token volume and cache-hit rate, with per-model comparisons. The modal dialog renders responsively (`min(1080px, calc(100vw - 48px))` by `min(780px, calc(100vh - 72px))`) and anchors below the window titlebar with standard `.dialog-overlay` elevation, pinning the header (`flex-shrink: 0`) so metric cards, telemetry chart, and model breakdown scroll within the modal body.
- Routing uses session/account affinity when a session can be identified, while still allowing fallback when the preferred account is unavailable or ineligible.
- Claude Messages requests routed through the gateway derive a stable prompt-cache key from binding, pool, and available session identity/cache seed, falling back to system instructions when needed. The key is hashed rather than exposing the seed.

### Multi-account keep-alive

- The background keep-alive daemon (`src-tauri/src/codex/keep_alive/`) monitors and maintains all saved Codex accounts, not only the currently active account.
- Periodically checks token expiration (within 5 minutes of expiry) and requests updated OAuth tokens using the saved `refreshToken`.
- Captures and persists rotated refresh tokens from OAuth token refresh responses, preventing session invalidation during long-running background execution.
- Implements self-healing for `401 Unauthorized` responses by immediately attempting token refresh recovery.
- If the refreshed account is the currently active Codex account, updates `~/.codex/auth.json` to keep CLI terminal sessions in sync.
- Supports periodic OpenAI API key health verification for non-OAuth accounts.

### Account usage and persistence

- OAuth and API-key accounts share one card system.
- Usage results are cached in memory and successful snapshots are persisted under `quotashift_codex_usage_cache_v1` with `fetchedAt`.
- Persisted entries discard transient `loading` and `error` state.
- Concurrent refreshes for the same account are deduplicated.
- Non-forced refreshes reuse fresh cache data. Every tracked Codex account (primary or in the multi-track list) uses the tracked poll interval as its freshness bound; interval polling refreshes all tracked Antigravity and Codex accounts. A successful usage fetch clears any re-authentication state.
- Detected plan and avatar information is persisted back to the account when newly available.
- Local Codex session capture also accepts an optional label. It resolves an existing account before saving and reports the result through the shared capture feedback flow.

### Apply and restart on switch

Applying a Codex account updates the local session credentials and CLI authentication state (`~/.codex/auth.json`).

When experimental **Restart running app on switch** (`quotashift_restart_on_switch_v1`) is enabled:

- QuotaShift detects whether the ChatGPT/Codex desktop app is running before stopping anything (`src-tauri/src/codex/process.rs`).
- It safely closes and reopens the desktop application post-switch. Microsoft Store / MSIX packaged applications are reopened via app execution alias and app ID protocol (`packaged.rs`), while unpackaged installations are reopened via executable path.
- Active Codex CLI sessions and IDE extension processes are stopped, leaving non-running applications untouched.
- If no Codex process was running prior to Apply, nothing is stopped, launched, or reopened.

### Model catalog and pools

- Model catalog queries (`/backend-api/codex/models`) resolve client version dynamically: an explicit version override, then the latest published Codex release tag from GitHub (cached in memory for 6h with a 10m retry interval on failure), then the locally installed CLI version, falling back to a compatibility floor (`0.153.4`). The release lookup is single-flight: concurrent callers wait on one in-flight request and read its cached result.
- Current Codex UI manages concurrent **Model Pools V2** (`CodexModelPoolsV2Panel`, `quotashift_codex_model_pools_v2`) and native Sign in with ChatGPT (**SIWC**) registrations under `Codex > Model Pools`. See [08 — Codex Routing and Pools](08-codex-routing-and-pools.md) for V2 pool cards, SIWC enrollment, V1 migration, and gateway routing.

### Routing

- Pool Routing binds strictly to `127.0.0.1:<port|0>` with TLS/origin/host validation and Bearer authentication, serving independent concurrent enabled V2 aliases rather than a single global active pool.
- Gateway startup/stop is decoupled from `~/.codex/config.toml` unless CLI provider synchronization is explicitly invoked. Full candidate selection, pre-commit failover, SIWC/Anthropic `/v1/messages` translation, and 90-day hourly telemetry are specified in [08 — Codex Routing and Pools](08-codex-routing-and-pools.md).

## 3. Claude Code

### Gateway compatibility defaults

- The Claude gateway defaults to automatic mode and applies the expected attribution headers and supported experimental beta flags for Claude Code compatibility. Explicit user configuration remains the source of truth when provided.

- Profiles are keyed by `CLAUDE_CONFIG_DIR`, discovered automatically or added manually.
- Provider visibility is a hard runtime gate. Hiding Claude stops scheduled polling, guardrail evaluation, usage-event handling, statusline setup, manual/overlay refresh, and auto-resume work.
- With the default running-account guardrail scope on, active/processing profiles use the fast Claude cadence while inactive profiles—including an explicitly tracked inactive profile—use the idle-account cadence. Turning that scope off lets an eligible tracked profile use the fast cadence.
- Multi-account tracking: all monitored Claude account IDs (`monitored_account_ids`) are passed to the backend scheduler, ensuring every tracked profile receives dedicated monitored-account polling rates.
- Polling scheduler request-time anchoring: profile polling schedules the next due tick relative to the request time (`requested_at`), avoiding cadence drift or missed ticks when usage probes take several seconds to complete.
- Tracked cache slack (`trackedCacheMaxAgeMs`): gives Antigravity and Codex tracked usage refreshes an intentional timing slack window so slightly delayed fetches do not skip subsequent ticks; Claude `ClaudeUsageScheduler` anchors `next_due_at = requested_at + interval` and `useClaudeAccountMonitor` passes `maxAgeSecs = pollIntervalSecs`.
- Target-only manual refresh is blocked for suspended profiles and always settles its loading state on success or failure.
- Optional low-usage throttling reduces probing when usage is below 10% of limit.
- Claude reset credits are requested only when `Show Claude reset count` is ON. The read-only endpoint caches definitive results (`available`, `none`, `surface`) for 30 minutes (`1800s`) and transient failures (`token_expired`, `cli_version_unknown`, `network_error`, `http_*`) for 90 seconds, invalidating cached entries when `.credentials.json` mtime changes (`credentials_mtime`). `claude --version` lookup includes fallbacks for `%APPDATA%\npm\claude.cmd`, `~/.local/bin/claude(.exe)`, `/usr/local/bin/claude`, and `/opt/homebrew/bin/claude`. Cards, overlay and taskbar show known positive counts; an unavailable/ineligible result displays `RC?` on account cards (with `credits.reason` in the tooltip, explicitly noting it does not mean `0` remaining resets) and `Unknown` in `ResetCreditsDialog` (`ClaudeResetCreditsDialog`, with an `Open Claude Usage Settings` button to `https://claude.ai/settings/usage`). OFF stops scheduling these requests and hides the optional badges.
- `/usage` output with no quota lines (e.g. offline or VPN-blocked) is an error, not empty usage. The last good snapshot is kept and marked stale, a per-account frontend cache (`quotashift_claude_usage_cache_v1`) restores it on start, and overlay bars fall back to their previous values.

## 4. CLI Account Rotation Pools

CLI Account Pools manage ordered `agy` (`antigravity`) and `codex` failover pools (`quotashift_cli_rotation_pools_v1`), separate from Codex Model Pools. Opt-in automatic failover (`useCliPoolAutoFailover`, `cli_pool_preflight_auto_rotation`, and `cli_pool_arm_continuation`) is wired for single/disambiguated running sessions with strict fail-closed gates and clipboard resume fallback; see [09 — AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md) for the complete architecture and remaining release gates.

- **Provider isolation**: definitions distinguish Antigravity and Codex, separate from Codex Model Pools.
- **Quota evaluator**: confirms consecutive fresh exhausted samples from one reset epoch,
  separated by at least five seconds, or the latest authoritative exhaustion error.
- **Planner**: rejects unknown active accounts, multiple provider instances, missing working
  directories, ambiguous histories, and unapproved latest-session fallback.
- **Account apply**: runtime adapter explicitly returns unavailable until secure service integration
  and effective identity verification exist; no global auth file is written by this adapter.
- **Continuation prompt**: persisted exactly, defaulting to `continue remaining works`; prompt Reset
  preserves unrelated settings.
- **Release gates**: live idleness probing (`probe_cli_instance_idle` in `src-tauri/src/cli_pools/idle.rs` failing closed on missing/reused PIDs, active descendants outside `related_pids`, two-sample CPU > 2.0%, or session/rollout activity within 10s), post-restore 2.5s (5×500ms) process verification (`src-tauri/src/system/cli_restore/restore.rs`), and clipboard/toast resume fallback (`useCliPoolAutoFailover.ts`) are wired; durable orchestration, startup recovery, installed CLI capabilities, and native Windows/Defender validation remain unfinished.

See `docs/playbooks/cli-rotation.md` and [09 — AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md) for current limits and remaining acceptance gates.

## 5. Codex Model Pools V2 & Claude Code Connector

Model Pools V2 enables multiple independently enabled model pools to run concurrently on a loopback gateway:

- **Public Model Alias Validation**: Each enabled pool's public model alias must be unique and match `^[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$`. The outbound Responses `model` field is rewritten to the upstream model ID.
- **Gateway Decoupling**: Gateway loopback listener lifecycle is completely decoupled from Codex CLI configuration (`~/.codex/config.toml`). Starting or stopping the gateway does not modify CLI configuration unless explicitly requested via "Connect Codex CLI".
- **Shared Account Budgets & Affinity**: Accounts shared across multiple pools operate under a single global concurrency budget and health rate-limit broker. Magpie-inspired cache affinity pins sessions where trustable session keys exist, with truthful telemetry (`cached_tokens` is `None` when absent, never fabricated as 0).
- **Billing Boundary Separation**: Strict separation between OpenAI Sign in with ChatGPT (SIWC) plan subscriptions and metered API keys. Exhaustion on a subscription account never falls back silently to a paid API key.
- **Experimental Claude Code Messages Adapter**: Translates Anthropic `/v1/messages` requests to OpenAI `/v1/responses` streams. Non-Claude model routing is experimental and not officially supported by Anthropic.
- **Windows Claude Code Connector**: Supports process-once launch and persistent profile modes (`CLAUDE_CONFIG_DIR`), with atomic compare-and-swap crash recovery and zero leak of upstream credentials to disk.

**Next →** [04 — Desktop Shell and Overlay](04-desktop-shell-and-overlay.md)

## v1.3.0 behavior (issue #64)

- Tier badges filter the provider's account list; selecting again clears, and search composes with the filter. Drag reorder cannot persist a partial filtered order.
- Reauthentication updates existing Antigravity identity in-place, retains saved order and refresh token if no replacement is issued.
- Apply auto-monitor is opt-in and adds to the monitored list (maximum three), without replacing accounts. When full it does not evict other accounts. An additional opt-in removes other accounts of the same provider before adding.
- Codex process classification prioritizes ChatGPT Desktop over the CLI/IDE extension; the Windows termination plan uses matched PIDs only, and CLI resumes with a known conversation ID or `--last`.
- Antigravity restart attempts an exact app relaunch; macOS uses the app bundle and all platforms check that the app reappears.
- Antigravity 2.0 uses native unified authentication (`authSource: "native_capture"`); the legacy consumer OAuth path (`authSource: "browser_oauth"`) runs a live `tokeninfo`/scope audit (`audit_granted_scopes`, `missingScopes`, `scopeAuditPassed`) and warns the user to use Capture Local Session when required scopes are missing.
- Claude reset count remains an opt-in **best-effort** read from an undocumented API, with a verified same-account Claude Desktop `Local Storage/leveldb` read-only fallback (`read_verified_desktop_resets`) when the remote endpoint is `ineligible` or `unavailable`; an unavailable/ineligible result is still not a confirmed zero.
- Experimental automatic CLI-pool failover probes live CLI idleness (`probe_cli_instance_idle`), disambiguates multi-process environments by distinct normalized `cwd` and recent rollout/history activity within 5 minutes (`disambiguate_active_instance`), verifies process relaunch after restore, and copies the resume command to the clipboard on continuation failure.
- Antigravity's empty-account view matches the Codex empty-state layout and onboarding copy (`Add Account` via Browser Login or active local session capture).
- Codex splits its workspace into `Accounts` and `Model Pools` subtabs (`CodexSubtabs`).
- Local AI Agent API rotations share native identity/fresh-quota checks with manual switching (`POST /v1/rotation` requires `Allow account rotation` enabled and polls `/v1/operations/{id}`).

## Code map

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Antigravity Backend & Workers | `src-tauri/src/antigravity/{mod,quota,remote,usage,exact,keep_alive}.rs`, `worker/**` | Cloud/API quota fetch, isolated exact IDE workers, persistent worker restart budget, 240m keep-alive |
| Shared Quota Normalizer | `src-tauri/src/quota/{mod,parser,refresh}.rs`, `src-tauri/src/providers/**` | `loadCodeAssist` / `fetchAvailableModels` catalog authority, Argon shared-vs-independent grouping, shared provider traits |
| Antigravity Frontend UI & Hooks | `src/components/antigravity/**`, `src/hooks/antigravity/**`, `src/utils/antigravity/**` | Account cards, Add/Capture/Reauth modal (`native_capture` upgrade), tier classifier, `carryForwardQuotaLanes` |
