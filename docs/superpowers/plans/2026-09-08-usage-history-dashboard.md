# Usage History Dashboard and Last-Used Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist privacy-safe Codex token usage and Antigravity quota-consumption history locally, expose useful daily dashboards, and display reliable per-account `Last used` timestamps.

**Architecture:** A new Tauri SQLite module owns durable events, retention, daily aggregation, rollout import, and Antigravity quota-delta observations. The Codex router emits exact routed-account/model telemetry without storing prompts/responses. Frontend dashboards request aggregated data through narrow Tauri commands and render lightweight SVG line charts. Account metadata keeps `lastUsedAt` for immediate card rendering while SQLite remains the durable usage source.

**Tech Stack:** Rust 2021, Tauri 2, rusqlite bundled SQLite, React 19, TypeScript, SVG, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-08-codex-routing-model-discovery-usage-dashboard-design.md`

## Global Constraints

- Never persist prompts, responses, request bodies, authorization headers, OAuth tokens, or API keys.
- Codex token metrics are stored only when authoritative counters are observed.
- Antigravity quota percentages are never relabeled as tokens.
- Telemetry write failures must not fail or delay the primary model request/switch operation.
- Default retention is `Forever`; finite choices are exactly 30, 90, and 365 days.
- Dashboard must distinguish unknown from numeric zero.
- All-accounts dashboard defaults to one aggregate line, not one line per account.
- Background quota refresh alone does not update `lastUsedAt`.
- Routed Codex request attribution is exact to the account selected by the router.

---

### Task 1: Add SQLite event store, migrations, retention, and queries

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/usage_history.rs`
- Modify: `src-tauri/src/lib.rs`

**Dependency:**

```toml
rusqlite = { version = "0.32", features = ["bundled"] }
```

**Database path:** `~/.quotashift/usage.sqlite3`

**Schema v1:**

```sql
CREATE TABLE IF NOT EXISTS usage_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('codex','antigravity')),
  account_id TEXT,
  model TEXT,
  timestamp_ms INTEGER NOT NULL,
  event_kind TEXT NOT NULL,
  input_tokens INTEGER,
  cached_input_tokens INTEGER,
  cache_write_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  quota_window_kind TEXT,
  quota_before REAL,
  quota_after REAL,
  routed INTEGER NOT NULL DEFAULT 0,
  source_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_usage_platform_time ON usage_event(platform, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_usage_platform_account_time ON usage_event(platform, account_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_usage_platform_model_time ON usage_event(platform, model, timestamp_ms);
```

- [ ] **Step 1: Write RED temp-database tests**

Test:
- schema/migration is idempotent,
- insert/query distinguishes null and zero,
- duplicate non-null `source_key` is ignored/idempotent,
- daily grouping uses local-day boundary supplied by query timezone offset rather than hardcoded UTC labels,
- account/model filters work,
- retention 30/90/365 deletes only older rows,
- Forever performs no delete.

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml usage_history::tests -- --nocapture
```

Expected: RED.

- [ ] **Step 2: Implement store**

Manage a path-backed store with a Mutex-safe connection strategy. Open/migrate on app setup. Use transactions for bulk imports.

Public structs:

```rust
UsageEventInput
UsageDashboardQuery
UsageDailyPoint
UsageDashboardSummary
UsageDashboardResult
UsageRetention
```

- [ ] **Step 3: Add narrow Tauri commands**

```text
query_usage_dashboard
set_usage_retention
get_usage_retention
import_codex_usage_history
```

Internal-only functions may record router/Antigravity events directly without exposing raw token-bearing input from frontend.

- [ ] **Step 4: Register/manage store**

Initialize/migrate in `.setup`; failure logs a clear error but the app can still run without analytics.

- [ ] **Step 5: Verify and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml usage_history::tests -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml --verbose
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/usage_history.rs src-tauri/src/lib.rs
git commit -m "feat: store local usage history"
```

---

### Task 2: Record exact Codex router token telemetry without content retention

**Files:**
- Modify: `src-tauri/src/codex_router.rs`
- Modify: `src-tauri/src/usage_history.rs`

