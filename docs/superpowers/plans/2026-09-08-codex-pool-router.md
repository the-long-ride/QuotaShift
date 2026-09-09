# Codex Pool Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a loopback-only Codex request gateway that selects the best eligible account for the requested pool model, safely fails over before response commitment, and restores direct Codex configuration when routing stops.

**Architecture:** Routing lives in a new Tauri backend module. The frontend remains source-of-truth for saved accounts/pools and sends a decoded, in-memory-only router snapshot to the backend whenever routing state changes. The backend owns listener lifecycle, credential injection, request selection, backoff, streaming passthrough, and direct-config restoration. Codex UI is split into Accounts/Pools subtabs with one persistent Pool Routing switch.

**Tech Stack:** Rust 2021, Tauri 2, axum, tokio, reqwest streaming, futures-util, React 19, TypeScript, existing Codex pool/model utilities.

**Spec:** `docs/superpowers/specs/2026-09-08-codex-routing-model-discovery-usage-dashboard-design.md`

## Global Constraints

- Bind only `127.0.0.1`; never `0.0.0.0` or LAN interfaces.
- Router is not an arbitrary proxy. Only explicitly supported Codex/OpenAI API paths and trusted upstreams are forwarded.
- Never log Authorization, ChatGPT account headers, prompt/request bodies, or response content.
- Router credentials exist only in backend memory; only routing preference/config restoration metadata may persist.
- Matching pool selection: highest `activatedAt`; unmatched model falls back to normal applied account.
- Account score is bottleneck remaining quota, not average quota.
- Failure backoff is 60 seconds per account/model; successful routed use clears it.
- A request can be replayed only when failure is known before any body/stream bytes were committed to the caller.
- Pool routing cannot be reported enabled until listener health and provider configuration both succeed.
- Disable/shutdown drain timeout is 10 seconds, then configuration is restored.

---

### Task 1: Add pure backend router model and account-selection tests

**Files:**
- Create: `src-tauri/src/codex_router.rs`
- Modify: `src-tauri/src/lib.rs`

**Core types:**

```rust
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterQuotaWindow {
    pub remaining_percent: f64,
    pub duration_minutes: Option<f64>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum CodexRouterAuth {
    OAuth {
        access_token: String,
        refresh_token: Option<String>,
        chatgpt_account_id: String,
    },
    ApiKey { api_key: String },
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterAccount {
    pub id: String,
    pub auth: CodexRouterAuth,
    pub available_model_ids: Option<Vec<String>>,
    pub quota_windows: Vec<RouterQuotaWindow>,
    pub usage_fetched_at: Option<i64>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterPool {
    pub id: String,
    pub model: String,
    pub account_ids: Vec<String>,
    pub model_selection_mode: String,
    pub activated_at: i64,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRouterConfig {
    pub accounts: Vec<CodexRouterAccount>,
    pub pools: Vec<CodexRouterPool>,
    pub applied_account_id: Option<String>,
}
```

- [ ] **Step 1: Write RED unit tests**

Cover:
- `100/1` remaining windows => score 1,
- `60/60` => score 60,
- one weekly-only window => that value,
- no windows => unknown, not zero,
- discovered-mode member missing model => ineligible,
- manual-mode member may remain eligible without model confirmation,
- exact score ties rotate through candidates with deterministic cursor,
- freshness/completeness breaks a tie before round robin,
- 60-second backoff excludes only the affected account/model,
- most recently activated matching pool wins,
- unmatched model selects applied account.

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml codex_router::tests -- --nocapture
```

Expected: RED.

- [ ] **Step 2: Implement pure selection state**

Use an internal `RouterRuntimeState` with:

```rust
round_robin_cursor: std::collections::HashMap<String, usize>,
backoff_until: std::collections::HashMap<(String, String), std::time::Instant>,
model_incompatible: std::collections::HashSet<(String, String)>,
```

Do not mix listener/network code into selection functions.

- [ ] **Step 3: Verify and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml codex_router::tests -- --nocapture
git add src-tauri/src/codex_router.rs src-tauri/src/lib.rs
git commit -m "feat: add Codex router selection core"
```

---

### Task 2: Add loopback listener and safe route surface

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/codex_router.rs`
- Modify: `src-tauri/src/lib.rs`

**Dependencies:**

```toml
axum = "0.8"
futures-util = "0.3"
reqwest = { version = "0.12", default-features = false, features = ["json", "native-tls", "stream"] }
tokio = { version = "1", features = ["time", "macros", "net", "sync", "io-util"] }
```

- [ ] **Step 1: Write RED listener/path tests**

Test the listener address is loopback and an OS-assigned port (`127.0.0.1:0` bind). Define an allowlist for Codex provider traffic, initially:

```text
/responses
/responses/compact
/models
/v1/responses
/v1/responses/compact
/v1/models
```

Unsupported paths return 404/405 and are never forwarded.

- [ ] **Step 2: Implement `CodexRouterManager`**

Manager fields include listener task handle, cancellation channel, bound URL, in-flight counter/notify, runtime config, and selection state. Manage it in Tauri:

```rust
.manage(codex_router::CodexRouterManager::default())
```

Commands:

```rust
start_codex_router
stop_codex_router
configure_codex_router
get_codex_router_status
```

`start` returns `{ running, baseUrl }` only after `/health` succeeds.

- [ ] **Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml codex_router::tests -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml --verbose
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/codex_router.rs src-tauri/src/lib.rs
git commit -m "feat: start loopback Codex router"
```

