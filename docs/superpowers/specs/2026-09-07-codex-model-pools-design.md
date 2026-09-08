# Codex Model Pools Design

Date: 2026-09-07
Status: proposed for implementation review
Branch: `feat/keep-alive-all-antigravity-accounts`

## Goal

Allow a QuotaShift user to group multiple saved Codex accounts into named, model-oriented pools such as `GPT-5.6-Terra`, `GPT-5.6-Sol`, or `GPT-6-Astra`. A pool represents combined account capacity for one configured Codex model and can choose the best eligible member when activated.

This is an operational account-switching feature, not a per-request proxy/router. QuotaShift continues to write one active Codex account to the local Codex configuration at a time.

## User experience

The Codex tab gains a **Model Pools** section above individual account cards.

Each pool card shows:

- pool name;
- configured model string;
- member count;
- currently applied member, if any;
- combined primary/session capacity across members;
- combined secondary/weekly capacity across members when available;
- member health summary such as available, exhausted, stale, or error;
- **Apply best** action;
- edit and delete actions.

A **New Pool** action opens a pool editor. The editor accepts a free-form model string so new models do not require an application release. It also shows all saved Codex accounts as checkboxes. An account may belong to more than one pool.

Individual account cards remain available and behave exactly as they do today.

## Data model

Add a frontend-only persisted model:

```ts
interface CodexAccountPool {
  id: string;
  name: string;
  model: string;
  accountIds: string[];
  autoSwitch: boolean;
}
```

Storage key: `quotashift_codex_account_pools_v1`.

Pools store account IDs only. Credentials remain exclusively on existing `CodexAccount` records. Deleting an account removes that ID from every pool; an empty pool remains editable instead of being silently deleted.

The backup format gains an optional `codex.pools` array. Old backups without pools continue to import unchanged.

## Capacity aggregation

Codex OAuth accounts expose primary and secondary rate-limit windows. Pool aggregation treats each member as one unit of capacity and adds remaining percentages rather than averaging them.

For a pool with three accounts whose weekly remaining percentages are 80%, 40%, and 100%, the pool reports `220 / 300` percentage-points, equivalent to `2.20 account units` remaining.

For each lane the pool exposes:

- `remainingPoints`: sum of known member remaining percentages;
- `capacityPoints`: 100 multiplied by the count of members that have that lane;
- `knownMembers`: members with usable data;
- `totalMembers`: configured members;
- earliest next reset among known exhausted/depleted members for context.

Missing/error/stale data is never converted into 0% or 100%. The UI shows how many members are known so the combined number is not misleading.

API-key billing accounts do not have the same session/weekly quota semantics. They can be pool members, but their spend-based data is excluded from percentage-point aggregation and labeled separately. V1 best-member selection prefers members with comparable OAuth quota data; API-key members remain eligible only when the pool has no healthy OAuth candidate.

## Best-member selection

Reuse the existing `pickBestCodexAccount` scoring behavior, scoped to a pool's `accountIds`.

When the user selects **Apply best**:

1. refresh usage for all pool members;
2. remove missing/deleted members from the candidate set;
3. ignore members whose refresh returns an error when at least one healthy candidate exists;
4. pick the highest-scoring member using the existing Codex quota scorer;
5. write that account to Codex auth/config;
6. write the pool's `model` to Codex provider configuration instead of `model: null`;
7. mark the chosen account as the applied account and the pool as active in UI state.

If no candidate can be scored, QuotaShift reports that the pool has no usable account and does not rewrite the current Codex session.

## Automatic failover

`autoSwitch` is opt-in per pool.

When a pool is active and `autoSwitch` is enabled, normal QuotaShift polling may switch to another member only when:

- the currently applied account is a member of that pool;
- refreshed quota data shows the current member is exhausted or unusable;
- another healthy member has strictly better remaining capacity.

A debounce/latch prevents repeated writes during the same refresh cycle. V1 does not intercept Codex requests and does not switch on every request.

## Configuration behavior

`handleApplyCodexAccount` is extended with an optional model override. Existing direct-account Apply calls continue passing no override and preserve the current behavior (`model: null`). Pool Apply passes the pool's configured model string.

Both ChatGPT OAuth and API-key apply paths use the same optional model override when syncing Codex configuration.

## Components and boundaries

### `src/utils/codex-pools.ts`

Pure pool logic:

- validation/normalization;
- remove deleted members;
- aggregate pool capacity;
- select the best member from existing usage cache;
- detect whether failover is warranted.

This module has no React, localStorage, or Tauri dependency and is unit-testable.

### `src/components/CodexPoolCard.tsx`

Renders one pool and emits actions. It does not mutate storage or select accounts itself.

### `src/components/CodexPoolModal.tsx`

Creates/edits pool metadata and membership. Model is free-form text. Account selection uses existing saved Codex accounts.

### `src/components/CodexTab.tsx`

Renders the pool section and existing individual account list. Receives pools and pool action callbacks from `App.tsx`.

### `src/App.tsx`

Owns persisted pool state, account refresh orchestration, apply-best behavior, auto-failover latch, account-delete reconciliation, and backup import/export.

### `src/utils/types.ts`

Adds `CodexAccountPool` and normalized pool-capacity types.

## Error handling

- A pool may contain stale IDs after manual storage edits/imports; they are ignored and removed on the next save/reconciliation.
- A member refresh error does not fail the entire pool when another member is usable.
- If every member fails, the active Codex auth/config is left unchanged.
- Missing quota windows remain unknown and reduce `knownMembers`; they are never fabricated.
- Invalid/blank model strings are rejected by the pool editor.
- Duplicate pool names are allowed; pool IDs remain authoritative.

## Backup compatibility

Export version remains readable by older QuotaShift builds because pool data is an additional optional field under the Codex platform object. Import accepts:

- backups with no pool data;
- valid pool arrays;
- pool arrays referencing accounts that were not imported, in which case unknown IDs are dropped.

## Testing

TDD coverage will include:

1. aggregate primary and secondary capacity across multiple OAuth members;
2. do not fabricate capacity for missing/error members;
3. best-member selection is limited to pool membership;
4. deleted account IDs are removed from pools;
5. direct account Apply still uses no model override;
6. pool Apply writes its model override;
7. auto-failover only triggers for an active auto-switch pool whose current member is exhausted/unusable;
8. backup round-trip preserves pools and old backups without pools remain valid;
9. Codex tab renders pool controls without removing existing account-card behavior.

## Non-goals for v1

- No HTTP proxy or per-request model router.
- No account switching in the middle of an active Codex request.
- No attempt to infer provider-side per-model quota when OpenAI only reports account-level windows.
- No hardcoded catalog of model names; the model field remains forward-compatible free text.
