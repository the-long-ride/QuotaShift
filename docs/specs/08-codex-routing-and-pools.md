---
schema_version: 1
id: feature.codex-routing-pools
title: "Codex Account Sync, SIWC, and Model Pool Routing"
kind: feature
status: verified
summary: "Codex CLI/Desktop synchronization, native SIWC OAuth2/OIDC registration, Model Pools V2 concurrent aliasing, loopback Axum router with Anthropic /v1/messages translation, and 90-day telemetry."
tags: ["codex", "siwc", "model-pools", "router", "anthropic", "telemetry"]
source_paths: ["src-tauri/src/codex/keep_alive.rs", "src-tauri/src/codex/keep_alive/maintainer.rs", "src-tauri/src/codex/keep_alive/registry.rs", "src-tauri/src/codex/keep_alive/tests.rs", "src-tauri/src/codex/mod.rs", "src-tauri/src/codex/models.rs", "src-tauri/src/codex/process.rs", "src-tauri/src/codex/process/packaged.rs", "src-tauri/src/codex/process/plan_tests.rs", "src-tauri/src/codex/process/tests.rs", "src-tauri/src/codex/router.rs", "src-tauri/src/codex/router/anthropic/aggregate.rs", "src-tauri/src/codex/router/anthropic/content.rs", "src-tauri/src/codex/router/anthropic/count_tokens.rs", "src-tauri/src/codex/router/anthropic/errors.rs", "src-tauri/src/codex/router/anthropic/events.rs", "src-tauri/src/codex/router/anthropic/mod.rs", "src-tauri/src/codex/router/anthropic/request.rs", "src-tauri/src/codex/router/anthropic/stream.rs", "src-tauri/src/codex/router/anthropic/tests/tests.rs", "src-tauri/src/codex/router/anthropic/tests/tests_refusal.rs", "src-tauri/src/codex/router/anthropic/tests/tests_request.rs", "src-tauri/src/codex/router/anthropic/tests/tests_stream.rs", "src-tauri/src/codex/router/anthropic/tests/tests_tools.rs", "src-tauri/src/codex/router/anthropic/tools.rs", "src-tauri/src/codex/router/commands.rs", "src-tauri/src/codex/router/forward.rs", "src-tauri/src/codex/router/listener.rs", "src-tauri/src/codex/router/messages_entry.rs", "src-tauri/src/codex/router/precommit_tests/precommit_failure_tests.rs", "src-tauri/src/codex/router/precommit_tests/precommit_tests.rs", "src-tauri/src/codex/router/precommit_tests/precommit_unit_tests.rs", "src-tauri/src/codex/router/router_tests/affinity_tests.rs", "src-tauri/src/codex/router/router_tests/lifecycle_tests.rs", "src-tauri/src/codex/router/router_tests/messages_entry_tests.rs", "src-tauri/src/codex/router/router_tests/pool_registry_tests.rs", "src-tauri/src/codex/router/router_tests/responses_tests.rs", "src-tauri/src/codex/router/router_tests/route_tests.rs", "src-tauri/src/codex/router/router_tests/selection_test.rs", "src-tauri/src/codex/router/router_tests/tests.rs", "src-tauri/src/codex/router/routes.rs", "src-tauri/src/codex/router/routing/account_budget.rs", "src-tauri/src/codex/router/routing/affinity.rs", "src-tauri/src/codex/router/routing/candidate_ranking.rs", "src-tauri/src/codex/router/routing/pool_registry.rs", "src-tauri/src/codex/router/routing/route_context.rs", "src-tauri/src/codex/router/routing/route_errors.rs", "src-tauri/src/codex/router/routing/selection.rs", "src-tauri/src/codex/router/server_controls/mod.rs", "src-tauri/src/codex/router/server_controls/tests.rs", "src-tauri/src/codex/router/siwc_bridge/siwc_config.rs", "src-tauri/src/codex/router/siwc_bridge/siwc_forward.rs", "src-tauri/src/codex/router/siwc_bridge/siwc_request.rs", "src-tauri/src/codex/router/siwc_bridge/siwc_stream.rs", "src-tauri/src/codex/router/surface.rs", "src-tauri/src/codex/router/telemetry_store.rs", "src-tauri/src/codex/router/transport/auth_guard.rs", "src-tauri/src/codex/router/transport/client_auth.rs", "src-tauri/src/codex/router/transport/client_binding.rs", "src-tauri/src/codex/router/transport/encode.rs", "src-tauri/src/codex/router/transport/precommit.rs", "src-tauri/src/codex/router/transport/response_utils.rs", "src-tauri/src/codex/router/transport/responses_transport.rs", "src-tauri/src/codex/router/types.rs", "src-tauri/src/codex/router/usage_metrics.rs", "src-tauri/src/codex/siwc/accounts.rs", "src-tauri/src/codex/siwc/auth/callback_http.rs", "src-tauri/src/codex/siwc/auth/host.rs", "src-tauri/src/codex/siwc/auth/native_access.rs", "src-tauri/src/codex/siwc/auth/oauth.rs", "src-tauri/src/codex/siwc/auth/oidc.rs", "src-tauri/src/codex/siwc/callback.rs", "src-tauri/src/codex/siwc/commands.rs", "src-tauri/src/codex/siwc/mod.rs", "src-tauri/src/codex/siwc/models.rs", "src-tauri/src/codex/siwc/registration.rs", "src-tauri/src/codex/siwc/sign_out.rs", "src-tauri/src/codex/siwc/store.rs", "src-tauri/src/codex/siwc/tests/callback_test.rs", "src-tauri/src/codex/siwc/tests/tests.rs", "src-tauri/src/codex/siwc/tests/token_exchange_test.rs", "src-tauri/src/codex/siwc/token_exchange.rs", "src-tauri/src/codex/sync.rs", "src-tauri/src/codex/sync/auth.rs", "src-tauri/src/codex/sync/connector.rs", "src-tauri/src/codex/sync/io.rs", "src-tauri/src/codex/sync/tests.rs", "src/components/codex/CodexEmptyState.tsx", "src/components/codex/CodexIcons.tsx", "src/components/codex/CodexRenameInput.tsx", "src/components/codex/CodexSpendBreakdown.tsx", "src/components/codex/CodexSubtabs.tsx", "src/components/codex/CodexTab.tsx", "src/components/codex/CodexTabEmpty.tsx", "src/components/codex/CodexTabFeedback.tsx", "src/components/codex/cards/CodexAccountBar.tsx", "src/components/codex/cards/CodexAccountCard.tsx", "src/components/codex/cards/CodexCardDeleteBtn.tsx", "src/components/codex/cards/CodexCardError.tsx", "src/components/codex/cards/CodexCardPlan.tsx", "src/components/codex/cards/CodexCardRefreshBtn.tsx", "src/components/codex/cards/CodexCardSiwcAction.tsx", "src/components/codex/cards/CodexCardUsageLimits.tsx", "src/components/codex/cards/codex-card-helpers.ts", "src/components/codex/hooks/codex-tab-types.ts", "src/components/codex/hooks/useCodexPoolModelFilter.ts", "src/components/codex/hooks/useCodexRefreshState.ts", "src/components/codex/hooks/useCodexTabReorder.ts", "src/components/codex/index.ts", "src/components/codex/modals/AddAccountModal.tsx", "src/components/codex/modals/CodexApiKeyTab.tsx", "src/components/codex/modals/CodexAvailableModelsDialog.tsx", "src/components/codex/modals/CodexBrowserLoginTab.tsx", "src/components/codex/modals/CodexLocalSessionTab.tsx", "src/components/codex/modals/CodexModalFooter.tsx", "src/components/codex/modals/CodexModalTabs.tsx", "src/components/codex/modals/CodexResetCreditsDialog.tsx", "src/components/codex/modals/CodexResetDialogWrapper.tsx", "src/components/codex/modals/CodexTabDialogs.tsx", "src/components/codex/pools-v2/CodexModelOptionHeading.tsx", "src/components/codex/pools-v2/CodexModelPoolV2Card.tsx", "src/components/codex/pools-v2/CodexModelPoolV2Editor.tsx", "src/components/codex/pools-v2/CodexModelPoolV2LimitsFields.tsx", "src/components/codex/pools-v2/CodexModelPoolV2Members.tsx", "src/components/codex/pools-v2/CodexModelPoolV2ModelField.tsx", "src/components/codex/pools-v2/CodexModelPoolV2NameFields.tsx", "src/components/codex/pools-v2/CodexModelPoolV2Policies.tsx", "src/components/codex/pools-v2/CodexModelPoolsV2Panel.tsx", "src/components/codex/pools/CodexPoolCard.tsx", "src/components/codex/pools/CodexPoolMemberIdentity.tsx", "src/components/codex/pools/CodexPoolModal.tsx", "src/components/codex/pools/CodexPoolModalFooter.tsx", "src/components/codex/pools/CodexPoolUsageModal.tsx", "src/components/codex/pools/CodexPoolsList.tsx", "src/components/codex/pools/CodexPoolsSection.tsx", "src/components/codex/pools/codex-pool-helpers.ts", "src/components/codex/pools/useCodexPoolEditorState.ts", "src/components/codex/router-server/CodexRegenerateKeyDialog.tsx", "src/components/codex/router-server/CodexRouterServerControls.tsx", "src/components/codex/router-server/CodexRouterServerIcons.tsx", "src/components/codex/router-server/CodexRouterServerLogs.tsx", "src/components/codex/router-server/CodexRouterServerPanel.tsx", "src/components/codex/router-server/CodexRouterServerStats.tsx", "src/components/codex/router-server/codex-router-server-helpers.ts", "src/components/codex/siwc/SiwcAccountPanel.tsx", "src/components/codex/siwc/codex-add-account-helpers.ts", "src/components/codex/siwc/codex-login-profile.ts", "src/components/codex/siwc/codex-siwc-login.ts", "src/components/codex/siwc/useCodexBrowserOAuth.ts", "src/components/codex/siwc/useCodexSiwcAccounts.ts", "src/components/codex/siwc/useSiwcPoolModels.ts", "src/components/codex/telemetry/CodexRouterTelemetryChart.tsx", "src/components/codex/telemetry/CodexRouterTelemetryModal.tsx", "src/components/codex/telemetry/codexTelemetryFormat.ts", "src/components/codex/telemetry/codexTelemetryTypes.ts", "src/hooks/codex/useCodexAccountOps.ts", "src/hooks/codex/useCodexAccountOps.types.ts", "src/hooks/codex/useCodexModelPoolsV2.ts", "src/hooks/codex/useCodexModelRouting.ts", "src/hooks/codex/useCodexModelScanManager.ts", "src/hooks/codex/useCodexRouterManager.ts", "src/hooks/codex/useCodexUsageFetcher.ts", "src/styles/codex/codex-cards.css", "src/styles/codex/codex-model-pools-v2.css", "src/styles/codex/codex-pools.css", "src/styles/codex/codex-router-server.css", "src/styles/codex/codex-router-telemetry.css", "src/styles/codex/codex-router.css", "src/styles/codex/codex-siwc-accounts.css", "src/styles/codex/codex-siwc-card.css", "src/utils/codex/account/codex-account-plan.ts", "src/utils/codex/account/codex-active-storage.ts", "src/utils/codex/account/codex-keep-alive.ts", "src/utils/codex/account/codex-profile.ts", "src/utils/codex/account/codex-restart-message.ts", "src/utils/codex/account/codex-restore.ts", "src/utils/codex/account/codex-tray-state.ts", "src/utils/codex/account/local-session-import.ts", "src/utils/codex/app-codex-ops.ts", "src/utils/codex/codex-model-display.ts", "src/utils/codex/codex-models.ts", "src/utils/codex/codex-rate-limits.ts", "src/utils/codex/codex-reset-credits.ts", "src/utils/codex/codex-tier-summary.ts", "src/utils/codex/codex-usage-windows.ts", "src/utils/codex/current-local-session.ts", "src/utils/codex/index.ts", "src/utils/codex/pools/codex-pools-io.ts", "src/utils/codex/pools/codex-pools-v2-types.ts", "src/utils/codex/pools/codex-pools-v2.ts", "src/utils/codex/pools/codex-pools.ts", "src/utils/codex/pools/codex-router-types.ts", "src/utils/codex/pools/codex-router.ts", "src/utils/codex/pools/codex-siwc-link.ts", "src/utils/codex/pools/siwc-types.ts"]
related_specs: ["architecture.system-overview", "architecture.security-credentials", "feature.provider-monitoring-switching", "workflow.claude-guardrails-lifecycle", "workflow.backup-recovery"]
last_doc_update_at: "2026-11-15T18:57:14Z"
last_verified_at: "2026-11-16T08:05:00Z"
last_verified_code_commit: 7a0913bd6c2aca62395d780a783ed20d078d2635
last_source_change_commit: 87e44a844f42ca07d2a4dd7f09fe7cb213bf84e3
last_source_change_at: "2026-11-16T01:57:07+07:00"
source_fingerprint: "sha256:ef193df3aa39bc90e43bd73e2e743b4ab4803ade7e84a9c0a9a3ad59f21d3a0f"
---

