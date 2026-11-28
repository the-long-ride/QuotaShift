import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("resolveMonitoredAccountItems resolves alias, tier, email, and platform across providers", async () => {
  const { resolveMonitoredAccountItems } =
    await import("../../.test-build/common/accounts/monitored-accounts-modal.js");
  const { obfuscate } = await import("../../.test-build/auth/auth.js");

  const items = resolveMonitoredAccountItems(
    [
      { provider: "antigravity", id: "ag-1" },
      { provider: "codex", id: "cx-1" },
      { provider: "claude", id: "cl-1" },
      { provider: "antigravity", id: "missing-ag" },
    ],
    {
      antigravityAccounts: [
        { id: "ag-1", label: "Zeta Ag", email: "zeta@ag.dev", token: "x", lastPlan: "Pro" },
      ],
      antigravityUsageCache: {
        "ag-1": { loading: false, exactState: "idle", planTier: "ai-ultra" },
      },
      codexAccounts: [
        {
          id: "cx-1",
          label: "Alpha Codex",
          email: "alpha@cx.dev",
          apiKey: obfuscate(JSON.stringify({ accessToken: "t" })),
          lastPlan: "Plus",
        },
      ],
      codexUsageCache: {
        "cx-1": { isOAuth: true, planName: "Team" },
      },
      claudeAccountStatuses: [
        {
          account: {
            id: "cl-1",
            profileName: "Beta Claude",
            email: "beta@cl.dev",
            subscriptionType: "max",
            rateLimitTier: "max_5x",
            configDir: "C:/Users/demo/.claude",
            isDefault: true,
          },
          source: "cli",
        },
      ],
    },
  );

  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((item) => ({
      id: item.id,
      platform: item.platform,
      platformLabel: item.platformLabel,
      alias: item.alias,
      tier: item.tier,
      email: item.email,
    })),
    [
      {
        id: "antigravity:ag-1",
        platform: "antigravity",
        platformLabel: "Antigravity",
        alias: "Zeta Ag",
        tier: "ULTRA",
        email: "zeta@ag.dev",
      },
      {
        id: "codex:cx-1",
        platform: "codex",
        platformLabel: "ChatGPT Codex",
        alias: "Alpha Codex",
        tier: "STD",
        email: "alpha@cx.dev",
      },
      {
        id: "claude:cl-1",
        platform: "claude",
        platformLabel: "Claude Code",
        alias: "Beta Claude",
        tier: "MAX",
        email: "beta@cl.dev",
      },
      {
        id: "antigravity:missing-ag",
        platform: "antigravity",
        platformLabel: "Antigravity",
        alias: "missing-ag",
        tier: "FREE",
        email: "Antigravity",
      },
    ],
  );
});

test("sortMonitoredAccountItems sorts by platform, alias, email, and tier in both directions", async () => {
  const { sortMonitoredAccountItems } =
    await import("../../.test-build/common/accounts/monitored-accounts-modal.js");

  const items = [
    {
      id: "codex:1",
      entry: { provider: "codex", id: "1" },
      platform: "codex",
      platformLabel: "ChatGPT Codex",
      alias: "charlie",
      email: "b@example.com",
      tier: "FREE",
    },
    {
      id: "antigravity:2",
      entry: { provider: "antigravity", id: "2" },
      platform: "antigravity",
      platformLabel: "Antigravity",
      alias: "alpha",
      email: "c@example.com",
      tier: "ULTRA",
    },
    {
      id: "claude:3",
      entry: { provider: "claude", id: "3" },
      platform: "claude",
      platformLabel: "Claude Code",
      alias: "bravo",
      email: "a@example.com",
      tier: "MAX",
    },
  ];

  assert.deepEqual(
    sortMonitoredAccountItems(items, "platform", "asc").map((i) => i.id),
    ["antigravity:2", "codex:1", "claude:3"],
  );
  assert.deepEqual(
    sortMonitoredAccountItems(items, "platform", "desc").map((i) => i.id),
    ["claude:3", "codex:1", "antigravity:2"],
  );
  assert.deepEqual(
    sortMonitoredAccountItems(items, "alias", "asc").map((i) => i.id),
    ["antigravity:2", "claude:3", "codex:1"],
  );
  assert.deepEqual(
    sortMonitoredAccountItems(items, "email", "asc").map((i) => i.id),
    ["claude:3", "codex:1", "antigravity:2"],
  );
  assert.deepEqual(
    sortMonitoredAccountItems(items, "tier", "asc").map((i) => i.id),
    ["antigravity:2", "claude:3", "codex:1"],
  );
  assert.deepEqual(
    sortMonitoredAccountItems(items, "tier", "desc").map((i) => i.id),
    ["codex:1", "claude:3", "antigravity:2"],
  );

  const subTierItems = [
    { ...items[0], id: "cx:std", alias: "std", tier: "STD" },
    { ...items[0], id: "ag:pro", alias: "pro", tier: "PRO" },
    { ...items[0], id: "ag:proplus", alias: "proplus", tier: "PRO+" },
    { ...items[0], id: "cx:pro50x", alias: "pro50x", tier: "Pro50x" },
    { ...items[0], id: "cx:pre", alias: "pre", tier: "PRE" },
    { ...items[0], id: "cl:max20x", alias: "max20x", tier: "Max 20x" },
  ];
  assert.deepEqual(
    sortMonitoredAccountItems(subTierItems, "tier", "asc").map((i) => i.id),
    ["cx:pro50x", "cl:max20x", "cx:pre", "ag:proplus", "ag:pro", "cx:std"],
  );
});

test("AppModals mounts MonitoredAccountsModal and overlay publication reacts to primary reorder", () => {
  const appModals = fs.readFileSync("src/components/app/AppModals.tsx", "utf8");
  const usageOverlay = fs.readFileSync("src/hooks/app/tracking/useAppUsageAndOverlay.ts", "utf8");

  assert.match(appModals, /<MonitoredAccountsModal/);
  assert.match(usageOverlay, /trackedProvider,/);
  assert.match(usageOverlay, /trackedAccountId,/);
});
