import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchCodexUsageData,
  updateMonitoredCodexTray,
  syncActiveCodexAccount,
} from "../../.test-build/codex/app-codex-ops.js";
import { obfuscate } from "../../.test-build/auth/auth.js";

test("fetchCodexUsageData fetches subscription and model usage data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/subscription")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hard_limit_usd: 120,
          soft_limit_usd: 100,
          plan: { title: "Usage-based tier" },
          system_hard_limit_usd: 120,
        }),
      };
    }
    if (urlStr.includes("/usage")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          daily_costs: [
            {
              line_items: [
                { name: "gpt-4o", cost: 250 },
                { name: "gpt-4o-mini", cost: 50 },
              ],
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const result = await fetchCodexUsageData("sk-test-mock");
    assert.equal(result.hardLimit, 120);
    assert.equal(result.planName, "Usage-based tier");
    assert.equal(result.models.length, 2);
    assert.equal(result.models[0].model, "gpt-4o");
    assert.equal(result.models[0].costUsd, 2.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchCodexUsageData throws appropriate error on 401 or HTTP failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
  });

  try {
    await assert.rejects(
      async () => await fetchCodexUsageData("sk-invalid"),
      /Invalid API key/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    statusText: "Internal Server Error",
  });

  try {
    await assert.rejects(
      async () => await fetchCodexUsageData("sk-error"),
      /Subscription API error/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateMonitoredCodexTray updates tray for OAuth and non-OAuth accounts", async () => {
  const invocations = [];
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        invocations.push({ cmd, args });
        return null;
      },
      transformCallback: () => 1,
    },
  };

  const oauthAccount = {
    id: "acc-oauth",
    label: "OAuth Account",
    apiKey: obfuscate(JSON.stringify({ accessToken: "tok", refreshToken: "ref" })),
  };

  await updateMonitoredCodexTray(oauthAccount, {
    primary: { used_percent: 25 },
    primaryLabel: "5-hour",
    secondaryPercent: 60,
  });

  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].cmd, "set_monitored_codex");
  assert.equal(invocations[0].args.info.primaryPercent, 75);

  const apiKeyAccount = {
    id: "acc-api",
    label: "API Account",
    apiKey: obfuscate("sk-raw-key"),
  };

  await updateMonitoredCodexTray(apiKeyAccount, {
    primaryPercent: 40,
    primaryLabel: "Credits",
  });

  assert.equal(invocations.length, 2);
  assert.equal(invocations[1].args.info.primaryPercent, 40);
});

test("syncActiveCodexAccount syncs active OAuth configuration to backend", async () => {
  const invocations = [];
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        invocations.push({ cmd, args });
        return null;
      },
      transformCallback: () => 1,
    },
  };

  const accounts = [
    {
      id: "acc-oauth-1",
      email: "user@example.com",
      apiKey: obfuscate(
        JSON.stringify({
          accessToken: "at-1",
          refreshToken: "rt-1",
          accountId: "aid-1",
        }),
      ),
    },
    {
      id: "acc-api-2",
      apiKey: obfuscate("sk-proj-2"),
    },
  ];

  await syncActiveCodexAccount("acc-oauth-1", accounts);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].cmd, "sync_codex_config");
  assert.equal(invocations[0].args.account.auth.OAuth.access_token, "at-1");

  // Non-OAuth account does not invoke sync_codex_config
  await syncActiveCodexAccount("acc-api-2", accounts);
  assert.equal(invocations.length, 1);

  // Missing accounts list exits cleanly
  await syncActiveCodexAccount("non-existent", []);
  assert.equal(invocations.length, 1);
});
