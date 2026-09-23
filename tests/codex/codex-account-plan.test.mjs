import test from "node:test";
import assert from "node:assert/strict";
import { applyDetectedCodexPlan, normalizeDetectedCodexPlan } from "../../.test-build/codex/codex-account-plan.js";

test("normalizes only non-empty provider plan names", () => {
  assert.equal(normalizeDetectedCodexPlan(" plus "), "plus");
  assert.equal(normalizeDetectedCodexPlan(""), null);
  assert.equal(normalizeDetectedCodexPlan(undefined), null);
});

test("persists detected plan without changing unrelated account metadata", () => {
  const original = [{ id: "a", label: "Long", apiKey: "secret", email: "a@example.com", lastUsedAt: 123 }];
  const next = applyDetectedCodexPlan(original, "a", "PLUS");
  assert.deepEqual(next[0], { ...original[0], lastPlan: "PLUS" });
});

test("missing plan does not overwrite a known plan or infer Free", () => {
  const original = [{ id: "a", label: "Long", apiKey: "secret", lastPlan: "PLUS" }];
  assert.deepEqual(applyDetectedCodexPlan(original, "a", null), original);
});
