import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trackedCacheMaxAgeMs } from "../../.test-build/common/poll-interval.js";
import {
  TRACKED_LIST_KEY,
  trackedClaudeAccountIds,
} from "../../.test-build/common/tracked-accounts.js";

import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../.test-build/common/app-constants.js";

const read = (path) => readFileSync(path, "utf8");

function storageWith(entries) {
  const map = new Map(Object.entries(entries));
  return { getItem: (key) => map.get(key) ?? null };
}

test("a tracked cache is stale again by the next scheduled tick, even after a slow fetch", () => {
  for (const secs of [5, 30, 120, 1200]) {
    const interval = secs * 1000;
    // The cache is stamped when the fetch finishes, so it is a little younger than one interval
    // when the next tick arrives. Fetches of up to 10s (or half the interval) must not make the
    // tick skip the account.
    const fetchTook = Math.min(10_000, Math.round(interval / 2));
    const ageAtNextTick = interval - fetchTook;
    assert.ok(
      ageAtNextTick >= trackedCacheMaxAgeMs(secs),
      `${secs}s: age ${ageAtNextTick} must reach ${trackedCacheMaxAgeMs(secs)}`,
    );
  }
});

test("the tracked cache lifetime never exceeds the poll interval and never goes below 2.5s", () => {
  for (const secs of [1, 5, 30, 1200]) {
    const ms = trackedCacheMaxAgeMs(secs);
    assert.ok(ms <= Math.max(5000, secs * 1000));
    assert.ok(ms >= 2500);
  }
});

test("Codex and Antigravity tracked accounts use the shared cache lifetime", () => {
  const codex = read("src/hooks/codex/useCodexUsageFetcher.ts");
  const antigravity = read("src/utils/antigravity/app-antigravity-ops.ts");
  for (const [name, source] of [
    ["codex", codex],
    ["antigravity", antigravity],
  ]) {
    assert.match(source, /trackedCacheMaxAgeMs\(/, `${name} must use trackedCacheMaxAgeMs`);
    assert.doesNotMatch(
      source,
      /Math\.max\(5000,\s*\w+\(\)\s*\*\s*1000\)/,
      `${name} must not compare cache age with the raw interval`,
    );
  }
});

test("every tracked Claude account is listed, plus a primary Claude account", () => {
  const list = [
    { provider: "claude", id: "claude-a" },
    { provider: "codex", id: "codex-1" },
    { provider: "claude", id: "claude-b" },
  ];
  assert.deepEqual(
    trackedClaudeAccountIds(storageWith({ [TRACKED_LIST_KEY]: JSON.stringify(list) })),
    ["claude-a", "claude-b"],
  );
  assert.deepEqual(
    trackedClaudeAccountIds(
      storageWith({
        [TRACKED_LIST_KEY]: JSON.stringify([{ provider: "codex", id: "codex-1" }]),
        [OVERLAY_TRACKED_PROVIDER_KEY]: "claude",
        [OVERLAY_TRACKED_ACCOUNT_ID_KEY]: "claude-p",
      }),
    ),
    ["claude-p"],
  );
  assert.deepEqual(trackedClaudeAccountIds(storageWith({})), []);
});

test("Claude fast-polls every tracked account, not only the primary one", () => {
  const monitor = read("src/hooks/claude/useClaudeMonitor.ts");
  const accountMonitor = read("src/hooks/claude/useClaudeAccountMonitor.ts");
  assert.match(monitor, /useTrackedClaudeAccountIds\(\)/);
  assert.match(
    monitor,
    /isClaudeTracked\s*=\s*trackedProvider === "claude" \|\| trackedClaudeAccountIds\.length > 0/,
  );
  assert.match(
    accountMonitor,
    /monitoredAccountIds,\s*\n\s*onlyWatchProcessingAccounts,\s*\n\s*refreshAccountId/,
  );
  assert.doesNotMatch(accountMonitor, /monitoredAccountId\b/);
  const rust = read("src-tauri/src/claude/accounts.rs");
  assert.match(rust, /monitored_account_ids: Option<Vec<String>>/);
});
