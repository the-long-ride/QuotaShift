# Codex Model Pools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted Codex model pools that aggregate known account capacity, apply the best eligible member with a model override, optionally fail over when the active member is exhausted, and round-trip through backup/import.

**Architecture:** Keep pool rules in a pure `src/utils/codex-pools.ts` module. Render pools with dedicated card/editor components, while `App.tsx` owns persistence, refresh orchestration, apply/failover state, and backup reconciliation. Existing individual Codex account behavior remains intact.

**Tech Stack:** React 19, TypeScript 5.6, Tauri 2, Node built-in test runner, existing QuotaShift account-selection utilities.

**Spec:** `docs/superpowers/specs/2026-09-07-codex-model-pools-design.md`

## Global Constraints

- Storage key is exactly `quotashift_codex_account_pools_v1`.
- Pool model is a free-form non-blank string; do not hardcode a model catalog.
- Pools store account IDs only; credentials remain on `CodexAccount` records.
- One account may belong to multiple pools.
- Missing/error/stale quota data must remain unknown; never convert it to 0% or 100%.
- OAuth percentage capacity is additive in percentage-points; API-key billing data is excluded from pool percentage aggregation.
- Direct account Apply keeps `model: null`; pool Apply passes the pool model.
- Auto-switch is opt-in and only acts for the currently active pool when the applied member is exhausted or unusable and a strictly better member exists.
- Backup format remains version 2 and `codex.pools` is optional for backward compatibility.

---

### Task 1: Pure pool model and capacity logic

**Files:**
- Modify: `src/utils/types.ts`
- Create: `src/utils/codex-pools.ts`
- Create: `tests/codex-pools.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `CodexAccountPool`, `CodexPoolLaneCapacity`, `CodexPoolCapacity`.
- Produces: `normalizeCodexPools`, `reconcileCodexPools`, `aggregateCodexPoolCapacity`, `pickBestCodexPoolMember`, `findCodexPoolFailover`.
- Consumes: existing `scoreCodexAccountUsage` / `pickBestCodexAccount` semantics.

- [ ] **Step 1: Write failing pool tests**

Cover these behaviors in `tests/codex-pools.test.mjs`:

```js
assert.deepEqual(aggregate.primary, {
  remainingPoints: 120,
  capacityPoints: 200,
  knownMembers: 2,
  totalMembers: 3,
  nextResetAt: null,
});
assert.equal(aggregate.secondary.remainingPoints, 80);
assert.equal(aggregate.secondary.capacityPoints, 100);
assert.equal(best.account.id, 'oauth-b');
assert.equal(findCodexPoolFailover(pool, 'oauth-a', accounts, cache)?.account.id, 'oauth-b');
```

Also verify unknown/error members do not increase capacity, deleted IDs are removed, blank model pools are rejected, and API-key members are only used as best-member fallback when no healthy OAuth member exists.

- [ ] **Step 2: Make CI execute frontend utility tests**

Compile the pure TypeScript utility and its dependencies into `.test-build` before running Node tests:

```yaml
- name: Frontend utility tests
  if: matrix.os-name == 'linux'
  run: |
    rm -rf .test-build
    pnpm exec tsc src/utils/account-selection.ts src/utils/codex-pools.ts src/utils/types.ts --outDir .test-build --module ES2022 --target ES2022 --moduleResolution bundler --skipLibCheck
    node --test tests/codex-pools.test.mjs