- [ ] **Step 1: Write RED usage-parser tests**

Define a small parser that extracts only numeric usage fields from supported JSON/SSE response events:

```rust
struct ParsedCodexUsage {
    input_tokens: Option<i64>,
    cached_input_tokens: Option<i64>,
    cache_write_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_tokens: Option<i64>,
    total_tokens: Option<i64>,
}
```

Test direct JSON usage objects and SSE `data:` events. Include prompt-looking text in fixtures and assert parser output contains no text fields.

- [ ] **Step 2: Tee response parsing transiently**

For non-streaming JSON, parse the response bytes before forwarding but persist only usage counters.

For streaming/SSE, inspect bounded line fragments while forwarding chunks. Do not retain complete response content. Keep only the latest/final authoritative usage counters.

- [ ] **Step 3: Persist routed metadata best-effort**

After request completion, insert:
- platform `codex`,
- actual selected account ID,
- requested model,
- timestamp,
- event kind `request_usage`,
- token counters,
- `routed = true`.

If no counters are available, still record a lightweight `request_activity` event for exact `last used` attribution; token columns remain null.

Telemetry insertion errors are logged without changing downstream response.

- [ ] **Step 4: Add Tauri event for immediate UI last-used update**

Emit `codex-account-used` with only `{ accountId, model, timestampMs }` after a routed request is accepted upstream. Never include body/tokens unless the frontend explicitly needs numeric usage refresh later.

- [ ] **Step 5: Verify and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml codex_router::tests usage_history::tests -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml --verbose
git add src-tauri/src/codex_router.rs src-tauri/src/usage_history.rs
git commit -m "feat: record routed Codex token usage"
```

---

### Task 3: Import deterministic Codex rollout/session token history

**Files:**
- Modify: `src-tauri/src/usage_history.rs`
- Modify: `src-tauri/src/lib.rs`

**Source root:** `~/.codex/sessions`

- [ ] **Step 1: Write RED JSONL import tests**

Fixtures cover official-style `event_msg` / `token_count` records and usage objects. Verify:
- token counts import,
- file timestamp/session timestamp maps to event time,
- model imported when present,
- account ID is populated only when source contains deterministic account/workspace identifier matched against mapping supplied by frontend,
- otherwise `account_id = NULL`, surfaced later as `Unattributed`,
- malformed lines are skipped and counted,
- same file/event imported twice does not duplicate because `source_key` is deterministic.

- [ ] **Step 2: Implement recursive bounded importer**

Walk only `~/.codex/sessions`; accept `.jsonl`; stream line-by-line rather than loading entire history. Use hash/path+ordinal/event identity as source key.

Command input contains only a map from external ChatGPT account IDs to QuotaShift saved account IDs. It does not include tokens.

- [ ] **Step 3: Return import summary**

```json
{
  "filesScanned": 10,
  "eventsImported": 42,
  "eventsSkipped": 3,
  "unattributed": 8
}
```

- [ ] **Step 4: Verify and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml usage_history::tests -- --nocapture
git add src-tauri/src/usage_history.rs src-tauri/src/lib.rs
git commit -m "feat: import Codex session usage history"
```

---

### Task 4: Record Antigravity quota consumption and reliable activity

**Files:**
- Modify: `src-tauri/src/usage_history.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.tsx`
- Create: `tests/usage-history-app-contract.test.mjs`

- [ ] **Step 1: Write RED delta tests**

Add internal observation table/state or derive previous observation from latest event. Test:
- 80 -> 65 remaining records 15 consumed,
- 65 -> 100 reset does not record negative consumption,
- same remaining value records no consumption,
- separate account/model/window lanes do not mix,
- unknown/missing values are ignored.

Store events as:
- `event_kind = quota_consumed`,
- `quota_window_kind = 5h|weekly|...`,
- `quota_before = 80`,
- `quota_after = 65`.

- [ ] **Step 2: Add `record_antigravity_quota_observation` command**

Frontend supplies account ID, model/family label, window kind, remaining percent, timestamp. No credential data enters history.

- [ ] **Step 3: Send observations only after successful authoritative refresh**