---

### Task 3: Forward requests with account-scoped authentication and bounded failover

**Files:**
- Modify: `src-tauri/src/codex_router.rs`

**Trusted upstreams:**
- OAuth/ChatGPT account: `https://chatgpt.com/backend-api/codex`
- API-key account: `https://api.openai.com/v1`

- [ ] **Step 1: Build RED forwarding tests with local mock upstreams**

Make upstream resolution injectable in tests. Assert:
- request method/query/content-type/accept are preserved,
- incoming Authorization and `ChatGPT-Account-Id` are removed,
- selected OAuth account injects bearer token + its ChatGPT account ID,
- API key injects only its API key bearer auth,
- prompt body is forwarded but never included in diagnostics,
- unsupported upstream/path cannot be chosen.

- [ ] **Step 2: Implement requested-model extraction**

For response endpoints, buffer the request body once, parse only the top-level `model` field from JSON, then forward the exact original bytes. Do not retain or log the body after forwarding. `/models` can use applied-account fallback without a body model.

- [ ] **Step 3: Implement response passthrough**

Preserve status and safe response headers. Use `reqwest::Response::bytes_stream()` into `axum::body::Body::from_stream` for streaming output.

- [ ] **Step 4: Add safe pre-commit failover**

Retry another eligible account only for an upstream failure/status known before the downstream response starts. Recognize quota/auth/model failures by status plus small bounded error metadata; never replay after any downstream body chunk has been emitted.

For a retryable failure:
- put selected account/model in 60-second backoff,
- mark model incompatible on definitive model-not-found for manual pool candidates,
- choose next eligible member,
- attempt at most one pass through currently eligible members; no infinite loops.

- [ ] **Step 5: Verify redaction**

Add a test logger sink or helper that asserts formatted router diagnostics contain account IDs/status/model but not bearer tokens/body text.

- [ ] **Step 6: Commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml codex_router::tests -- --nocapture
git add src-tauri/src/codex_router.rs
git commit -m "feat: route Codex requests across pool members"
```

---

### Task 4: Preserve and restore Codex provider configuration

**Files:**
- Modify: `src-tauri/src/codex_sync.rs`
- Modify: `src-tauri/src/codex_router.rs`
- Modify: `src-tauri/src/lib.rs`

**Restore file:** `~/.codex/config.toml.quotashift-router-restore`

- [ ] **Step 1: Write RED filesystem tests using temp directories**

Extract path-based helpers so tests do not touch real `~/.codex`:
- first enable copies exact pre-routing config to restore file,
- repeated enable does not overwrite the original restore snapshot,
- disable restores byte-for-byte prior config and removes restore marker,
- startup recovery restores when config points at QuotaShift loopback but no router owns it,
- successful normal direct config is left unchanged.

- [ ] **Step 2: Add lifecycle helpers**

```rust
begin_codex_router_config_at(dir: &Path, loopback_url: &str) -> Result<(), String>
restore_codex_router_config_at(dir: &Path) -> Result<(), String>
recover_stale_codex_router_config_at(dir: &Path) -> Result<bool, String>
```

Production wrappers use existing Codex dir resolution.

- [ ] **Step 3: Make router start transactional**

Order:
1. bind listener,
2. health-check listener,
3. snapshot prior config,
4. write loopback provider config,
5. report enabled.

On step 3/4 failure, stop listener and keep/restore direct config.

- [ ] **Step 4: Make router stop graceful**

Stop new accepts, wait for in-flight count to reach zero for at most 10 seconds, restore provider config, then terminate server task.

- [ ] **Step 5: Hook app startup and explicit quit**

During `.setup`, recover stale routing config before frontend normal use. Tray Quit and update-triggered process exit must call router shutdown/restore before `app.exit(0)`.

- [ ] **Step 6: Verify and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --verbose
cargo check --manifest-path src-tauri/Cargo.toml --verbose
git add src-tauri/src/codex_sync.rs src-tauri/src/codex_router.rs src-tauri/src/lib.rs
git commit -m "feat: restore Codex config around routing"
```

---

### Task 5: Split Codex UI into Accounts/Pools and add routing toggle

**Files:**
- Modify: `src/components/CodexTab.tsx`
- Modify: `src/components/CodexPoolCard.tsx`
- Modify: `src/styles.css`
- Create: `tests/codex-router-ui-contract.test.mjs`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write RED UI contract**

