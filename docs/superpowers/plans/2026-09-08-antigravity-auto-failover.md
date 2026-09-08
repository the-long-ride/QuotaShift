# Antigravity Automatic Failover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically move an exhausted active Antigravity session to the best usable saved account, using bottleneck quota scoring, round-robin tie handling, and cooldown/hysteresis while reusing the existing IDE/`agy` runtime-aware switch path.

**Architecture:** Keep exhaustion detection and decision state in a pure frontend utility so it can be deterministic and testable from saved account/cache data. `App.tsx` owns preference persistence, refresh-trigger integration, one-at-a-time switch orchestration, and toast reporting. The existing backend `switch_antigravity_account` remains the only credential/runtime switching mechanism.

**Tech Stack:** React 19, TypeScript 5.6, existing Antigravity cloud quota model, Node built-in test runner, Tauri runtime switch command.

**Spec:** `docs/superpowers/specs/2026-09-08-codex-routing-model-discovery-usage-dashboard-design.md`

## Global Constraints

- Automatic failover triggers only when the currently applied account is known exhausted/unusable; never switch just because another account has more remaining quota.
- Missing quota windows are unknown, not fabricated.
- Any authoritative relevant returned window at 0% or an explicit disabled/exhausted state can trigger failover.
- Candidate score is the minimum relevant remaining window.
- Exact ties rotate; do not pin equal candidates to the first array member forever.
- Minimum automatic-switch cooldown is 60 seconds.
- The just-abandoned account is ineligible while the quota cause that triggered abandonment still reports exhausted.
- Only one automatic failover can execute at once.
- Manual Apply remains immediate and is not blocked by automatic-failover cooldown.
- Reuse `handleApplyAntigravityAccount`; do not duplicate IDE/CLI process switching in frontend.

---

### Task 1: Add pure exhaustion and decision state

**Files:**
- Create: `src/utils/antigravity-failover.ts`
- Create: `tests/antigravity-failover.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

```ts
export interface AntigravityExhaustion {
  exhausted: boolean;
  causeKeys: string[];
}

export interface AntigravityFailoverState {
  lastSwitchAt: number | null;
  abandonedAccountId: string | null;
  abandonedCauseKeys: string[];
  tieCursor: number;
}

export interface AntigravityFailoverDecision {
  account: AntigravityAccount;
  score: number;
  causeKeys: string[];
  nextState: AntigravityFailoverState;
}

export function getAntigravityExhaustion(
  account: AntigravityAccount,
  cache: AntigravityUsageCacheEntry | undefined,
): AntigravityExhaustion;

export function chooseAntigravityFailover(
  currentAccountId: string,
  accounts: AntigravityAccount[],
  cache: Record<string, AntigravityUsageCacheEntry>,
  state: AntigravityFailoverState,
  now?: number,
): AntigravityFailoverDecision | null;
```

- [ ] **Step 1: Write RED exhaustion tests**

Cloud grouped quota cases:
- 5h 0 + weekly 80 => exhausted,
- 5h 60 + weekly 0 => exhausted,
- both >0 => not exhausted,
- weekly-only >0 => not exhausted,
- missing weekly is not zero,
- `fiveHourDisabled`/`weeklyDisabled` means unavailable/exhausted for that returned lane,
- legacy fallback uses existing percentage fields only when authoritative cloud quotas are unavailable.

Run:

```bash
rm -rf .test-build
pnpm exec tsc src/utils/account-selection.ts src/utils/antigravity-failover.ts src/utils/types.ts --outDir .test-build --module ES2022 --target ES2022 --moduleResolution bundler --skipLibCheck
node --test tests/antigravity-failover.test.mjs
```

Expected: RED.

- [ ] **Step 2: Implement exhaustion inspection**

Give each cause a stable key such as `${modelId}:5h` and `${modelId}:weekly`. If exact current model family is unavailable, inspect all authoritative grouped pools conservatively.

- [ ] **Step 3: Add RED decision tests**

Cover:
- current not exhausted => null even when another account is 100%,
- current exhausted => highest bottleneck candidate,
- `100/1` loses to `60/60`,
- equal top candidates rotate based on `tieCursor`,
- no usable candidate => null,
- less than 60s since automatic switch => null,
- abandoned account excluded while any recorded cause key is still exhausted,
- abandoned account becomes eligible after its cause recovers,
- stale/error candidate does not outrank a fresh known candidate.

- [ ] **Step 4: Implement decision logic**

Reuse `scoreAntigravityAccountUsage` for candidate bottleneck value where its semantics match, but make exhaustion eligibility explicit from `getAntigravityExhaustion` instead of treating unknown as exhausted.

For ties, sort account IDs before rotating so reordering UI cards does not unexpectedly reset tie order.

- [ ] **Step 5: Add to CI and verify**

Include `src/utils/antigravity-failover.ts` in utility compilation and `tests/antigravity-failover.test.mjs` in Node tests.

- [ ] **Step 6: Commit**

```bash
git add src/utils/antigravity-failover.ts tests/antigravity-failover.test.mjs .github/workflows/ci.yml
git commit -m "feat: add Antigravity failover decisions"
```

---

### Task 2: Add preference and settings control

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/styles.css`
- Create: `tests/antigravity-failover-app-contract.test.mjs`

**Preference key:** `quotashift_antigravity_auto_failover_v1`