# 08 — Codex Account Sync, SIWC, and Model Pool Routing

**Audience:** engineers & AI agents · **Verified against:** `1.3.0` (`87e44a84`) · **Date:** 2026-11-16
> **Scope**: QuotaShift desktop app (`src-tauri/src/codex/**`, `src/components/codex/**`, `src/hooks/codex/**`, `src/utils/codex/**`)

## Purpose and boundaries

This domain owns Codex account management UI, Codex CLI authentication/configuration file synchronization, ChatGPT/Codex model catalog discovery, native **Sign in with ChatGPT (SIWC)** registration, and the loopback **Codex Model Pool Router** HTTP gateway (including Anthropic `/v1/messages` translation for connected Claude Code clients).

**In scope**
- Codex account onboarding (Browser OAuth, API key, local `~/.codex/auth.json` capture), usage/plan caching, avatar lookup, and background OAuth keep-alive (`codex::keep_alive`).
- Process termination and desktop/MSIX relaunch on account switch (`codex::process`) plus atomic `auth.json` / `config.toml` synchronization and startup/exit crash recovery (`codex::sync`).
- Native SIWC PKCE + OIDC (`RS256` JWKS) registration, subject/workspace binding, encrypted token persistence (`siwc-credentials-v1.bin`), and SIWC `/v1/models` catalog discovery (`codex::siwc`).
- Model Pools V2 management (`CodexModelPoolsV2Panel`), V1→V2 storage migration, and the loopback Axum HTTP gateway (`codex::router`) supporting OpenAI `/v1/responses` passthrough, SIWC bridge validation, Anthropic `/v1/messages` & `/v1/messages/count_tokens` translation, shared concurrency/rate-limit budgets, cache-aware session affinity, pre-commit failover, and 90-day hourly token/cache telemetry.