In App, after cloud/exact cache is finalized, send numeric returned windows for the relevant account. A quota refresh that does not decrease quota does not become usage.

- [ ] **Step 4: Record switches/activity separately**

Manual Apply and successful automatic failover insert/emit activity event `account_applied` / `auto_failover`. This supports switch count dashboard summaries.

- [ ] **Step 5: Verify and commit**

```bash
node --test tests/usage-history-app-contract.test.mjs
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml usage_history::tests -- --nocapture
git add src-tauri/src/usage_history.rs src-tauri/src/lib.rs src/App.tsx tests/usage-history-app-contract.test.mjs
git commit -m "feat: track Antigravity quota consumption"
```

---

### Task 5: Add account `lastUsedAt` semantics and card labels

**Files:**
- Modify: `src/utils/types.ts`
- Create: `src/utils/last-used.ts`
- Create: `tests/last-used.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/components/CodexTab.tsx`
- Modify: `src/components/AntigravityTab.tsx`
- Modify: `src/styles.css`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write RED formatter tests**

Pure helper:

```ts
formatLastUsed(timestampMs: number | null | undefined, now?: Date): string
```

Expected examples:
- null => `Never used`,
- 2 minutes ago => `Last used 2m ago`,
- same day older than the compact relative threshold => `Last used today, 09:42`,
- older date => concise local date/time.

Use injected `now` for deterministic tests.

- [ ] **Step 2: Extend account types**

Add optional `lastUsedAt?: number` to both `CodexAccount` and `AntigravityAccount`; existing stored accounts remain compatible.

- [ ] **Step 3: Update timestamps only on reliable use**

Codex:
- manual Apply success,
- `codex-account-used` router event,
- deterministic rollout import may update after backend query/import summary when attributed.

Antigravity:
- manual Apply success,
- successful automatic failover,
- observed quota decrease attributed to active account.

Do not stamp on quota polling alone.

- [ ] **Step 4: Render on account cards**

Place small secondary text on the right side of the email/info row. Keep email ellipsis flexible and timestamp `flex-shrink:0`.

- [ ] **Step 5: Verify and commit**

```bash
rm -rf .test-build
pnpm exec tsc src/utils/last-used.ts src/utils/types.ts --outDir .test-build --module ES2022 --target ES2022 --moduleResolution bundler --skipLibCheck
node --test tests/last-used.test.mjs tests/usage-history-app-contract.test.mjs
pnpm build
git add src/utils/types.ts src/utils/last-used.ts tests/last-used.test.mjs src/App.tsx src/components/CodexTab.tsx src/components/AntigravityTab.tsx src/styles.css .github/workflows/ci.yml
git commit -m "feat: show account last-used timestamps"
```

---

### Task 6: Build reusable usage dashboard and SVG daily line chart

**Files:**
- Create: `src/components/UsageDashboard.tsx`
- Create: `src/components/UsageLineChart.tsx`
- Modify: `src/utils/types.ts`
- Modify: `src/components/CodexTab.tsx`
- Modify: `src/components/AntigravityTab.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `tests/usage-dashboard-ui-contract.test.mjs`

- [ ] **Step 1: Write RED UI contract**

Require each top-level tab to expose `Usage Dashboard`; dashboard has:
- ranges `7d`, `30d`, `90d`, `All`,
- account filter,
- Codex model filter when models exist,
- summaries Today / 7 days / 30 days / most-used account / most-used model / failovers when relevant,
- one aggregate daily line by default,
- SVG chart with accessible title/description,
- loading/error/empty states,
- dialog clamped to viewport.

- [ ] **Step 2: Define frontend result types matching backend**

```ts
export type UsagePlatform = "codex" | "antigravity";
export type UsageDashboardRange = 7 | 30 | 90 | "all";
export interface UsageDailyPoint { ... }
export interface UsageDashboardSummary { ... }
export interface UsageDashboardResult { points: UsageDailyPoint[]; summary: UsageDashboardSummary; accounts: ...; models: string[]; }
```

Token fields remain nullable. Antigravity points expose consumed percentages by window kind separately from token fields.

- [ ] **Step 3: Implement lightweight SVG line chart**

No new frontend chart dependency. Compute x positions by ordered day index and y scaling from visible numeric series. Handle all-zero and one-point series without NaN. Tooltip can be simple native/title or hover overlay; do not overbuild.

- [ ] **Step 4: Implement dashboard data fetching**

On open/filter/range change invoke `query_usage_dashboard`. App supplies account labels for display where backend returns IDs.

All accounts defaults to aggregate. Optional compare state can select a small subset, but do not render every account automatically.

- [ ] **Step 5: Add dashboard buttons**

Place compact action in both tab headers near existing Add/Best controls. Opening one dashboard does not alter tracked/applied account state.

- [ ] **Step 6: Verify and commit**

```bash
node --test tests/usage-dashboard-ui-contract.test.mjs
pnpm build
git add src/components/UsageDashboard.tsx src/components/UsageLineChart.tsx src/utils/types.ts src/components/CodexTab.tsx src/components/AntigravityTab.tsx src/App.tsx src/styles.css tests/usage-dashboard-ui-contract.test.mjs
git commit -m "feat: add local usage dashboards"
```

---

### Task 7: Add retention setting and Codex history import action

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/usage-dashboard-ui-contract.test.mjs`
- Modify: `tests/usage-history-app-contract.test.mjs`

