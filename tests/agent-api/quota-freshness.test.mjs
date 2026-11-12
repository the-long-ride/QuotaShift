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
});
test("Codex agent eligibility requires fresh successful OAuth usage, never stale errors", () => {
  const good = { isOAuth: true, fetchedAt: 2000, loading: false };
  assert.equal(verifiedAgentQuotaTimestamp(good, "codex"), 2000);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, error: "429" }, "codex"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, loading: true }, "codex"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, isOAuth: false }, "codex"), null);
  assert.equal(verifiedAgentQuotaTimestamp({ ...good, fetchedAt: Number.NaN }, "codex"), null);
});