**Out of scope**
- Generic Codex OAuth login/refresh endpoints (`crate::oauth`), generic OS keyring/vault storage internals (`crate::storage::secure_storage`), and tray/overlay rendering (`04-desktop-shell-and-overlay.md`).
- CLI Account Rotation Pools (`src-tauri/src/cli_pools/**`, covered in `03-provider-monitoring-and-switching.md` §4).
- Claude Code profile discovery, hook/statusline setup, and persistent profile lifecycle (`src-tauri/src/claude/**`, `05-claude-guardrails-and-process-lifecycle.md`), except where Claude connect commands register/revoke `ClientBinding` entries and launch against the router's `/v1/messages` endpoint.

---

## Observable behavior

### 1. Codex workspace UI & feature gating
- `CodexTab` separates **Accounts** and **Model Pools** via `CodexSubtabs`. When `codexModelRoutingEnabled` (`useCodexModelRouting`) is `false`, `Model Pools` subtabs, SIWC card actions (`CodexCardSiwcAction`), and pool routing controls stay hidden.
- Individual account operations remain independent of Model Pool selection (`codex-active-storage.test.mjs`): applying an account writes `~/.codex/auth.json` and optionally restarts Codex CLI/IDE/ChatGPT Desktop (`quotashift_restart_on_switch_v1`), without modifying active V2 model pools.
- Account cards hide SIWC linking controls (`CodexCardSiwcAction`) for `FREE`-tier accounts and lock concurrent SIWC authorize/copy actions on other cards while a SIWC sign-in flow is pending.

