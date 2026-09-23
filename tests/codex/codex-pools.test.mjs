import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCodexPoolCapacity,
  buildCodexPoolMemberUsageRows,
  normalizeCodexPools,
  reconcileCodexPools,
  validateCodexPoolRequiredFields,
} from "../../.test-build/codex-pools.js";

const accounts = [
  { id: "oauth-a", label: "OAuth A", apiKey: "x" },
  { id: "oauth-b", label: "OAuth B", apiKey: "x" },
  { id: "api-c", label: "API C", apiKey: "x" },
];

const pool = {
  id: "pool-sol",
  name: "Sol Pool",
  model: "gpt-5.6-sol",
  accountIds: accounts.map((account) => account.id),
};

const cache = {
  "oauth-a": {
    isOAuth: true,
    fetchedAt: Date.now(),
    primary: { used_percent: 60, reset_at: 1_900_000_000 },
    secondary: { used_percent: 20, reset_at: 1_900_500_000 },
  },
  "oauth-b": {
    isOAuth: true,
    fetchedAt: Date.now(),
    primary: { used_percent: 20, reset_at: 1_900_100_000 },
  },
  "api-c": {
    isOAuth: false,
    fetchedAt: Date.now(),
    snapshot: { hardLimit: 100, softLimit: 0, models: [{ costUsd: 1 }] },
  },
};

test("pool member auth counts come from saved credentials even before usage is cached", () => {
  const decodedAccounts = [
    { id: "oauth-a", label: "OAuth A", apiKey: JSON.stringify({ accessToken: "a" }) },
    { id: "api-c", label: "API C", apiKey: "sk-test" },
  ];
  const aggregate = aggregateCodexPoolCapacity(
    { ...pool, accountIds: ["oauth-a", "api-c"] },
    decodedAccounts,
    {},
  );
  assert.equal(aggregate.oauthMembers, 1);
  assert.equal(aggregate.apiKeyMembers, 1);
});

test("aggregates fresh known OAuth capacity", () => {
  const aggregate = aggregateCodexPoolCapacity(pool, accounts, cache);
  assert.deepEqual(aggregate.primary, {
    remainingPoints: 120,
    capacityPoints: 200,
    knownMembers: 2,
    totalMembers: 3,
    nextResetAt: null,
  });
  assert.equal(aggregate.oauthMembers, 2);
  assert.equal(aggregate.apiKeyMembers, 1);
});

test("stale or failed members do not fabricate pool capacity", () => {
  const staleCache = {
    ...cache,
    "oauth-a": { ...cache["oauth-a"], fetchedAt: Date.now() - 10 * 60 * 1000 },
    "oauth-b": { isOAuth: true, error: "offline" },
  };
  const aggregate = aggregateCodexPoolCapacity(pool, accounts, staleCache);
  assert.equal(aggregate.primary.knownMembers, 0);
  assert.equal(aggregate.primary.remainingPoints, 0);
});

test("reconciles deleted account ids without deleting an empty pool", () => {
  const reconciled = reconcileCodexPools(
    [pool, { ...pool, id: "empty", accountIds: ["deleted-only"] }],
    accounts,
  );
  assert.deepEqual(reconciled[0].accountIds, ["oauth-a", "oauth-b", "api-c"]);
  assert.deepEqual(reconciled[1].accountIds, []);
});

test("normalization de-duplicates members and preserves model selection metadata", () => {
  const [normalized] = normalizeCodexPools([
    {
      ...pool,
      accountIds: ["oauth-a", "oauth-a", "oauth-b"],
      modelSelectionMode: "discovered",
    },
  ]);
  assert.deepEqual(normalized.accountIds, ["oauth-a", "oauth-b"]);
  assert.equal(normalized.modelSelectionMode, "discovered");
});

test("required-field validation reports incomplete pool forms", () => {
  assert.deepEqual(validateCodexPoolRequiredFields("", "", []), {
    name: "Pool name is required.",
    model: "Model is required.",
    members: "Select at least one member account.",
  });
  assert.deepEqual(validateCodexPoolRequiredFields("  Pool  ", " gpt-5 ", ["a"]), {});
});

test("pool member usage rows mirror fetched account-tab windows by tier", () => {
  const now = Date.now();
  const usageRows = buildCodexPoolMemberUsageRows(
    { ...pool, accountIds: ["oauth-a", "oauth-b"] },
    [
      { ...accounts[0], email: "a@example.com", lastPlan: "ChatGPT Plus" },
      { ...accounts[1], email: "b@example.com", lastPlan: "Free" },
    ],
    {
      "oauth-a": {
        isOAuth: true,
        fetchedAt: now,
        planName: "ChatGPT Plus",
        rate_limit: {
          primary_window: { used_percent: 39, window_duration_mins: 300 },
          secondary_window: { used_percent: 12, window_duration_mins: 10080 },
          monthly_window: { used_percent: 5, window_duration_mins: 43200 },
        },
      },
      "oauth-b": {
        isOAuth: true,
        fetchedAt: now - 24 * 60 * 60 * 1000,
        planName: "Free",
        rate_limit: {
          primary_window: { used_percent: 80, window_duration_mins: 300 },
          monthly_window: { used_percent: 25, window_duration_mins: 43200 },
        },
      },
    },
  );

  assert.deepEqual(usageRows, [
    {
      accountId: "oauth-a",
      identity: "a@example.com",
      tier: "PLUS",
      state: "ready",
      limits: [
        { kind: "5h", label: "5HR", remainingPercent: 61 },
        { kind: "weekly", label: "WK", remainingPercent: 88 },
      ],
    },
    {
      accountId: "oauth-b",
      identity: "b@example.com",
      tier: "FREE",
      state: "ready",
      limits: [{ kind: "monthly", label: "MO", remainingPercent: 75 }],
    },
  ]);
});

test("member usage rows expose loading and error states", () => {
  const rows = buildCodexPoolMemberUsageRows(
    { ...pool, accountIds: ["oauth-a", "oauth-b"] },
    accounts,
    {
      "oauth-a": { loading: true },
      "oauth-b": { error: "offline" },
    },
  );
  assert.equal(rows[0].state, "loading");
  assert.equal(rows[1].state, "error");
});
