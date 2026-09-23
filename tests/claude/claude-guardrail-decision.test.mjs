import test from "node:test";
import assert from "node:assert/strict";

import { claudeAccountGuardrailDecision } from "../../.test-build/claude/claude-guardrails.js";

const preferences = {
  pollIntervalSecs: 20,
  enabled: true,
  autoResumeAtReset: false,
  onlyWatchProcessingAccounts: true,
  fiveHour: { enabled: true, thresholdPct: 90 },
  weekly: { enabled: true, thresholdPct: 95 },
};

const status = (overrides = {}) => ({
  account: {
    id: "a",
    configDir: "C:/profiles/a",
    profileName: "a",
    subscriptionType: null,
    rateLimitTier: null,
    expiresAt: null,
    expired: null,
    email: null,
    organizationName: null,
    source: "test",
  },
  fiveHour: { usedPercentage: 92, resetsAt: 100 },
  sevenDay: { usedPercentage: 96, resetsAt: 200 },
  usageFresh: true,
  usageFetchedAt: 50,
  active: true,
  suspended: false,
  suspendedProcessCount: 0,
  error: null,
  ...overrides,
});

test("fresh Claude usage reports each triggered guardrail window", () => {
  assert.deepEqual(claudeAccountGuardrailDecision(status(), preferences), {
    hit: true,
    fiveHourHit: true,
    weeklyHit: true,
  });
});

test("stale or errored Claude usage cannot trigger a guardrail decision", () => {
  assert.equal(
    claudeAccountGuardrailDecision(status({ usageFresh: false }), preferences).hit,
    false,
  );
  assert.equal(
    claudeAccountGuardrailDecision(status({ error: "probe failed" }), preferences).hit,
    false,
  );
});

test("missing usage is not interpreted as a threshold hit", () => {
  const decision = claudeAccountGuardrailDecision(
    status({ fiveHour: null, sevenDay: null }),
    preferences,
  );
  assert.equal(decision.hit, false);
  assert.equal(decision.fiveHourHit, false);
  assert.equal(decision.weeklyHit, false);
});

test("active-only guardrails ignore inactive profiles but can be disabled", () => {
  const inactive = status({ active: false });
  assert.deepEqual(claudeAccountGuardrailDecision(inactive, preferences), {
    hit: false,
    fiveHourHit: false,
    weeklyHit: false,
  });
  assert.equal(
    claudeAccountGuardrailDecision(inactive, {
      ...preferences,
      onlyWatchProcessingAccounts: false,
    }).hit,
    true,
  );
});
