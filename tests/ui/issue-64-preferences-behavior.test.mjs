import test from "node:test";
import assert from "node:assert/strict";
import { appendAppliedAccount } from "../../.test-build/common/settings/auto-monitor-on-apply.js";
import { quotaPercentDisplay } from "../../.test-build/common/settings/quota-percent-mode.js";

test("auto-monitor only appends, does not evict at capacity", () => {
  const tracked = [{ provider: "antigravity", id: "ag1" }, { provider: "codex", id: "cx1" }];
  const next = appendAppliedAccount(tracked, { provider: "claude", id: "cl1" }, false);
  assert.equal(next.result, "added");
  assert.deepEqual(next.list, [...tracked, { provider: "claude", id: "cl1" }]);
  const full = appendAppliedAccount(next.list, { provider: "antigravity", id: "ag2" }, false);
  assert.equal(full.result, "full");
  assert.deepEqual(full.list, next.list);
  assert.equal(full.list, next.list);
});

test("same-provider removal never removes other provider cards", () => {
  const tracked = [
    { provider: "antigravity", id: "ag1" },
    { provider: "codex", id: "cx1" },
    { provider: "antigravity", id: "ag2" },
  ];
  const next = appendAppliedAccount(tracked, { provider: "antigravity", id: "ag3" }, true);
  assert.equal(next.result, "added");
  assert.deepEqual(next.list, [
    { provider: "codex", id: "cx1" },
    { provider: "antigravity", id: "ag3" },
  ]);
  const existing = appendAppliedAccount(tracked, { provider: "codex", id: "cx1" }, false);
  assert.equal(existing.result, "already");
  assert.deepEqual(existing.list, tracked);
});

test("quota inversion preserves missing values and never changes underlying source", () => {
  assert.equal(quotaPercentDisplay(20, false), 20);
  assert.equal(quotaPercentDisplay(20, true), 80);
  assert.equal(quotaPercentDisplay(0, true), 100);
  assert.equal(quotaPercentDisplay(100, true), 0);
  assert.equal(quotaPercentDisplay(null, true), null);
  assert.equal(quotaPercentDisplay(undefined, true), null);
  assert.equal(quotaPercentDisplay(Number.NaN, true), null);
});
