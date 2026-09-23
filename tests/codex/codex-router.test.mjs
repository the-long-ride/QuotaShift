import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexRouterConfig,
  refreshActivePoolOAuthCredentials,
} from "../../.test-build/codex-router.js";

const pool = {
  id: "p",
  name: "P",
  model: "gpt-5.6-sol",
  accountIds: ["a", "b"],
  modelSelectionMode: "discovered",
};

test("buildCodexRouterConfig uses explicit active pool and fresh quota/catalog data", () => {
  const now = Date.now();
  const decoded = new Map([
    [
      "oauth-secret",
      JSON.stringify({ accessToken: "access-a", refreshToken: "refresh-a", accountId: "acct-a" }),
    ],
    ["api-secret", "sk-test"],
  ]);
  const config = buildCodexRouterConfig({
    accounts: [
      { id: "a", label: "A", apiKey: "oauth-secret" },
      { id: "b", label: "B", apiKey: "api-secret" },
    ],
    pools: [pool],
    usageCache: {
      a: {
        fetchedAt: now,
        rate_limit: { primary_window: { used_percent: 25, window_duration_mins: 300 } },
      },
    },
    modelCache: {
      a: {
        accountId: "a",
        planName: "Plus",
        models: [{ id: "gpt-5.6-sol", displayName: "Sol" }],
        fetchedAt: now,
      },
    },
    appliedAccountId: "a",
    activePoolId: "p",
    decodeCredential: (value) => decoded.get(value) ?? value,
  });

  assert.equal(config.accounts[0].auth.kind, "oAuth");
  assert.equal(config.accounts[0].auth.chatgptAccountId, "acct-a");
  assert.deepEqual(config.accounts[0].availableModelIds, ["gpt-5.6-sol"]);
  assert.equal(config.accounts[0].quotaWindows[0].remainingPercent, 75);
  assert.equal(config.accounts[0].quotaWindows[0].durationMinutes, 300);
  assert.equal(config.accounts[1].auth.kind, "apiKey");
  assert.equal(config.pools[0].id, "p");
  assert.equal(config.activePoolId, "p");
  assert.equal(config.appliedAccountId, "a");
});

test("stale quota and model catalogs are excluded from routing decisions", () => {
  const stale = Date.now() - 25 * 60 * 60 * 1000;
  const config = buildCodexRouterConfig({
    accounts: [{ id: "a", label: "A", apiKey: "sk-test" }],
    pools: [pool],
    usageCache: {
      a: {
        fetchedAt: stale,
        rate_limit: { primary_window: { used_percent: 1, window_duration_mins: 300 } },
      },
    },
    modelCache: {
      a: {
        accountId: "a",
        planName: "Plus",
        models: [{ id: "gpt-5.6-sol", displayName: "Sol" }],
        fetchedAt: stale,
      },
    },
    appliedAccountId: "a",
    activePoolId: "p",
    decodeCredential: (value) => value,
  });

  assert.deepEqual(config.accounts[0].quotaWindows, []);
  assert.equal(config.accounts[0].usageFetchedAt, null);
  assert.equal(config.accounts[0].availableModelIds, null);
  assert.equal(config.accounts[0].modelCatalogFetchedAt, null);
});

test("OAuth refresh targets only active-pool members and returns persisted credentials", async () => {
  const now = Date.now();
  const oldRefresh = new Date(now - 60 * 60 * 1000).toISOString();
  const accounts = [
    {
      id: "a",
      label: "A",
      apiKey: JSON.stringify({
        accessToken: "opaque-a",
        refreshToken: "refresh-a",
        accountId: "acct-a",
        lastRefresh: oldRefresh,
      }),
    },
    {
      id: "b",
      label: "B",
      apiKey: JSON.stringify({
        accessToken: "opaque-b",
        refreshToken: "refresh-b",
        accountId: "acct-b",
        lastRefresh: oldRefresh,
      }),
    },
  ];
  const calls = [];
  const result = await refreshActivePoolOAuthCredentials({
    accounts,
    pools: [{ ...pool, accountIds: ["a"] }],
    activePoolId: "p",
    decodeCredential: (value) => value,
    encodeCredential: (value) => value,
    refreshToken: async (refreshToken, account) => {
      calls.push([refreshToken, account.id]);
      return { access_token: "fresh-a", refresh_token: "rotated-a" };
    },
    now,
  });

  assert.deepEqual(calls, [["refresh-a", "a"]]);
  assert.deepEqual(result.refreshedAccountIds, ["a"]);
  assert.deepEqual(result.failedAccountIds, []);
  const refreshed = JSON.parse(result.accounts[0].apiKey);
  assert.equal(refreshed.accessToken, "fresh-a");
  assert.equal(refreshed.refreshToken, "rotated-a");
  assert.equal(result.accounts[1].apiKey, accounts[1].apiKey);
});
