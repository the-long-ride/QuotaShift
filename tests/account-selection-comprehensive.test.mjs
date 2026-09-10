import test from "node:test";
import assert from "node:assert/strict";
import {
  USAGE_CACHE_TTL_MS,
  isUsageCacheFresh,
  scoreCodexAccountUsage,
  pickBestCodexAccount,
  scoreAntigravityAccountUsage,
  pickBestAntigravityAccount,
} from "../.test-build/account-selection.js";

test("isUsageCacheFresh checks TTL, loading, and error states", () => {
  const now = Date.now();
  assert.equal(isUsageCacheFresh(null), null);
  assert.equal(isUsageCacheFresh({ loading: true }), false);
  assert.equal(isUsageCacheFresh({ error: "failed" }), false);
  assert.equal(isUsageCacheFresh({ fetchedAt: "not-number" }), false);
  assert.equal(isUsageCacheFresh({ fetchedAt: now - 1000 }), true);
  assert.equal(isUsageCacheFresh({ fetchedAt: now - USAGE_CACHE_TTL_MS - 10 }), false);
  assert.equal(isUsageCacheFresh({ fetchedAt: now - 5000 }, 2000), false);
});

test("scoreCodexAccountUsage handles OAuth and snapshot structures", () => {
  // Invalid / error caches
  assert.equal(scoreCodexAccountUsage(null), null);
  assert.equal(scoreCodexAccountUsage({ loading: true }), null);
  assert.equal(scoreCodexAccountUsage({ error: "err" }), null);

  // OAuth cache with windows
  const oauthCache = {
    isOAuth: true,
    primary: { used_percent: 20 },
    secondary: { used_percent: 40 },
    monthly: { used_percent: 60 },
  };
  // (80 + 60 + 40) / 3 = 60
  assert.equal(scoreCodexAccountUsage(oauthCache), 60);

  // OAuth cache without windows
  assert.equal(scoreCodexAccountUsage({ isOAuth: true }), null);

  // Snapshot cache with hard/soft limit
  const snapshotCache = {
    snapshot: {
      hardLimit: 100,
      models: [{ costUsd: 10 }, { costUsd: 20 }],
    },
  };
  // 100 - (30 / 100) * 100 = 70
  assert.equal(scoreCodexAccountUsage(snapshotCache), 70);

  // Snapshot without limit
  assert.equal(scoreCodexAccountUsage({ snapshot: {} }), null);
});

test("pickBestCodexAccount selects highest scoring account", () => {
  const accounts = [{ id: "acc1" }, { id: "acc2" }, { id: "acc3" }];
  const usageCache = {
    acc1: { isOAuth: true, primary: { used_percent: 50 } }, // score: 50
    acc2: { isOAuth: true, primary: { used_percent: 10 } }, // score: 90
    acc3: { error: "failed" },
  };

  const best = pickBestCodexAccount(accounts, usageCache);
  assert.ok(best);
  assert.equal(best.account.id, "acc2");
  assert.equal(best.score, 90);

  // Empty or invalid accounts
  assert.equal(pickBestCodexAccount([], usageCache), null);
  assert.equal(pickBestCodexAccount(accounts, {}), null);
});

test("scoreAntigravityAccountUsage scores cloud and legacy quotas", () => {
  assert.equal(scoreAntigravityAccountUsage({ loading: true }), null);
  assert.equal(scoreAntigravityAccountUsage({ error: "err" }), null);

  // Cloud quotas in cache
  const cloudCache = {
    cloudQuotas: [
      { modelId: "gemini_pool", displayName: "Gemini Models", fiveHourPercent: 70, weeklyPercent: 80 },
      { modelId: "claude", displayName: "Claude", fiveHourPercent: 50, weeklyPercent: 60 },
    ],
  };
  // Bottleneck among valid percentages is 50
  assert.equal(scoreAntigravityAccountUsage(cloudCache), 50);

  // Disabled windows
  const disabledCache = {
    cloudQuotas: [
      { modelId: "pool", displayName: "Gemini Models", fiveHourDisabled: true, weeklyDisabled: false, weeklyPercent: 75 },
    ],
  };
  assert.equal(scoreAntigravityAccountUsage(disabledCache), 0);

  // Legacy quotas fallback
  const legacyQuotas = [
    { fiveHourPercent: 90, weeklyPercent: 80 },
    { percent: 60 },
  ];
  const score = scoreAntigravityAccountUsage(null, undefined, legacyQuotas);
  assert.equal(score, 80);
});

test("pickBestAntigravityAccount picks highest score among accounts", () => {
  const accounts = [
    { id: "ag1", cloudQuotas: [{ modelId: "m1", fiveHourPercent: 30, weeklyPercent: 40 }] },
    { id: "ag2", cloudQuotas: [{ modelId: "m2", fiveHourPercent: 80, weeklyPercent: 90 }] },
  ];

  const best = pickBestAntigravityAccount(accounts, {});
  assert.ok(best);
  assert.equal(best.account.id, "ag2");
  assert.equal(best.score, 80);

  assert.equal(pickBestAntigravityAccount([], {}), null);
});
