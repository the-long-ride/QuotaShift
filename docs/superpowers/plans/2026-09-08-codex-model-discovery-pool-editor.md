# Codex Model Discovery and Pool Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover the real Codex model catalog for every saved OAuth account, cache it for 24 hours, expose it from account cards/settings, and make pool model selection account-aware while preserving an explicit manual override.

**Architecture:** Keep model-response normalization, cache freshness, tier grouping, and pool compatibility rules in a pure TypeScript module. The Tauri OAuth layer owns the authenticated Codex model-catalog request. `App.tsx` owns persistent cache/orchestration and token-refresh retry. Dedicated React components render the editable combobox, compact model dialog, and five-row member list.

**Tech Stack:** React 19, TypeScript 5.6, Tauri 2, Rust/reqwest, Node built-in test runner, existing QuotaShift CSS/tooltip/toast systems.

**Spec:** `docs/superpowers/specs/2026-09-08-codex-routing-model-discovery-usage-dashboard-design.md`

## Global Constraints

- Scan every saved OAuth Codex account independently; never infer an account catalog from another account in the same tier.
- Model-cache TTL is exactly 24 hours.
- Global rescan runs at most three OAuth accounts concurrently.
- Strict discovered-model selection blocks Save/Create when any selected member cannot confirm the model. API-key members are therefore incompatible in strict mode until an authenticated provider-specific catalog is implemented.
- Manual model entry remains saveable; unsupported/unverified members produce a warning instead of a block.
- Existing pools without `modelSelectionMode` are normalized as `manual`.
- Preserve the user's exact custom checkbox path geometry; use `currentColor` for theme compatibility.
- Model-list dialog has no fixed minimum tall body and is capped at `min(70vh, 520px)`.
- Do not expose or persist decoded OAuth tokens in the model cache.

---

### Task 1: Add pure model catalog, tier grouping, and validation primitives

**Files:**
- Modify: `src/utils/types.ts`
- Create: `src/utils/codex-models.ts`
- Modify: `src/utils/codex-pools.ts`
- Create: `tests/codex-models.test.mjs`
- Modify: `tests/codex-pools.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

```ts
export interface CodexAvailableModel {
  id: string;
  displayName: string;
  visibility?: string | null;
  supportedInApi?: boolean | null;
}

export interface CodexModelCatalogCacheEntry {
  accountId: string;
  planName: string | null;
  models: CodexAvailableModel[];
  fetchedAt: number;
  error?: string;
}

export type CodexModelSelectionMode = "discovered" | "manual";

export interface CodexTierModelGroup {
  tier: string;
  accountCount: number;
  scannedCount: number;
  failedCount: number;
  models: Array<{ model: CodexAvailableModel; supportCount: number; supportedByAll: boolean }>;
}