### 2. Model catalog discovery & keep-alive
- Per-account Codex catalog discovery (`fetch_chatgpt_models`) queries `https://chatgpt.com/backend-api/codex/models` with a resolved `client_version` (explicit override → single-flight GitHub release lookup `openai/codex/releases/latest` cached 6h on success / 10m on failure → installed local Codex binary version → compatibility floor `0.153.4`) and `originator = codex_cli_rs`.
- Frontend caches per-account catalogs in `quotashift_codex_model_catalog_v1` with a 24-hour freshness TTL (`CODEX_MODEL_CACHE_TTL_MS`), retrying once via `refresh_chatgpt_token` on auth error and batching global rescans in groups of 3 (`useCodexModelScanManager`).
- Background Codex keep-alive (`codex::keep_alive`, default interval 240 minutes) refreshes expiring OAuth tokens under a global `MAINTENANCE_LOCK`, runs a ChatGPT usage check (with 401 self-heal retry), and emits `codex-keep-alive-tokens` (`CODEX_TOKEN_UPDATE_EVENT`) to sync updated encrypted credentials back to frontend storage and `~/.codex/auth.json` if active.

### 3. Native Sign in with ChatGPT (SIWC)
- Model Pool routing with ChatGPT subscriptions requires a dedicated native SIWC registration (`reg_<...>`) with `chatgpt.tokens.use.direct` scope (`SIWC_SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"`). Legacy Codex OAuth credentials cannot satisfy SIWC pools and are never mutated or exposed to the frontend (`NativeSiwcSession` stays exclusively in `siwc-credentials-v1.bin`).
- Binding an existing Codex OAuth account (`acct-oauth-...`) enforces OpenAI OIDC `sub` matching (`expected_subject`); email alone never links accounts. Duplicate `(subject, workspace)` registrations are distinct per workspace.
- On initial `invalid_grant` during token exchange, callback handling retries once via a 302 redirect using the issued/retained `client_id`.
- `disconnect_siwc_account` performs OIDC discovery (`https://auth.openai.com/.well-known/openid-configuration`), revokes the refresh token remotely if supported, and always removes the local native registration even if remote revocation fails (`{ remotelyRevoked }`).