- [ ] **Step 1: Write RED source contract**

Require:
- state initialized from localStorage,
- Header receives enabled/toggle props,
- settings item label `Antigravity Auto Failover`,
- toggle is persisted immediately,
- disabling clears in-memory automatic decision/latch state but does not switch accounts.

- [ ] **Step 2: Add App state/ref**

```ts
const [antigravityAutoFailoverEnabled, setAntigravityAutoFailoverEnabled] = useState(...);
const antigravityFailoverStateRef = useRef<AntigravityFailoverState>(...);
const antigravityFailoverInFlightRef = useRef(false);
const antigravityFailoverNoticeRef = useRef<string | null>(null);
```

- [ ] **Step 3: Add Header setting**

Use the existing gear-dropdown row/toggle-dot pattern. Tooltip/title explains that switching happens only when the applied account is exhausted.

- [ ] **Step 4: Verify and commit**

```bash
node --test tests/antigravity-failover-app-contract.test.mjs
pnpm build
git add src/App.tsx src/components/Header.tsx src/styles.css tests/antigravity-failover-app-contract.test.mjs
git commit -m "feat: add Antigravity failover setting"
```

---

### Task 3: Integrate failover after authoritative refreshes

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/antigravity-failover-app-contract.test.mjs`
- Modify: `tests/antigravity-runtime-switch-contract.test.mjs`

- [ ] **Step 1: Add RED orchestration contracts**

Require function:

```ts
const maybeAutoFailoverAntigravity = async (): Promise<void> => { ... }
```

Assert it:
- uses `lastAppliedAntigravityIdRef.current` / applied account, not merely tracked card ID,
- calls `chooseAntigravityFailover`,
- guards with in-flight ref,
- calls `handleApplyAntigravityAccount(decision.account)` rather than backend session commands directly,
- stamps failover state only after successful Apply,
- emits warning toast when current is exhausted but no eligible candidate, with a latch to avoid polling spam.

- [ ] **Step 2: Make Apply report success to automatic orchestration**

Refactor `handleApplyAntigravityAccount` to return `Promise<boolean>` or throw on failure while preserving existing button callers. Do not mark success before backend credential replacement succeeds.

Manual Apply updates last-used metadata later in Phase 4 but does not mutate automatic cooldown unless called by the failover wrapper.

- [ ] **Step 3: Call failover only after cache updates are complete**

Invoke `maybeAutoFailoverAntigravity()` after:
- `refreshAntigravityAccountsCloudFirst` completes a batch that includes the applied account,
- forced refresh finishes all Antigravity account refreshes,
- background status/refresh path has refreshed independent saved-account cloud summaries.

Avoid calling it from inside each per-account `fetchAntigravityAccountQuota` before the full candidate set is current.

- [ ] **Step 4: Record cooldown and abandonment cause**

On successful automatic switch:

```ts
antigravityFailoverStateRef.current = {
  ...decision.nextState,
  lastSwitchAt: Date.now(),
  abandonedAccountId: previousAppliedId,
  abandonedCauseKeys: decision.causeKeys,
};
```

The new active account must not be immediately re-evaluated until the current refresh cycle completes.

- [ ] **Step 5: Verify no runtime-switch regression**

```bash
node --test tests/antigravity-failover.test.mjs tests/antigravity-failover-app-contract.test.mjs tests/antigravity-runtime-switch-contract.test.mjs
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx tests/antigravity-failover-app-contract.test.mjs tests/antigravity-runtime-switch-contract.test.mjs
git commit -m "feat: auto fail over exhausted Antigravity sessions"
```

---

### Task 4: Harden round-robin/hysteresis and finish Phase 3

**Files:**
- Modify as needed: `src/utils/antigravity-failover.ts`, `src/App.tsx`, tests

- [ ] **Step 1: Add edge-case tests**

Cover:
- account deleted while it is `abandonedAccountId`,
- active account ID absent from saved accounts,
- failed automatic switch does not start 60s cooldown,
- repeated exhausted polling during no-candidate condition produces one warning until state changes,
- recovered quota clears no-candidate warning latch,
- tie cursor survives a failed candidate and chooses the next equal candidate on the next eligible evaluation.

- [ ] **Step 2: Implement only the missing hardening**

Keep state local/in-memory except the enabled preference. No separate persistent round-robin database is needed.

- [ ] **Step 3: Full Phase 3 verification**

```bash
rm -rf .test-build
pnpm exec tsc src/utils/account-selection.ts src/utils/antigravity-failover.ts src/utils/codex-pools.ts src/utils/codex-models.ts src/utils/codex-usage-windows.ts src/utils/types.ts --outDir .test-build --module ES2022 --target ES2022 --moduleResolution bundler --skipLibCheck
node --test tests/antigravity-failover.test.mjs tests/antigravity-failover-app-contract.test.mjs tests/antigravity-runtime-switch-contract.test.mjs
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --verbose
cargo check --manifest-path src-tauri/Cargo.toml --verbose
```

Run the entire Node suite configured in CI as well.

- [ ] **Step 4: Push and require Linux + Windows CI green**

Do not start Phase 4 until this exact Phase 3 head passes both matrix jobs.

- [ ] **Step 5: Commit final hardening if changed**

```bash
git add src/utils/antigravity-failover.ts src/App.tsx tests
git commit -m "test: harden Antigravity automatic failover"
```