- [ ] **Step 1: Add RED settings contracts**

Require:
- retention choices exactly `30 days`, `90 days`, `365 days`, `Forever`,
- default loaded from backend is Forever,
- changing selection invokes `set_usage_retention`,
- settings includes `Import Codex usage history`,
- import builds external ChatGPT account ID -> QuotaShift account ID mapping without credentials,
- import result displays counts including Unattributed.

- [ ] **Step 2: Implement settings UI**

Use a compact `<select>` or menu control inside gear dropdown for retention. Do not silently prune before backend confirms the chosen value.

- [ ] **Step 3: Implement import action**

App decodes saved OAuth metadata only enough to obtain the existing `accountId` already stored inside obfuscated OAuth JSON and sends `{externalId: savedId}` mapping. No access/refresh token is sent to import command.

Show toast/dialog summary when complete.

- [ ] **Step 4: Verify and commit**

```bash
node --test tests/usage-dashboard-ui-contract.test.mjs tests/usage-history-app-contract.test.mjs
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml usage_history::tests -- --nocapture
git add src/components/Header.tsx src/App.tsx src/styles.css tests/usage-dashboard-ui-contract.test.mjs tests/usage-history-app-contract.test.mjs
git commit -m "feat: configure usage history retention"
```

---

### Task 8: Integration verification and migration/privacy audit

**Files:**
- Modify only as test findings require
- Update PR description after verification

- [ ] **Step 1: Run the complete frontend test suite**

Use the exact utility compile/test command maintained in `.github/workflows/ci.yml`, including model discovery, router, failover, history, dashboard, last-used, and prior regression suites.

- [ ] **Step 2: Run frontend build**

```bash
pnpm build
```

- [ ] **Step 3: Run complete Rust suite/check**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --verbose
cargo check --manifest-path src-tauri/Cargo.toml --verbose
```

- [ ] **Step 4: Privacy/source scan**

Search new router/history code for accidental logging/storage of request body or auth:

```bash
grep -RniE 'authorization|access_token|refresh_token|request.body|response.body|prompt' src-tauri/src/codex_router.rs src-tauri/src/usage_history.rs
```

Every match must be an auth-handling/redaction implementation or test; no telemetry insert/log call may contain raw values.

- [ ] **Step 5: Persistence migration audit**

Verify:
- old accounts without `lastUsedAt` load,
- old pools without new metadata load as manual,
- existing backup v2 remains importable,
- usage SQLite is not silently included in credential backup,
- finite retention is opt-in only.

- [ ] **Step 6: Push and require final Linux + Windows CI green on exact head**

Do not claim completion until both jobs pass on the final SHA.

- [ ] **Step 7: Commit any integration fixes**

```bash
git add src src-tauri tests .github/workflows/ci.yml
git commit -m "test: verify routing failover and usage dashboards"
```