### 4. Model Pools V2 & V1 migration
- Each V2 pool (`CodexModelPoolV2`) defines `id`, `displayName`, `publicModelName` (client-visible alias), `upstreamModelId`, `enabled`, `memberAccountIds`, `modelSelectionMode` (`manual` | `discovered`), `routingPolicy` (`cache-aware` | `balanced` | `priority`), `authMode` (`openai-api-key` | `siwc` in UI/TS; Rust also supports `legacy-codex-oauth` for V1 fallback), `maxContextWindowTokens`, `thinkingBudgetTokens`, and `reasoningEffort`.
- Enabled aliases must match `^[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$` and be unique across enabled pools (ASCII case-insensitive). Multiple enabled pools may target the same `upstreamModelId` under distinct aliases.
- V1 pools migrate once via `migrateCodexPoolsV1`: SIWC-eligible pools migrate disabled until native SIWC consent completes; mixed/ambiguous pools migrate disabled. Live `useCodexRouterManager` submits only `poolsV2` (`pools: []`, `activePoolId: null`).
- Pool members with `authMode === "siwc"` are preserved when deleting standalone Codex accounts (`useCodexModelPoolsV2`), and are only disabled/stripped when the SIWC registration itself is disconnected (`onRegistrationDisconnected` / `revoke_native_siwc`).

### 5. Loopback Router Server, Routing Policies & Failover
- The router binds strictly to `127.0.0.1:<port|0>` (explicit port must be `>= 1024`; falls back to OS ephemeral port if a saved port is occupied) and validates `Origin`/`Host` against `127.0.0.1:<port>` / `localhost:<port>`.
- Every endpoint except `GET /health` requires either the router's generated 32-byte secret (`X-QuotaShift-Token` or `Authorization: Bearer`) for unrestricted access, or a scoped `ClientBinding` bearer token (`bind_<32hex>`) restricted to `allowed_aliases` (plus optional `fallback_alias`).
- Gateway startup/stop is decoupled from `~/.codex/config.toml` (`CodexRouterManager::default()` uses `manage_provider_config = false`). When CLI provider config is managed (`begin_codex_router_config_at_with_secret` / `sync_codex_*`), original `config.toml` is snapshotted to `config.toml.quotashift-router-restore` (or `...absent`) and recovered atomically on exit/startup.
- **Candidate Selection**:
  1. `AffinityRegistry` checks for an active session pin (TTL `900s`) keyed by SHA-256 `(profile_id, conversation_id)` extracted from trusted headers (`x-claude-code-session-id`, `session-id`, `session_id`, `thread-id`, `thread_id`, `conversation_id`, `x-session-id`) or JSON body `prompt_cache_key`. If pinned account is still eligible and unblocked, it is selected first.
  2. `Balanced` filters & ranks candidates via `rank_and_filter_candidates` (`bottleneck_score` = min finite `remaining_percent` across windows → quota completeness → freshness) with deterministic `round_robin_cursor` tie-breaking.
  3. `CacheAware` and `Priority` traverse `memberAccountIds` in user-configured priority order (`select_account_for_route_members_excluding`).
- **Budgets, Backoff & Pre-commit Failover**:
  - `AccountBudgetRegistry` tracks per-account `max_concurrency` atomically across all pools sharing an account (`AccountReservation` RAII guard released on stream completion or drop).
  - Quota/rate-limit/auth failures place the `(account_id, model)` pair in cooldown (`Retry-After` header or `FAILURE_BACKOFF_SECS = 60`); definitive upstream model incompatibility marks `model_incompatible` until pool config edit or catalog refresh.
  - Pre-commit streaming buffer (`PrecommitLimits`: 1 MiB max prefix, 120s max wait) holds upstream SSE events until a real content delta commits downstream; pre-commit failures fail over to remaining eligible candidates (up to `accounts.len().max(1)`) plus up to 3 transport retries (50ms backoff). Post-commit failures terminate the stream without failover.