```

- [ ] **Step 3: Run CI and verify RED**

Expected: `codex-pools.test.mjs` fails because `src/utils/codex-pools.ts` / required exports do not exist yet.

- [ ] **Step 4: Implement minimal pure pool logic**

`CodexAccountPool`:

```ts
export interface CodexAccountPool {
  id: string;
  name: string;
  model: string;
  accountIds: string[];
  autoSwitch: boolean;
}
```

Lane aggregation uses `remaining = 100 - clamp(used_percent)` only for healthy OAuth cache entries. `nextResetAt` is the earliest reset among exhausted known members.

`pickBestCodexPoolMember` first scores healthy OAuth members in the pool; only if none are scoreable may it consider API-key members.

`findCodexPoolFailover` returns `null` unless the current account belongs to the pool and is exhausted/unusable; the replacement must have a strictly greater score.

- [ ] **Step 5: Run the utility tests and build**

Expected: pool utility tests pass and `pnpm build` succeeds.

---

### Task 2: Pool cards and editor UI

**Files:**
- Create: `src/components/CodexPoolCard.tsx`
- Create: `src/components/CodexPoolModal.tsx`
- Modify: `src/components/CodexTab.tsx`
- Create: `tests/codex-pools-ui-contract.test.mjs`

**Interfaces:**
- `CodexPoolCard` consumes pool/accounts/cache/active state and emits apply/edit/delete actions.
- `CodexPoolModal` consumes optional initial pool plus accounts and emits a validated `CodexAccountPool`.
- `CodexTab` gains `pools`, `activePoolId`, `onNewPool`, `onEditPool`, `onDeletePool`, `onApplyPool` props.

- [ ] **Step 1: Write failing UI contract test**

Assert source contains:

```js
assert.match(tab, /Model Pools/);
assert.match(tab, /onApplyPool/);
assert.match(card, /Apply best/);
assert.match(modal, /autoSwitch/);
assert.match(modal, /model/);
```

Also assert existing individual account actions (`onApply`, `onTrack`, `onSwitchBest`) remain in `CodexTab.tsx`.

- [ ] **Step 2: Implement `CodexPoolCard`**

Show pool name, model, member count, active badge, two additive capacity lanes, known-member counts, API-key member count, and Apply best/Edit/Delete actions. Use existing account-card/progress classes so no new visual dependency is introduced.

- [ ] **Step 3: Implement `CodexPoolModal`**

Use `AccountModalLayout`. Validate trimmed `name` and `model`; render all saved accounts as checkboxes and an `autoSwitch` checkbox. Preserve an existing pool ID on edit and generate a new ID for creation.

- [ ] **Step 4: Integrate pool section into `CodexTab`**

Render Model Pools above individual accounts, including when there are zero accounts so empty pools remain editable. Keep existing account cards and Best action unchanged.

- [ ] **Step 5: Run UI contract and frontend build**

Expected: UI contract passes and TypeScript/Vite build succeeds.

---

### Task 3: Persistence, CRUD, and model-aware apply

**Files:**
- Modify: `src/App.tsx`
- Create: `tests/codex-pools-app-contract.test.mjs`

**Interfaces:**
- App owns `codexPools` and `activeCodexPoolId` state.
- `handleApplyCodexAccount(acc, modelOverride?, poolId?)` preserves direct-account behavior and accepts pool context.
- Pool CRUD persists through `quotashift_codex_account_pools_v1`.

- [ ] **Step 1: Write failing App contract tests**

Assert:

```js
assert.match(app, /quotashift_codex_account_pools_v1/);
assert.match(app, /modelOverride/);
assert.match(app, /sync_codex_provider_config[\s\S]*model:/);
assert.match(app, /sync_codex_config[\s\S]*model:/);
assert.match(app, /handleApplyBestCodexPool/);
```

Verify direct `CodexTab` account apply still calls `handleApplyCodexAccount` without a pool model.

- [ ] **Step 2: Add pool load/save/reconcile helpers and state**

Load normalized pools, reconcile them against current Codex accounts at startup, and persist any removed stale IDs.

- [ ] **Step 3: Extend Codex Apply**

Normalize `modelOverride?.trim() || null` and pass it to both OAuth `sync_codex_provider_config` and API-key `sync_codex_config`. Direct account Apply clears active pool context; pool Apply records the pool ID.

- [ ] **Step 4: Add pool CRUD and Apply best**

Pool Apply refreshes all existing members, selects via `pickBestCodexPoolMember`, leaves the current session unchanged when none are usable, and applies the winner with the pool model.

- [ ] **Step 5: Reconcile pool membership on account deletion**

Remove the deleted account ID from every pool and save the resulting pool array. Do not delete an empty pool.

- [ ] **Step 6: Run App contract and frontend build**

Expected: contracts and build pass.

---

### Task 4: Backup compatibility

**Files:**
- Modify: `src/App.tsx`
- Extend: `tests/codex-pools-app-contract.test.mjs`

**Interfaces:**
- Export adds optional `platforms.codex.pools` without changing backup version.
- Import remaps pool member IDs when an imported account is merged into an existing account by email.

- [ ] **Step 1: Add failing backup contract assertions**

Assert export includes `pools: loadCodexPools()` and import accepts `Array.isArray(pData.pools)`.

- [ ] **Step 2: Implement export**

Add the normalized current pools beside `codex.accounts` and `codex.activeId`.

- [ ] **Step 3: Implement import remapping**

Build an imported-ID → saved-ID map while merging Codex accounts. Normalize imported pools, remap their `accountIds`, drop unknown IDs, merge by pool ID, reconcile against saved accounts, and save. Old backups with no `pools` leave existing pools unchanged.

- [ ] **Step 4: Run contract/build**

Expected: contract and build pass.

---

### Task 5: Active-pool automatic failover

**Files:**
- Modify: `src/App.tsx`
- Extend: `tests/codex-pools-app-contract.test.mjs`

**Interfaces:**
- `maybeAutoFailoverActiveCodexPool()` uses `findCodexPoolFailover` and the current cache.
- A ref stores the last failover decision key to suppress duplicate writes.

- [ ] **Step 1: Add failing failover orchestration assertions**

Assert `triggerRefresh` invokes `maybeAutoFailoverActiveCodexPool` after member refresh, and `status-updated` does the same after Codex refreshes.

- [ ] **Step 2: Implement failover orchestration**

For the active auto-switch pool, if the applied member is exhausted/unusable and a strictly better pool member exists, apply that account with the same pool model without prompting. Clear the latch when no failover is needed.

- [ ] **Step 3: Preserve pool model during token refresh**

When refreshing the currently applied OAuth account, derive the model override from the active pool instead of always writing `model: null`.

- [ ] **Step 4: Run contracts/build**

Expected: all frontend contracts and build pass.

---

### Task 6: Final verification and PR update

**Files:**
- Modify: PR #11 description only if implementation is green.

- [ ] **Step 1: Run full CI**

Required evidence:
- Linux frontend utility/contract tests pass.
- Linux and Windows frontend builds pass.
- Linux Rust tests pass.
- Linux and Windows Rust check pass.

- [ ] **Step 2: Review diff against spec**

Confirm all nine testing requirements in the design are represented by executable utility tests, source contracts, or full build coverage; confirm no model catalog was introduced and direct-account behavior remains available.

- [ ] **Step 3: Update PR #11 description**

Add implemented Codex model-pool behavior and final CI run number/link. Do not claim completion before the green CI run is visible.
