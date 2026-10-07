# 03 — Provider Monitoring and Switching

**Audience:** engineers & AI agents · **Verified against:** `1.1.4` · **Date:** 2026-10-06

## Provider capability matrix

| Capability | Antigravity | OpenAI Codex | Claude Code |
| --- | --- | --- | --- |
| Usage monitoring | Yes | Yes | Yes |
| Account switching | Yes | Yes | No — monitor-only credentials |
| Local active detection | IDE/CLI session | Codex session/auth state | CLI/profile process state |
| Pool routing | No | Yes | No |
| Process guardrails | No | No | Yes |
| Persistent card order/sort | Yes | Yes | Yes |

## Shared account behavior

- Provider cards support persistent ordering and one-shot sorting by alias, email, tier, normalized usage, and last used.
- Applying a supported Antigravity or Codex account updates Last used immediately. Startup/idle reconciliation also marks the locally active account/profile when it can be identified.
- Compact and expanded modes share global remaining-usage tones: `<20%` warning orange and `<10%` critical red.
- Codex compact cards expose a second metadata row in the order `tier - email … last used`.
- Account cards, overlay badges, and overlay tooltips use the same provider-specific canonical tier classifier and the freshest detected provider plan rather than separate display heuristics.
- Canonical display tiers are: Antigravity `FREE / PLUS / PRO / ULTRA`; Codex `FREE / GO / PLUS / PRO / BUSINESS / ENTERPRISE / EDU / API`; Claude `FREE / PRO / MAX / TEAM / ENTERPRISE`. Legacy ChatGPT `Team` is normalized to the current `BUSINESS` name.
- When navigating from the overlay HUD, taskbar strip, or context menus, `scrollToAccountCard` automatically switches to the account's provider tab, smoothly centers the card within its scroll container, and applies the `.account-card--focused` visual attention highlight.

## 1. Antigravity

### Usage

- Quota is obtained through cloud/API paths and isolated local worker/session paths.
- Usage is grouped into provider/model pools and normalized into 5-hour/weekly display data.
- Successful refresh logging is one concise masked-account summary. Routine successful low-level HTTP lines are omitted; failures remain diagnostic.
- Multi-account keep-alive regularly verifies quota and maintains fresh OAuth sessions for all saved Antigravity accounts.

### Apply and restart on switch

Applying an Antigravity account refreshes usable OAuth state, updates the supported local session representation, and recycles only QuotaShift-owned/targeted helpers as required. Secrets sent to SQLite helper scripts use JSON stdin.

When experimental **Restart running app on switch** (`quotashift_restart_on_switch_v1`) is enabled:
- Running Antigravity IDE and desktop app processes are closed and reopened.
- A running `agy` CLI session is detected, stopped, and reopened in a new terminal window in the directory it was originally executed from (`src-tauri/src/system/session/cli.rs`).
- Apps and sessions that are not running are left alone.
- The Apply confirmation dialog explicitly informs the user which running targets will be restarted.

### Capture

Add Account reads the shared Antigravity 2.0/agy session and older IDE SQLite profiles, then imports distinct identities into the saved list without applying them. The capture label is optional; the account name or email supplies a fallback. Matching saved accounts are reported as already present, and existing saved credentials are retained.

## 2. OpenAI Codex

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

### Model pools

A pool contains `id`, `name`, target `model`, member account IDs, and a model-selection mode (`manual` or `discovered`). Pool definitions are normalized and duplicate member IDs are removed.

Pool card behavior in v1.1.3:

- Square 32px avatar with the pool initial.
- Conditional auth composition: only nonzero `OAuth: n` and `API Key: n` parts are shown; an empty pool shows `Pool empty`.
- No redundant `Selected pool` text badge. A `Routing` badge appears only when the active router status confirms traffic for that pool/model.
- Apply/active, usage, and edit actions use the same compact control geometry; Edit is icon-only.
- Member usage opens a modal with fixed Account/Tier/Usage headers and a body-only scrolling member list.
- Free members show Monthly usage; Plus members show 5-hour and Weekly usage; other tiers use normalized available windows.
- The modal Refresh action refreshes eligible non-loading pool members through the shared account usage fetcher rather than maintaining a second usage source.

### Routing

- Pool Routing listens only on `127.0.0.1` and uses an ephemeral port plus a generated secret.
- The persisted selected pool (`quotashift_codex_active_pool_id_v1`) is independent from the standalone applied Codex account.
- Startup restores routing only when the stored active pool still exists. If routing was requested but the pool disappeared, routing is disabled rather than silently choosing another pool.
- The active pool participates only when the request model matches the pool model.
- Same-request failover can select another eligible member on retryable transport/auth/quota failures or definitive model incompatibility before a downstream response is committed.
- Ranking uses fresh usage and fresh discovered-model data; stale information is treated as unknown.
- Expiring/old OAuth credentials for active-pool members are refreshed and persisted before router snapshots; failed refresh attempts are throttled.
- `~/.codex/config.toml` is synchronized for the loopback provider and restored exactly when routing stops or stale state is recovered.

## 3. Claude Code

- Profiles are keyed by `CLAUDE_CONFIG_DIR`, discovered automatically or added manually.
- Provider visibility is a hard runtime gate. Hiding Claude stops scheduled polling, guardrail evaluation, usage-event handling, statusline setup, manual/overlay refresh, and auto-resume work.
- With the default running-account guardrail scope on, active/processing profiles use the fast Claude cadence while inactive profiles—including an explicitly tracked inactive profile—use the idle-account cadence. Turning that scope off lets an eligible tracked profile use the fast cadence.
- Target-only manual refresh is blocked for suspended profiles and always settles its loading state on success or failure.
- Optional low-usage throttling reduces probing when usage is below 10% of limit.
- Reset credits are read for every real Claude account (read-only, cached 30 minutes per account), so account cards show the remaining count like Codex, with details in a shared dialog. The opt-in setting only gates the overlay/taskbar badge for the tracked non-local account. Unavailable results and a count of 0 do not display a count.
- `/usage` output with no quota lines (e.g. offline or VPN-blocked) is an error, not empty usage. The last good snapshot is kept and marked stale, a per-account frontend cache (`quotashift_claude_usage_cache_v1`) restores it on start, and overlay bars fall back to their previous values.

**Next →** [04 — Desktop Shell and Overlay](04-desktop-shell-and-overlay.md)