### 6. Protocol Translation (`/v1/messages` & SIWC Bridge)
- `PoolAuthMode::Siwc` only forwards `POST /responses` or `/v1/responses` to `https://api.openai.com/v1/responses`, strips client auth/cookie/org headers (`should_forward_siwc_header` allows only `content-type` and `accept`), rejects 16 `BANNED_SIWC_PREVIEW_FIELDS` and `role: "system"` items inside `input`, requires `store: false` and `stream: true`, and treats an SSE stream as successful only upon valid terminal `response.completed`.
- `POST /v1/messages` and `/v1/messages/count_tokens` resolve exact alias or `ClientBinding.fallback_alias`, **reject `LegacyCodexOAuth` pools**, enforce `max_context_window_tokens`, translate Anthropic messages/tools/images/thinking-budget (`effort_for_budget` fallback to pool defaults) into Responses payloads (`x-anthropic-billing-header:` stripped, server tools & `document` blocks rejected, `thinking`/`redacted_thinking` skipped), and stream back `AnthropicSseEvent` frames (or aggregate JSON when `stream: false`). Exhausted pools return Anthropic error envelopes with `x-should-retry: false`.
- `/v1/models` and `/models` return synthesized JSON listing only aliases authorized for the caller's `ClientContext`.

### 7. Telemetry & Logs
- `PersistedTelemetryStore` persists hourly usage buckets (`MAX_HOURLY_BUCKETS = 2160`, 90 days) at `<data_local_dir>/QuotaShift/router-usage-telemetry-v1.json`, keyed by timestamp and model without storing prompt/response payloads. Missing upstream `cached_tokens` remain `None` (never synthesized as `0`).
- `CodexRouterServerPanel` provides live controls (port binding/pinning, key reveal/copy/rotation with optional bulk update of QuotaShift-managed Claude profile `settings.json`, filtered log stream `[codex_router]`, `[codex_pool]`, `[siwc]`, `[router_server]`, and `CodexRouterTelemetryModal` charts across `24h`/`7d`/`30d`/`90d`/`all`).

---

## Workflow

1. **SIWC Enrollment**:
   `SiwcAccountPanel` or `CodexCardSiwcAction` → `invoke("start_siwc_sign_in", { registrationId, linkedCodexAccountId })` → Rust generates PKCE + nonce + `urn:uuid` host ID (`siwc-host-id-v1.txt`), opens loopback `/auth/callback` listener (180s timeout) → user completes ChatGPT consent → `callback.rs` exchanges code (1 retry on `invalid_grant` with retained `client_id`), verifies `RS256` ID token against OpenAI JWKS, verifies `sub` match if linking, encrypts `NativeSiwcSession` into `siwc-credentials-v1.bin` under `reg_...`.
2. **Router Configuration & Startup**:
   `useCodexRouterManager` gathers enabled `modelPoolsV2`, resolves `list_siwc_accounts` & `get_siwc_models`, constructs `CodexRouterConfig` (`pools: []`, `poolsV2`), and invokes `configure_codex_router` (debounced 150ms) and `start_codex_router`. Backend verifies native SIWC registrations & catalogs (`verify_native_siwc_pools`), locks `config` then `registry` to bump revision atomically, syncs active Claude journals (`sync_active_claude_journals`), and restores persisted `ClientBinding`s (5s timeout).
3. **Request Forwarding Pipeline**:
   Loopback request arrives → `trusted_request_origin_and_host` + `authenticated_client_context` (`RouterSecret` vs `ClientBinding`) → `route_decision` (`/health`, `/models`, `/responses`, `/v1/messages`, `/v1/messages/count_tokens`) → `resolve_forward_target` (alias rewrite, limit check, SIWC validation/translation) → failover loop (`select_account_with_affinity` + `budgets.try_reserve` + bearer refresh if `expires_at <= now + 60s`) → upstream call → `read_until_commit` pre-commit check → `guarded_stream` updates `AffinityRegistry`, `RouterUsageTelemetry`, and last-routed metadata.

---

## Code map

