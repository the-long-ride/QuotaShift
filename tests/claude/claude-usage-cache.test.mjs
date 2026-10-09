import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLAUDE_USAGE_CACHE_KEY,
  mergeClaudeUsageCache,
} from "../../.test-build/claude/claude-usage-cache.js";

const memory = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};
const status = (id, extra = {}) => ({
  account: { id },
  fiveHour: null,
  sevenDay: null,
  usageFresh: false,
  usageFetchedAt: null,
  suspended: false,
  suspendedProcessCount: 0,
  error: null,
  ...extra,
});
const win = (usedPercentage, resetsAt = null) => ({ usedPercentage, resetsAt });
const NOW = 1000;

test("good usage is remembered, then refills a status that arrives without data", () => {
  const storage = memory();
  const fresh = status("a", {
    fiveHour: win(20),
    sevenDay: win(5),
    usageFresh: true,
    usageFetchedAt: 100,
  });
  assert.deepEqual(mergeClaudeUsageCache([fresh], storage, NOW), [fresh]);
  assert.ok(storage.map.has(CLAUDE_USAGE_CACHE_KEY));

  const offline = status("a", { error: "no quota lines" });
  const [merged] = mergeClaudeUsageCache([offline], storage, NOW);
  assert.deepEqual(merged.fiveHour, win(20));
  assert.deepEqual(merged.sevenDay, win(5));
  assert.equal(merged.usageFetchedAt, 100);
  assert.equal(merged.usageFresh, false);
  assert.equal(merged.error, "no quota lines");
});

test("partial data keeps live windows and only fills the missing one", () => {
  const storage = memory();
  mergeClaudeUsageCache(
    [status("a", { fiveHour: win(30), sevenDay: win(9), usageFetchedAt: 7 })],
    storage,
    NOW,
  );
  const [merged] = mergeClaudeUsageCache([status("a", { fiveHour: win(31) })], storage, NOW);
  assert.deepEqual(merged.fiveHour, win(31));
  assert.deepEqual(merged.sevenDay, win(9));
});

test("windows past their reset and entries older than a week are not reused", () => {
  const storage = memory();
  mergeClaudeUsageCache(
    [status("a", { fiveHour: win(40, 900), sevenDay: win(8, 5000), usageFetchedAt: 800 })],
    storage,
    NOW,
  );
  const [merged] = mergeClaudeUsageCache([status("a")], storage, NOW);
  assert.equal(merged.fiveHour, null);
  assert.deepEqual(merged.sevenDay, win(8, 5000));
  const weekLater = 800 + 7 * 24 * 60 * 60 + 1;
  const [expired] = mergeClaudeUsageCache([status("a")], storage, weekLater);
  assert.equal(expired.sevenDay, null);
});

test("unknown accounts, broken storage and corrupt cache pass statuses through", () => {
  const empty = status("b");
  assert.deepEqual(mergeClaudeUsageCache([empty], memory()), [empty]);
  assert.deepEqual(
    mergeClaudeUsageCache([empty], memory({ [CLAUDE_USAGE_CACHE_KEY]: "{bad json" })),
    [empty],
  );
  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  const good = status("c", { fiveHour: win(1), sevenDay: win(2) });
  assert.deepEqual(mergeClaudeUsageCache([good, empty], broken), [good, empty]);
  assert.deepEqual(mergeClaudeUsageCache([empty], null), [empty]);
});

test("monitor merges the cache and the overlay bars fall back to the last values", () => {
  const monitor = readFileSync(
    new URL("../../src/hooks/claude/useClaudeAccountMonitor.ts", import.meta.url),
    "utf8",
  );
  assert.match(monitor, /mergeClaudeUsageCache\(/);
  const helpers = readFileSync(
    new URL("../../src/utils/common/app-overlay-helpers.ts", import.meta.url),
    "utf8",
  );
  assert.match(helpers, /\{ label: "5H", percent: fiveHourPercent, resetAt: fiveHourResetAt \}/);
  assert.match(helpers, /\{ label: "WK", percent: weeklyPercent, resetAt: weeklyResetAt \}/);
});
