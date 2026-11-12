import test from "node:test";
import assert from "node:assert/strict";
import {
  observePoolQuota, recordQuotaEvidence, nextEligibleCandidate,
} from "../../.test-build/cli-pools/auto-failover.js";

const now = Date.parse("2026-11-12T15:00:00.000Z");
const ag = (remaining, fetchedAt = now, historical = false) => ({
  accuracy: "exact_grouped", fetchedAt,
  cloudQuotas: [{ modelId: "claude", family: "claude", fiveHourPercent: remaining,
    weeklyPercent: remaining, quotaCarried: historical }],
});
const codex = (used, fetchedAt = now) => ({
  isOAuth: true, fetchedAt, primary: { used_percent: used, reset_at: Math.floor(now / 1000) + 7200 },
  secondary: { used_percent: 12, reset_at: Math.floor(now / 1000) + 20000 },
});
const pool = { id: "test", provider: "codex", enabled: true, autoSwitch: true,
  accountIds: ["a", "b", "c"], triggerWindows: ["5h", "weekly"],
  fallbackLatestEnabled: true, switchWhenIdleOnly: false };

test("Antigravity requires exact, fresh, uncarried quota and all model groups exhausted", () => {
  assert.equal(observePoolQuota("agy", ag(0), "5h", now)?.remaining, 0);
  assert.equal(observePoolQuota("agy", ag(0, now, true), "5h", now), null);
  assert.equal(observePoolQuota("agy", ag(0, now - 400000), "5h", now), null);
  assert.equal(observePoolQuota("agy", { ...ag(0), accuracy: "session_only" }, "5h", now), null);
  const mixed = { ...ag(0), cloudQuotas: [
    ag(0).cloudQuotas[0], { modelId: "gemini", fiveHourPercent: 70 },
  ] };
  assert.equal(observePoolQuota("agy", mixed, "5h", now)?.remaining, 70);
});

test("Codex usage only rotates after fresh confirmed exhaustion, not transient failure", () => {
  const samples = new Map();
  const first = observePoolQuota("codex", codex(100), "5h", now);
  assert.equal(first?.remaining, 0);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", first, now, 2, 5), false);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", first, now, 2, 5), false);
  const secondAt = now + 30000;
  const second = observePoolQuota("codex", codex(100, secondAt), "5h", secondAt);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", second, secondAt, 2, 5), true);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", second, secondAt, 2, 5), false);
  assert.equal(observePoolQuota("codex", { ...codex(100), error: "timeout" }, "5h", now), null);
});

test("recovery or reset epoch change must clear exhaustion evidence", () => {
  const history = new Map();
  const depleted = observePoolQuota("codex", codex(100), "5h", now);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", depleted, now, 2, 5), false);
  const recovered = observePoolQuota("codex", codex(40, now + 10000), "5h", now + 10000);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", recovered, now + 10000, 2, 5), false);
  const depletedAgain = observePoolQuota("codex", codex(100, now + 20000), "5h", now + 20000);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", depletedAgain, now + 20000, 2, 5), false);
});

test("candidate selection respects enabled pool ordering, availability and freshness", () => {
  const accounts = [
    { id: "a", provider: "codex", remainingPercent: 0, updatedAt: now },
    { id: "b", provider: "codex", remainingPercent: 80, updatedAt: now - 400000 },
    { id: "c", provider: "codex", remainingPercent: 20, updatedAt: now },
  ];
  assert.equal(nextEligibleCandidate(pool, "a", accounts, now), "c");
  assert.equal(nextEligibleCandidate(pool, "missing", accounts, now), null);
  assert.equal(nextEligibleCandidate({ ...pool, autoSwitch: false }, "a", accounts, now), null);
});