| Layer | Directory / File | Responsibility |
| --- | --- | --- |
| Rust Gateway Core | `src-tauri/src/codex/router.rs`, `router/{commands,listener,surface,routes,forward,messages_entry,types}.rs` | `CodexRouterManager`, Axum loopback listener, Tauri lifecycle IPC, HTTP routing & failover loop |
| Rust Routing Policy | `src-tauri/src/codex/router/routing/*.rs` | `PoolRegistrySnapshot`, `ClientContext`, `AccountBudgetRegistry`, `AffinityRegistry`, `candidate_ranking`, `selection` |
| Rust Transport & Security | `src-tauri/src/codex/router/transport/*.rs` | Header allow/strip guards, `ClientBinding` bearer auth, `PrecommitLimits`, SSE/JSON response encoding |
| Rust SIWC & Bridge | `src-tauri/src/codex/siwc/**/*.rs`, `router/siwc_bridge/*.rs` | OAuth2 PKCE + OIDC JWKS verification, encrypted `reg_` storage, `/v1/models` catalog, SIWC `/v1/responses` contract & SSE tracker |
| Rust Anthropic Adapter | `src-tauri/src/codex/router/anthropic/*.rs` | Request/tool/content/effort translation, `count_tokens`, streaming `MessagesStreamTranslator`, non-streaming aggregation, error envelopes |
| Rust Telemetry | `src-tauri/src/codex/router/{telemetry_store,usage_metrics}.rs` | `NormalizedUsage`, `RouterUsageTelemetry`, 90-day hourly JSON store (`router-usage-telemetry-v1.json`) |
| Rust Controls & Logs | `src-tauri/src/codex/router/server_controls/mod.rs` | Port validation (`>= 1024`), live restart/fallback, secret rotation, `[codex_*]`/`[siwc]` log filtering |
| Rust Account Sync & Process | `src-tauri/src/codex/{keep_alive,models,process,sync}.rs`, `{keep_alive,process,sync}/*.rs` | 240m token maintenance, `/backend-api/codex/models` catalog + GitHub version cache, Desktop/MSIX/CLI kill & relaunch, atomic `auth.json`/`config.toml` & crash recovery |
| Frontend UI & Subtabs | `src/components/codex/{CodexTab,CodexSubtabs,CodexAccountBar,CodexSpendBreakdown}.tsx`, `cards/*`, `modals/*` | Codex Accounts/Model Pools subtabs, account cards, SIWC card links, Add Account modal, Available Models & Reset dialogs |
| Frontend Pools V2 & Server | `src/components/codex/pools-v2/*`, `router-server/*`, `siwc/*`, `telemetry/*` | V2 Pool editor & cards, `SiwcAccountPanel`, `CodexRouterServerPanel`, `CodexRegenerateKeyDialog`, `CodexRouterTelemetryModal` & SVG charts |
| Frontend Legacy Pools (V1) | `src/components/codex/pools/*` | Legacy V1 UI (`CodexPoolsSection` unused; `CodexPoolModal` still mounted in `AppModals.tsx` + `CodexPoolUsageModal` helper types) |
| Frontend Hooks & Utils | `src/hooks/codex/*`, `src/utils/codex/**` | `useCodexRouterManager`, `useCodexModelPoolsV2`, `useCodexModelScanManager`, `useCodexUsageFetcher`, `useCodexAccountOps`, `useCodexModelRouting`, V1→V2 migration, rate-limit window normalization |

---

## Interfaces and data

### Tauri IPC Commands (registered in `src-tauri/src/lib.rs`)
- **Router Lifecycle & Controls**: `start_codex_router`, `stop_codex_router`, `configure_codex_router`, `get_codex_router_status`, `restart_codex_router`, `get_codex_router_key`, `get_codex_router_logs`, `clear_codex_router_logs`, `get_codex_router_telemetry`. *(Note: `connect_codex_cli` and `disconnect_codex_cli` exist as `#[tauri::command]` functions in `router/commands.rs` but are not mounted in `lib.rs`.)*
- **SIWC**: `start_siwc_sign_in`, `cancel_siwc_sign_in`, `get_siwc_sign_in_status`, `list_siwc_accounts`, `get_siwc_models`, `disconnect_siwc_account`.
- **Codex Account, Models & Sync**: `fetch_chatgpt_models`, `read_codex_auth`, `write_codex_auth`, `kill_codex_processes`, `relaunch_codex_desktop`, `restore_codex_cli`, `sync_codex_config`, `sync_codex_provider_config`, `get_codex_sync_status`, `restore_codex_config`, `sync_codex_keep_alive_accounts`.

### Events & Persistent Artifacts
- **Tauri Event**: `codex-keep-alive-tokens` (`CODEX_TOKEN_UPDATE_EVENT`).
- **Disk / LocalStorage**:
  - `~/.codex/auth.json` & `~/.codex/config.toml` (+ `config.toml.quotashift-router-restore` / absent marker & `.antigravity.bak`).
  - `<app_data_dir>/siwc-credentials-v1.bin` (encrypted `NativeSiwcSession` keyed by `reg_...`) & `<app_data_dir>/siwc-host-id-v1.txt` (UUIDv4 host ID).
  - `<data_local_dir>/QuotaShift/router-usage-telemetry-v1.json` (up to 2,160 hourly buckets).
  - Frontend keys: `quotashift_codex_model_catalog_v1`, V2 model pools, router port preference (`CODEX_ROUTER_PORT_KEY`), and `codex_model_routing` preference.

