import test from "node:test";
import assert from "node:assert/strict";
import { verifiedAgentQuotaTimestamp } from "../../.test-build/agent-api/freshness.js";

test("Agent quota metadata only accepts successful fresh-source Antigravity observations", () => {
  const good = { source: "cloud", accuracy: "exact_grouped", fetchedAt: 1000 };
  assert.equal(verifiedAgentQuotaTimestamp(good, "antigravity"), 1000);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, source: "cached_exact" }, "antigravity"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, accuracy: "session_only" }, "antigravity"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, error: "quota fetch failed" }, "antigravity"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, loading: true }, "antigravity"), null);
  assert.equal(verifiedAgentQuotaTimestamp(undefined, "antigravity"), null);
  // The verified exact IDE worker also supplies grouped authoritative quota.
  assert.equal(verifiedAgentQuotaTimestamp({
    source: "exact", exactState: "exact", accuracy: "exact_grouped",
    fetchedAt: 2500, lastExactFetchedAt: 2500,
  }, "antigravity"), 2500);
  assert.equal(verifiedAgentQuotaTimestamp({
    source: "exact", exactState: "exact", accuracy: "session_only",
    fetchedAt: 2500, lastExactFetchedAt: 2500,
  }, "antigravity"), null);
});
test("Codex agent eligibility requires fresh successful OAuth usage, never stale errors", () => {
  const good = { isOAuth: true, fetchedAt: 2000, loading: false };
  assert.equal(verifiedAgentQuotaTimestamp(good, "codex"), 2000);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, error: "429" }, "codex"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, loading: true }, "codex"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, isOAuth: false }, "codex"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, fetchedAt: Number.NaN }, "codex"), null);
});

test("exact Antigravity usage is not overridden by historical carried cloud quota", async () => {
  const { buildAgentApiSnapshot } = await import("../../.test-build/agent-api/snapshot.js");
  const priorStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };
  try {
    const account = {
      id: "ag-1", label: "Account", token: "encrypted",
      cloudQuotas: [{ modelId: "argon", displayName: "Argon",
        family: "argon", weeklyPercent: 0, quotaCarried: true }],
    };
    const fetchedAt = Date.now();
    const entry = {
      source: "exact", exactState: "exact", accuracy: "exact_grouped",
      fetchedAt, lastExactFetchedAt: fetchedAt,
      quotas: [{ model: "Gemini Models", fiveHourPercent: 90, weeklyPercent: 80 }],
    };
    const result = buildAgentApiSnapshot(
      [account], [], { [account.id]: entry }, {}, account.id, null,
    );
    assert.deepEqual(result.accounts.map(({ remainingPercent, updatedAt }) =>
      ({ remainingPercent, updatedAt })), [{ remainingPercent: 80, updatedAt: fetchedAt }]);
  } finally {
    if (priorStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorStorage;
  }
});
