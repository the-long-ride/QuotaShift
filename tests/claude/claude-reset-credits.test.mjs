import test from "node:test";
import assert from "node:assert/strict";
import {
  CLAUDE_RESET_CREDITS_ENABLED_KEY,
  loadClaudeResetCreditsEnabled,
  saveClaudeResetCreditsEnabled,
  resetCreditsToOverlayFields,
} from "../../.test-build/claude/claude-reset-credits.js";

const memoryStorage = () => {
  const store = new Map();
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
};

test("Claude reset count is off by default", () => {
  assert.equal(loadClaudeResetCreditsEnabled(memoryStorage()), false);
  assert.equal(loadClaudeResetCreditsEnabled(null), false);
});

test("Claude reset count preference round-trips under its own key", () => {
  const storage = memoryStorage();
  saveClaudeResetCreditsEnabled(true, storage);
  assert.equal(storage.store.get(CLAUDE_RESET_CREDITS_ENABLED_KEY), "true");
  assert.equal(CLAUDE_RESET_CREDITS_ENABLED_KEY, "quotashift_claude_reset_credits_enabled_v1");
  assert.equal(loadClaudeResetCreditsEnabled(storage), true);
  saveClaudeResetCreditsEnabled(false, storage);
  assert.equal(loadClaudeResetCreditsEnabled(storage), false);
});

test("broken storage never enables the feature or throws", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(loadClaudeResetCreditsEnabled(broken), false);
  assert.doesNotThrow(() => saveClaudeResetCreditsEnabled(true, broken));
});

test("only available credits reach the overlay badge", () => {
  const base = { reason: null, fetchedAt: 1 };
  assert.deepEqual(
    resetCreditsToOverlayFields({
      ...base,
      status: "available",
      count: 2,
      nearestExpiresAt: "2026-10-22T23:59:00Z",
    }),
    { resetCount: 2, resetNearestExpiresAt: "2026-10-22T23:59:00Z" },
  );
  const hidden = { resetCount: null, resetNearestExpiresAt: null };
  for (const status of ["none", "ineligible", "unavailable"]) {
    assert.deepEqual(
      resetCreditsToOverlayFields({ ...base, status, count: 0, nearestExpiresAt: null }),
      hidden,
    );
  }
  assert.deepEqual(resetCreditsToOverlayFields(null), hidden);
  assert.deepEqual(resetCreditsToOverlayFields(undefined), hidden);
});