### Loopback HTTP Surface (`127.0.0.1:<port>`)
- `GET /health` (unauthenticated health probe)
- `GET /models`, `GET /v1/models` (filtered to `ClientContext` allowed aliases)
- `POST /responses`, `/responses/compact`, `/v1/responses`, `/v1/responses/compact` (32 MiB max body; SIWC restricted to `POST /responses` and `/v1/responses`)
- `POST /v1/messages`, `/v1/messages/count_tokens` (Anthropic Messages translation & local `ceil(chars/4)` token count)

---

## Verification

| Suite / Scope | Location | Verified Checks |
| --- | --- | --- |
| **Node / TS Unit & Contract Tests** | `tests/codex/*.test.mjs` (**44 files**, run via `pnpm test` / `scripts/test.mjs`) | Account plan, active storage & tray, avatar & JWT cache, keep-alive bridge, local session import, rate-limit windows & usage cache, model catalog & rescan batches, Model Routing setting gate, V1→V2 migration & alias validation, UI contracts (`CodexRouterServerPanel`, telemetry charts, regenerate-key dialog, SIWC linking) |
| **Rust Unit & Integration Tests** | `src-tauri/src/codex/**` (**24 test files / inline test suites**, 177 tests total counted across submodules, run via `cargo test`) | `keep_alive` (2), `process` + `packaged` (17), `sync` (13), `siwc` + `auth` (36), `router` + `router_tests` + `precommit_tests` + `server_controls` + `siwc_bridge` + `transport` (84), `anthropic` (61 `anthropic` tests; 259 `#[test]` / `#[tokio::test]` cases total across `src-tauri/src/codex/**`) |

*(Note: In this read-only inspection pass, tests were analyzed statically from source/test definitions rather than executed live in this worker.)*

---

## Related documentation
- [02 — Security and Credentials](02-security-and-credentials.md) — secure storage vaults, token obfuscation boundaries, and SIWC native encryption isolation.
- [03 — Provider Monitoring and Switching](03-provider-monitoring-and-switching.md) — Codex account switching UX, CLI rotation pools (§4), and cross-provider polling.
- [05 — Claude Guardrails and Process Lifecycle](05-claude-guardrails-and-process-lifecycle.md) — Claude Code profile connection consumers of `/v1/messages` and `ClientBinding`.
- [06 — Settings and Configuration](06-settings-and-configuration.md) — experimental feature toggles (`Use Codex Model Routing`, `Restart running app on switch`).
- [07 — Backup and Recovery](07-backup-and-recovery.md) — backup export/import of Codex pools.
- [09 — AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md).

**Next →** [09 — AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md)

---

## Known limitations and open questions
1. **Unregistered `connect_codex_cli` / `disconnect_codex_cli` commands**: Both `#[tauri::command]` wrappers are implemented and unit-tested (`lifecycle_tests.rs`) in `src-tauri/src/codex/router/commands.rs`, but are not registered in `src-tauri/src/lib.rs` `generate_handler![]` or invoked from `src/` (while older `sync_codex_config` / `sync_codex_provider_config` / `restore_codex_config` remain registered in `lib.rs`).
2. **Legacy V1 UI residue**: `src/components/codex/pools/CodexPoolsSection.tsx` has zero runtime callers, while `CodexPoolModal.tsx` is still rendered by `src/components/app/AppModals.tsx` for legacy `handleSaveCodexPool`.
3. **Cache-aware vs Priority selection**: In `src-tauri/src/codex/router/routing/selection.rs`, when no `AffinityRegistry` pin hits (900s TTL), `PoolRoutingPolicy::CacheAware` and `PoolRoutingPolicy::Priority` execute the same ordered first-to-bottom member traversal (`select_account_for_route_members_excluding`); only `Balanced` invokes `rank_and_filter_candidates` + round-robin cursor.
4. **SIWC `accounts.rs` vs `siwc_native.rs`**: `src-tauri/src/codex/siwc/accounts.rs` defines an in-memory `SiwcAccountStore`/`AccountCatalog`, whereas live Tauri SIWC commands persist and read `NativeSiwcSession` records directly from `storage::secure_storage::siwc_native` (`siwc-credentials-v1.bin`).
