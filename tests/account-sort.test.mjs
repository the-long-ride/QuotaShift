import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreAntigravityNormalizedUsage,
  scoreClaudeNormalizedUsage,
  scoreCodexNormalizedUsage,
  sortClaudeAccountIds,
  weightedUsageScore,
} from "../.test-build/account-sort.js";

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test("weighted usage uses weekly + five-hour / 6", () => {
  closeTo(weightedUsageScore(60, 40), 50);
  closeTo(weightedUsageScore(60, 40, 5, 5), 250);
  assert.equal(weightedUsageScore(null, null), null);
});

test("Codex usage normalization follows Free, Plus, Pro x5, and Pro x20 capacity ratios", () => {
  const account = (id, lastPlan) => ({ id, label: id, apiKey: "", lastPlan });
  const plus = scoreCodexNormalizedUsage(account("plus", "ChatGPT Plus"), {
    isOAuth: true,
    planName: "ChatGPT Plus",
    loading: false,
    primary: { used_percent: 100 },
    secondary: { used_percent: 100 },
  });
  const pro5 = scoreCodexNormalizedUsage(account("pro5", "ChatGPT Pro"), {
    isOAuth: true,
    planName: "ChatGPT Pro",
    loading: false,
    primary: { used_percent: 100 },
    secondary: { used_percent: 100 },
  });
  const pro20 = scoreCodexNormalizedUsage(account("pro20", "ChatGPT Pro x20"), {
    isOAuth: true,
    planName: "ChatGPT Pro x20",
    loading: false,
    primary: { used_percent: 100 },
    secondary: { used_percent: 100 },
  });
  const free = scoreCodexNormalizedUsage(account("free", "ChatGPT Free"), {
    isOAuth: true,
    planName: "ChatGPT Free",
    loading: false,
    monthly: { used_percent: 100 },
  });
  const plusFiveOnly = weightedUsageScore(100, null);

  closeTo(pro5, plus * 5);
  closeTo(pro20, plus * 20);
  closeTo(free * 4, plusFiveOnly);
});

test("Claude Max x5 and x20 use separate five-hour and weekly multipliers", () => {
  const status = (id, tier, five, weekly) => ({
    account: {
      id,
      configDir: id,
      profileName: id,
      subscriptionType: tier,
      rateLimitTier: null,
      expiresAt: null,
      expired: false,
      email: id + "@example.com",
      organizationName: null,
      source: "test",
    },
    fiveHour: five == null ? null : { usedPercentage: five, resetsAt: null },
    sevenDay: weekly == null ? null : { usedPercentage: weekly, resetsAt: null },
    usageFresh: true,
    usageFetchedAt: null,
    suspended: false,
    suspendedProcessCount: 0,
    error: null,
  });

  const proFive = scoreClaudeNormalizedUsage(status("pro", "pro", 10, null));
  const max5Five = scoreClaudeNormalizedUsage(status("max5", "max_5x", 10, null));
  const max20Five = scoreClaudeNormalizedUsage(status("max20", "max_20x", 10, null));
  const proWeekly = scoreClaudeNormalizedUsage(status("pro-w", "pro", null, 10));
  const max5Weekly = scoreClaudeNormalizedUsage(status("max5-w", "max_5x", null, 10));
  const max20Weekly = scoreClaudeNormalizedUsage(status("max20-w", "max_20x", null, 10));

  closeTo(max5Five, proFive * 5);
  closeTo(max20Five, proFive * 20);
  closeTo(max5Weekly, proWeekly * 3);
  closeTo(max20Weekly, proWeekly * 6.5);
});

test("Antigravity normalizes Free 0.3x, Plus 1x, Pro 3x, Ultra 15x", () => {
  const account = (id, lastPlan) => ({ id, label: id, token: "", lastPlan });
  const cache = (planTier) => ({
    planTier,
    quotas: [
      {
        model: "Gemini Models",
        percent: 50,
        refreshTime: "",
        fiveHourPercent: 50,
        weeklyPercent: 50,
      },
    ],
  });
  const free = scoreAntigravityNormalizedUsage(account("free", "Free"), cache("Free"));
  const plus = scoreAntigravityNormalizedUsage(account("plus", "Plus"), cache("Plus"));
  const pro = scoreAntigravityNormalizedUsage(account("pro", "Google AI Pro"), cache("Google AI Pro"));
  const ultra = scoreAntigravityNormalizedUsage(
    account("ultra", "Google AI Ultra"),
    cache("Google AI Ultra"),
  );

  closeTo(plus, free / 0.3);
  closeTo(pro, plus * 3);
  closeTo(ultra, pro * 5);
});

test("all sort fields support ascending and descending with missing values last", () => {
  const status = (id, profileName, email, tier, lastUsedAt, used) => ({
    account: {
      id,
      configDir: id,
      profileName,
      subscriptionType: tier,
      rateLimitTier: null,
      expiresAt: null,
      expired: false,
      email,
      organizationName: null,
      source: "test",
    },
    fiveHour: { usedPercentage: used, resetsAt: null },
    sevenDay: { usedPercentage: used, resetsAt: null },
    usageFresh: true,
    usageFetchedAt: null,
    lastUsedAt,
    suspended: false,
    suspendedProcessCount: 0,
    error: null,
  });
  const statuses = [
    status("b", "Beta", "z@example.com", "max_5x", 200, 20),
    status("a", "Alpha", "a@example.com", "pro", 100, 10),
    status("c", "Gamma", null, "team", null, 5),
  ];

  assert.deepEqual(sortClaudeAccountIds(statuses, "alias", "asc"), ["a", "b", "c"]);
  assert.deepEqual(sortClaudeAccountIds(statuses, "alias", "desc"), ["c", "b", "a"]);
  assert.deepEqual(sortClaudeAccountIds(statuses, "email", "asc"), ["a", "b", "c"]);
  assert.deepEqual(sortClaudeAccountIds(statuses, "email", "desc"), ["b", "a", "c"]);
  assert.deepEqual(sortClaudeAccountIds(statuses, "lastUsed", "asc"), ["a", "b", "c"]);
  assert.deepEqual(sortClaudeAccountIds(statuses, "lastUsed", "desc"), ["b", "a", "c"]);
  assert.deepEqual(sortClaudeAccountIds(statuses, "usage", "asc"), ["c", "a", "b"]);
  assert.deepEqual(sortClaudeAccountIds(statuses, "usage", "desc"), ["b", "a", "c"]);
});
