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

test("verified exact IDE quota takes precedence over historical carried Argon cloud quota", async () => {
  const { mergeExactResult } = await import("../../.test-build/antigravity-exact.js");
  const { readFileSync } = await import("node:fs");
  const account = {
    id: "ag-1", label: "Account", token: "encrypted",
    cloudQuotas: [{ modelId: "argon", family: "argon", weeklyPercent: 0, quotaCarried: true }],
  };
  const previous = {
    source: "cloud", accuracy: "exact_grouped",
    cloudQuotas: account.cloudQuotas,
    quotas: [{ model: "Gemini Models", fiveHourPercent: 1, weeklyPercent: 0 }],
  };
  const now = Date.now();
  const exact = mergeExactResult(previous, {
    accountId: account.id, state: "exact", error: null,
    fetchedAt: new Date(now).toISOString(),
    status: {
      accuracy: "exact_grouped", source: "ide_local", online: true,
      credits: null, recentlyUsedModel: null, monitoredCodex: null,
      planTier: "Pro", email: "test@example.org",
      quotas: [{ model: "Gemini Models", fiveHourPercent: 90, weeklyPercent: 80 }],
    },
  }, now);
  assert.equal(exact.cloudQuotas, undefined);
  assert.equal(exact.accuracy, "exact_grouped");
  assert.equal(exact.quotas[0].weeklyPercent, 80);
  assert.equal(verifiedAgentQuotaTimestamp(exact, "antigravity"), now);
  // The source's selection path must not consult the saved cloud quota
  // when a new exact IDE record supersedes it.
  const snapshotSource = readFileSync(
    new URL("../../src/utils/agent-api/snapshot.ts", import.meta.url), "utf8",
  );
  assert.ok(snapshotSource.includes('entry?.source === "exact"'));
  assert.ok(snapshotSource.includes("entry?.quotas ??"));
});