Require:
- `Accounts` and `Pools` subtab controls,
- pool cards render only under Pools branch,
- account cards render only under Accounts branch,
- `Pool Routing` switch visible outside the subtab branch,
- `role="switch"` and `aria-checked`,
- pool status can show routed/active and latest routed account/model text.

- [ ] **Step 2: Implement local subtab state**

Default to Accounts. Keep account reorder/track interactions unchanged in Accounts. Move existing Model Pools section into Pools.

- [ ] **Step 3: Add switch/status props**

```ts
poolRoutingEnabled: boolean;
poolRoutingBusy: boolean;
routerStatus?: CodexRouterStatus | null;
onTogglePoolRouting: () => void;
```

Disable switch only during start/stop transition.

- [ ] **Step 4: Verify**

```bash
node --test tests/codex-router-ui-contract.test.mjs tests/codex-pools-ui-contract.test.mjs
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/CodexTab.tsx src/components/CodexPoolCard.tsx src/styles.css tests/codex-router-ui-contract.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Codex routing controls"
```

---

### Task 6: Wire frontend accounts/pools into the router

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/utils/types.ts`
- Modify: `src/utils/codex-pools.ts`
- Create: `tests/codex-router-app-contract.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Preference key:** `quotashift_codex_pool_routing_v1`

- [ ] **Step 1: Write RED App contracts**

Require:
- routing preference state/ref,
- backend start/stop/configure/status commands,
- only boolean preference persists; decoded credentials do not enter localStorage/router cache,
- runtime snapshot deobfuscates accounts only at command call boundary,
- snapshot includes normalized response-driven quota windows and model catalog IDs,
- pool Apply stamps `activatedAt: Date.now()`,
- token refresh while routing enabled pushes a refreshed router snapshot,
- account/pool deletion/config changes push new snapshot,
- failed router start leaves preference false and shows error toast.

- [ ] **Step 2: Add router snapshot builder**

Create a pure helper in `src/utils/codex-router.ts` if useful for tests. It maps frontend accounts/pools/caches to backend camelCase config but accepts decoded auth data only transiently from App.

Never persist the built router config.

- [ ] **Step 3: Implement toggle**

ON:
1. call `start_codex_router`,
2. send current router config,
3. verify returned status `running`,
4. save preference `true`.

OFF:
1. call `stop_codex_router`,
2. save preference `false` only after restore succeeds.

On frontend startup, if stored preference true, start + reconfigure after saved accounts/pools are loaded. If startup fails, clear preference and warn.

- [ ] **Step 4: Keep runtime config current**

After account OAuth refresh, pool save/delete/apply, account delete, model rescan, or usage-cache refresh, schedule a debounced `configure_codex_router` when enabled. Use one 100–250ms debounce rather than concurrent config writes.

- [ ] **Step 5: Verify**

```bash
node --test tests/codex-router-app-contract.test.mjs tests/codex-router-ui-contract.test.mjs tests/codex-pools-app-contract.test.mjs
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --verbose
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/utils/types.ts src/utils/codex-pools.ts src/utils/codex-router.ts tests/codex-router-app-contract.test.mjs .github/workflows/ci.yml
git commit -m "feat: connect Codex pools to local router"
```

---

### Task 7: Verify client/provider compatibility and finish Phase 2

**Files:**
- Modify as evidence requires: `src-tauri/src/codex_router.rs`, `src/components/CodexTab.tsx`, `src/App.tsx`
- Create: `tests/codex-router-contract.test.mjs` if source contract coverage is useful

- [ ] **Step 1: Verify current Codex provider contract**

Check current OpenAI Codex source/config behavior for CLI/provider base URL. Confirm the shared `model_provider` / custom `base_url` path used by QuotaShift is honored by each client that can be verified. Record status as `configured`, `verified`, or `unsupported/unverified`; do not claim interception for a bypassing client.

- [ ] **Step 2: Expose conservative router status**

`get_codex_router_status` returns:

```json
{
  "running": true,
  "baseUrl": "http://127.0.0.1:12345",
  "lastRoutedAccountId": "...",
  "lastRoutedModel": "...",
  "routedRequestCount": 0,
  "clientCoverage": {
    "sharedProvider": "configured"
  }
}
```

Do not fabricate per-process coverage.

- [ ] **Step 3: Run full Phase 2 verification**

```bash
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --verbose
cargo check --manifest-path src-tauri/Cargo.toml --verbose
```

Run all Node contracts from `.github/workflows/ci.yml`.

- [ ] **Step 4: Push and require Linux + Windows CI green**

Do not start Phase 3 until the exact router head passes both matrix jobs.

- [ ] **Step 5: Commit final compatibility/status changes**

```bash
git add src-tauri/src/codex_router.rs src/App.tsx src/components/CodexTab.tsx tests
git commit -m "test: harden Codex pool routing"
```