export interface CodexPoolModelValidation {
  canSave: boolean;
  warning: boolean;
  incompatibleAccountIds: string[];
  reasons: Record<string, string>;
}
```

Pure exports from `src/utils/codex-models.ts`:

```ts
export const CODEX_MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export function normalizeCodexModelCatalog(raw: unknown): CodexAvailableModel[];
export function isCodexModelCacheFresh(entry: CodexModelCatalogCacheEntry | undefined, now?: number): boolean;
export function buildCodexTierModelGroups(accounts: CodexAccount[], cache: Record<string, CodexModelCatalogCacheEntry>): CodexTierModelGroup[];
export function validateCodexPoolModel(model: string, mode: CodexModelSelectionMode, accountIds: string[], accounts: CodexAccount[], cache: Record<string, CodexModelCatalogCacheEntry>): CodexPoolModelValidation;
```

- [ ] **Step 1: Write failing model-normalization/cache tests**

Add tests that accept common response shapes (`models`, `data`, direct arrays), choose a canonical ID from `slug`, `id`, or `model`, preserve display name when present, trim/deduplicate IDs, and ignore blank records.

```js
assert.deepEqual(normalizeCodexModelCatalog({ models: [
  { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-terra' },
  { model: 'gpt-5.6-sol' },
]}).map((m) => m.id), ['gpt-5.6-terra', 'gpt-5.6-sol']);
```

Verify TTL boundary with injected `now`, and verify an entry carrying `error` is not fresh even when its old successful model list is retained.

Run:

```bash
rm -rf .test-build
pnpm exec tsc src/utils/codex-models.ts src/utils/types.ts --outDir .test-build --module ES2022 --target ES2022 --moduleResolution bundler --skipLibCheck
node --test tests/codex-models.test.mjs
```

Expected: RED because the module/types do not exist yet.

- [ ] **Step 2: Implement the minimum normalizer and freshness logic**

Normalize without plan guesses. Keep raw capability metadata out of the public type unless the UI uses it.

Run the same command. Expected: normalization/cache tests GREEN.

- [ ] **Step 3: Add failing tier grouping and strict/manual validation tests**

Cover:
- tier union/intersection/support counts,
- stale/error cache counted failed,
- discovered model + missing support => `canSave === false`,
- discovered model + API-key member => blocked with explicit reason,
- manual model + same members => `canSave === true`, `warning === true`,
- no selected members remains saveable only if the existing pool editor's non-empty-member policy allows it; do not invent a new minimum-members rule.

- [ ] **Step 4: Implement grouping and validation**

Use each account's own cache. Normalize plan headings by stripping a leading `ChatGPT ` only for presentation; retain unknown/custom tier strings.

- [ ] **Step 5: Extend pool normalization compatibly**

Add to `CodexAccountPool`:

```ts
modelSelectionMode?: CodexModelSelectionMode;
activatedAt?: number;
```

`normalizeCodexPools()` must preserve valid optional values and default missing `modelSelectionMode` to `manual`.

- [ ] **Step 6: Put the tests in CI**

Extend the Linux utility compile command to include `src/utils/codex-models.ts`; add `tests/codex-models.test.mjs` to the Node test command.

Run full local-equivalent frontend utility command and `pnpm build`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/types.ts src/utils/codex-models.ts src/utils/codex-pools.ts tests/codex-models.test.mjs tests/codex-pools.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Codex model catalog rules"
```

---

### Task 2: Add authenticated Codex model-catalog backend request

**Files:**
- Modify: `src-tauri/src/oauth.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write Rust RED tests around URL/request helpers**

Factor deterministic helpers so no live network is required in unit tests:

```rust
const CODEX_MODELS_BASE_URL: &str = "https://chatgpt.com/backend-api/codex/models";
const CODEX_MODELS_COMPAT_CLIENT_VERSION: &str = "0.0.0";
fn codex_models_url(client_version: &str) -> Result<reqwest::Url, String>;
```

Test that `client_version` is always present and encoded. Add a helper test proving a blank account ID is rejected before network I/O.

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml oauth::tests -- --nocapture
```

Expected: RED until helpers exist.

- [ ] **Step 2: Implement the request**

Add:

```rust
pub async fn fetch_chatgpt_models(
    access_token: String,
    account_id: String,
    client_version: Option<String>,
) -> Result<Value, String>
```

Behavior:
- reject blank token/account ID,
- resolve supplied nonblank client version, otherwise compatibility constant,
- GET Codex model catalog,
- bearer auth,
- `ChatGPT-Account-Id` header,
- `Accept: application/json`,
- bounded reqwest timeout,
- return response JSON unchanged to frontend,
- include status code in errors without echoing token/header values.

- [ ] **Step 3: Expose/register Tauri command**

In `src-tauri/src/lib.rs` add wrapper:

```rust
#[tauri::command]
async fn fetch_chatgpt_models(
    access_token: String,
    account_id: String,
    client_version: Option<String>,
) -> Result<serde_json::Value, String> {
    oauth::fetch_chatgpt_models(access_token, account_id, client_version).await
}
```

Register it beside `fetch_chatgpt_usage` in `generate_handler!`.

- [ ] **Step 4: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --verbose
cargo check --manifest-path src-tauri/Cargo.toml --verbose
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/oauth.rs src-tauri/src/lib.rs
git commit -m "feat: fetch account Codex model catalogs"
```

---

### Task 3: Persist and scan account-level model catalogs in App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/utils/types.ts`
- Create: `tests/codex-models-app-contract.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Storage key:** `quotashift_codex_model_catalog_v1`

- [ ] **Step 1: Write source-contract RED tests**

Assert the App contains:
- the storage key,
- `codexModelCache` state/ref,
- load/save helpers,
- `fetchCodexModelCatalog(account, force)`,
- one refresh-token retry on auth failure,
- batches of no more than 3 accounts for global rescan,
- cache deletion when an account is deleted,
- no API-key account sent to `fetch_chatgpt_models`.

Run:

```bash
node --test tests/codex-models-app-contract.test.mjs
```

Expected: RED.

- [ ] **Step 2: Add cache state and persistence**

Load only object entries with matching account IDs and normalized model arrays. Do not copy cache entries during account import ID remapping; imported OAuth accounts scan afresh.

- [ ] **Step 3: Implement per-account scan with one auth retry**

Algorithm:
1. return fresh cache unless `force`,
2. decode OAuth account data,
3. invoke `fetch_chatgpt_models`,
4. normalize models and save `{accountId, planName: account.lastPlan ?? null, models, fetchedAt: Date.now()}`,
5. on 401/expired and refresh token present, invoke existing `refresh_chatgpt_token`, update the saved account token, then retry exactly once,
6. on failure preserve the previous model array/fetchedAt but set `error` so the entry is stale and the UI can show both stale data and failure.

- [ ] **Step 4: Implement max-three global rescan**

Filter OAuth accounts, then process explicit slices of three:

```ts
for (let i = 0; i < oauthAccounts.length; i += 3) {
  const results = await Promise.all(oauthAccounts.slice(i, i + 3).map(...));
  // accumulate success/failure counts
}
```

Expose progress state and final counts; no fourth scan may overlap a batch.

- [ ] **Step 5: Add deletion/import hygiene**

Account deletion removes its cache entry and persists the new map. Import leaves new/remapped account catalogs untrusted/stale.

- [ ] **Step 6: Verify**

```bash
node --test tests/codex-models-app-contract.test.mjs
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/utils/types.ts tests/codex-models-app-contract.test.mjs .github/workflows/ci.yml
git commit -m "feat: cache Codex models per account"
```

---

### Task 4: Replace pool model input and member list with validated controls

**Files:**
- Modify: `src/components/CodexPoolModal.tsx`
- Modify: `src/styles.css`
- Modify: `tests/codex-pools-ui-contract.test.mjs`
- Create: `tests/codex-models-ui-contract.test.mjs`

- [ ] **Step 1: Write RED UI contracts**

Require:
- model textbox has combobox semantics (`role="combobox"`, listbox/options),
- dropdown options are derived from tier groups,
- ordinary typing sets `modelSelectionMode` to `manual`,
- selecting an option sets `discovered`,
- strict validation disables Save when `canSave` false,
- manual warnings are rendered but Save remains available,
- member list has a dedicated class capped to five rows and `overflow-y: auto`,
- each row includes account label/email/plan/compatibility,
- custom checkbox is a keyboard-operable button with `role="checkbox"` and `aria-checked`,
- requested checked/unchecked path data appears verbatim.

- [ ] **Step 2: Extend modal props**

```ts
modelCache: Record<string, CodexModelCatalogCacheEntry>;
onRequestModelScan?: (account: CodexAccount) => void;
```

Compute tier groups and validation via pure utilities. If editing an older pool, initialize mode to `initialPool.modelSelectionMode ?? "manual"`.

- [ ] **Step 3: Build editable combobox**

Use controlled text input plus an in-DOM listbox. Filter options case-insensitively by model ID/display name. Group options with tier headings and support counts.

Do not silently convert typed text to `discovered`; only option click/keyboard selection does that.

- [ ] **Step 4: Build five-row member list and custom checks**

Use a row height of 34px and:

```css
.codex-pool-member-list {
  max-height: 170px;
  overflow-y: auto;
}
```

Button SVG checked path:

```text
m24 24h-24v-24h18.4v2.4h-16v19.2h20v-8.8h2.4v11.2zm-19.52-12.42 1.807-1.807 5.422 5.422 13.68-13.68 1.811 1.803-15.491 15.491z
```

Unchecked path:

```text
m24 24h-24v-24h24.8v24zm-1.6-2.4v-19.2h-20v19.2z
```

- [ ] **Step 5: Verify**

```bash
node --test tests/codex-pools-ui-contract.test.mjs tests/codex-models-ui-contract.test.mjs
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/CodexPoolModal.tsx src/styles.css tests/codex-pools-ui-contract.test.mjs tests/codex-models-ui-contract.test.mjs
git commit -m "feat: validate Codex pool models"
```

---

### Task 5: Add per-account available-model dialog

**Files:**
- Create: `src/components/CodexAvailableModelsDialog.tsx`
- Modify: `src/components/CodexTab.tsx`
- Modify: `src/styles.css`
- Modify: `tests/codex-models-ui-contract.test.mjs`

- [ ] **Step 1: Add failing contracts**

Require account-card icon button with tooltip exactly `Show available models`; dialog content includes account identity, plan, scan time/status, filter input, model list, and `Rescan`.

- [ ] **Step 2: Implement dialog**

Props:

```ts
isOpen: boolean;
account: CodexAccount | null;
entry?: CodexModelCatalogCacheEntry;
onClose: () => void;
onRescan: (account: CodexAccount) => Promise<void> | void;
```

The outer dialog uses `height:auto`, no inherited 370px min height, and `max-height:min(70vh, 520px)`. Only `.codex-model-dialog-list` scrolls.

- [ ] **Step 3: Add model icon action to cards**

Place before Apply/Active. Stop event propagation so it does not change tray tracking. Use an inline SVG that visually means models/layers, not a text glyph.

- [ ] **Step 4: Verify**

```bash
node --test tests/codex-models-ui-contract.test.mjs
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/CodexAvailableModelsDialog.tsx src/components/CodexTab.tsx src/styles.css tests/codex-models-ui-contract.test.mjs
git commit -m "feat: show Codex account model catalogs"
```

---

### Task 6: Add global rescan setting and integrate Phase 1 end-to-end

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/CodexTab.tsx`
- Modify: `src/components/CodexPoolModal.tsx`
- Modify: `src/styles.css`
- Modify: `tests/codex-models-app-contract.test.mjs`
- Modify: `tests/codex-models-ui-contract.test.mjs`

- [ ] **Step 1: Add RED integration contracts**

Require Header props and a settings menu item labeled exactly `Rescan all Codex models`, disabled/spinner state while scanning, App wiring of cache/rescan callbacks into CodexTab/PoolModal, and toast summary counts.

- [ ] **Step 2: Wire the settings action**

Header props:

```ts
isRescanningCodexModels: boolean;
onRescanCodexModels: () => void;
```

Menu item closes the gear dropdown after starting the action. App shows success/warning toast with `N scanned, M failed`.

- [ ] **Step 3: Wire dialogs and editor**

Pass `codexModelCache` and per-account rescan callback to `CodexTab`; pass the cache to `CodexPoolModal`.

When opening pool editor, background-scan stale/missing selected OAuth members without blocking the modal from opening; strict Save remains disabled until required scan state resolves.

- [ ] **Step 4: Run all Phase 1 tests**

```bash
rm -rf .test-build
pnpm exec tsc src/utils/account-selection.ts src/utils/codex-pools.ts src/utils/codex-usage-windows.ts src/utils/codex-models.ts src/utils/types.ts --outDir .test-build --module ES2022 --target ES2022 --moduleResolution bundler --skipLibCheck
node --test tests/codex-models.test.mjs tests/codex-models-app-contract.test.mjs tests/codex-models-ui-contract.test.mjs tests/codex-pools.test.mjs tests/codex-pools-ui-contract.test.mjs tests/codex-pools-app-contract.test.mjs tests/codex-usage-windows.test.mjs tests/codex-usage-card-contract.test.mjs tests/antigravity-runtime-switch-contract.test.mjs
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --verbose
cargo check --manifest-path src-tauri/Cargo.toml --verbose
```

- [ ] **Step 5: Push and require full GitHub Actions Linux + Windows CI green**

Do not start Phase 2 until this exact Phase 1 head passes the repository CI matrix.

- [ ] **Step 6: Commit any integration-only changes**

```bash
git add src/components/Header.tsx src/App.tsx src/components/CodexTab.tsx src/components/CodexPoolModal.tsx src/styles.css tests .github/workflows/ci.yml
git commit -m "feat: complete Codex model discovery UI"
```
