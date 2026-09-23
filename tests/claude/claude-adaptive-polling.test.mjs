import test from "node:test";
import assert from "node:assert/strict";
import {
  claudeAccountMonitorPollIntervalSecs,
  claudeAdaptivePollIntervalSecs,
  claudeAdaptivePollMultiplier,
} from "../../.test-build/claude/claude-polling.js";

const preferences = {
  pollIntervalSecs: 20,
  enabled: true,
  onlyWatchProcessingAccounts: true,
  fiveHour: { enabled: true, thresholdPct: 95 },
  weekly: { enabled: true, thresholdPct: 95 },
};

const status = (five, weekly) => ({
  account: {
    id: "a",
    configDir: "C:/profiles/a",
    profileName: "a",
    subscriptionType: "pro",
    rateLimitTier: null,
    expiresAt: null,
    expired: false,
    email: null,
    organizationName: null,
    source: "file",
  },
  fiveHour: { usedPercentage: five, resetsAt: null },
  sevenDay: { usedPercentage: weekly, resetsAt: null },
  session: null,
  localUsage: null,
  usageFresh: true,
  usageFetchedAt: 1,
  active: true,
  suspended: false,
  suspendedProcessCount: 0,
  error: null,
});

test("Claude adaptive polling keeps the configured rate inside eager guardrail margins", () => {
  assert.equal(claudeAdaptivePollMultiplier([status(85, 92)], preferences), 1);
  assert.equal(claudeAdaptivePollIntervalSecs(20, [status(86, 94)], preferences), 20);
});

test("Claude adaptive polling adds 15% for each 10-point band farther from the eager zone", () => {
  const fiveOnly = {
    ...preferences,
    weekly: { enabled: false, thresholdPct: 95 },
  };
  assert.equal(claudeAdaptivePollMultiplier([status(84, 0)], fiveOnly), 1.15);
  assert.equal(claudeAdaptivePollIntervalSecs(20, [status(84, 0)], fiveOnly), 23);
  assert.equal(claudeAdaptivePollMultiplier([status(74, 0)], fiveOnly), 1.3);
  assert.equal(claudeAdaptivePollIntervalSecs(20, [status(74, 0)], fiveOnly), 26);
});

test("weekly eager margin is threshold minus 3 percentage points", () => {
  const weeklyOnly = {
    ...preferences,
    fiveHour: { enabled: false, thresholdPct: 95 },
  };
  assert.equal(claudeAdaptivePollIntervalSecs(20, [status(0, 92)], weeklyOnly), 20);
  assert.equal(claudeAdaptivePollIntervalSecs(20, [status(0, 91)], weeklyOnly), 23);
});

test("the most urgent enabled account/window controls the shared poll cadence", () => {
  assert.equal(
    claudeAdaptivePollIntervalSecs(20, [status(30, 30), status(86, 40)], preferences),
    20,
  );
});

test("stale or errored Claude usage keeps the fastest poll cadence for recovery", () => {
  const farFromThreshold = status(20, 20);
  assert.ok(claudeAdaptivePollMultiplier([farFromThreshold], preferences) > 1);
  assert.equal(
    claudeAdaptivePollMultiplier([{ ...farFromThreshold, usageFresh: false }], preferences),
    1,
  );
  assert.equal(
    claudeAdaptivePollMultiplier(
      [{ ...farFromThreshold, error: "probe failed", usageFresh: false }],
      preferences,
    ),
    1,
  );
});

test("processing-only mode lets active profiles alone drive adaptive guardrail urgency", () => {
  const activeLowUsage = status(10, 10);
  const inactiveNearThreshold = status(90, 95);
  inactiveNearThreshold.active = false;

  assert.equal(
    claudeAdaptivePollIntervalSecs(
      20,
      [activeLowUsage, inactiveNearThreshold],
      preferences,
    ),
    44,
  );
  assert.equal(
    claudeAdaptivePollIntervalSecs(20, [activeLowUsage, inactiveNearThreshold], {
      ...preferences,
      onlyWatchProcessingAccounts: false,
    }),
    20,
  );
});

test("low-usage polling without active guardrails still considers inactive accounts", () => {
  const inactiveLowUsage = status(1, 1);
  inactiveLowUsage.active = false;
  assert.equal(
    claudeAdaptivePollIntervalSecs(20, [inactiveLowUsage], {
      ...preferences,
      onlyWatchProcessingAccounts: true,
      fiveHour: { enabled: false, thresholdPct: 95 },
      weekly: { enabled: false, thresholdPct: 95 },
      reduceLowUsageFrequency: true,
    }),
    300,
  );
});

test("Claude monitored polling selects the Claude rate while guardrails are enabled", () => {
  assert.equal(claudeAccountMonitorPollIntervalSecs(true, true, 20, 60, 900), 20);
  assert.equal(claudeAccountMonitorPollIntervalSecs(true, false, 20, 60, 900), 20);
});

test("Claude monitored polling uses the global tracked rate when guardrails are disabled", () => {
  assert.equal(claudeAccountMonitorPollIntervalSecs(false, true, 20, 60, 900), 60);
});

test("untracked Claude polling uses the idle rate when guardrails are disabled", () => {
  assert.equal(claudeAccountMonitorPollIntervalSecs(false, false, 20, 60, 900), 900);
});
