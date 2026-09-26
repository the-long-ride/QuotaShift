import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexKeepAliveAccounts,
  loadCodexAccountsForKeepAlive,
  persistRefreshedCodexTokens,
  syncCodexKeepAliveAccounts,
  notifyCodexKeepAliveStorageChange,
  initializeCodexKeepAliveBridge,
  DEFAULT_CODEX_KEEP_ALIVE_INTERVAL_MINS,
  CODEX_TOKEN_UPDATE_EVENT,
} from "../../.test-build/codex/codex-keep-alive.js";
import { obfuscate } from "../../.test-build/auth/auth.js";
import {
  CODEX_ACCOUNTS_KEY,
  CODEX_ACTIVE_ID_KEY,
} from "../../.test-build/common/app-constants.js";

const createMockStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    get(key) {
      return store.get(key);
    },
  };
};

test("Codex keep-alive defaults and constants are defined", () => {
  assert.equal(DEFAULT_CODEX_KEEP_ALIVE_INTERVAL_MINS, 240);
  assert.equal(CODEX_TOKEN_UPDATE_EVENT, "codex-keep-alive-tokens");
});

test("loadCodexAccountsForKeepAlive safely loads accounts from storage", () => {
  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([
      { id: "acc-1", apiKey: obfuscate("sk-test-1"), email: "user1@example.com" },
      { id: "acc-2", apiKey: obfuscate("sk-test-2") },
    ]),
  });

  const accounts = loadCodexAccountsForKeepAlive(storage);
  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].id, "acc-1");
  assert.equal(accounts[1].id, "acc-2");
});

test("loadCodexAccountsForKeepAlive handles invalid JSON gracefully", () => {
  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: "invalid-json{",
  });
  const accounts = loadCodexAccountsForKeepAlive(storage);
  assert.deepEqual(accounts, []);
});

test("buildCodexKeepAliveAccounts deobfuscates keys and skips empty/corrupt accounts", () => {
  const oauthJson = JSON.stringify({
    accessToken: "access-token-123",
    refreshToken: "refresh-token-456",
    accountId: "chatgpt-acc-789",
  });

  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([
      { id: "acc-oauth", apiKey: obfuscate(oauthJson), email: "oauth@example.com" },
      { id: "acc-api", apiKey: obfuscate("sk-proj-abc"), email: "api@example.com" },
      { id: "acc-empty", apiKey: "" },
      { id: "", apiKey: obfuscate("sk-no-id") },
    ]),
  });

  const keepAliveList = buildCodexKeepAliveAccounts(storage);
  assert.equal(keepAliveList.length, 2);
  assert.deepEqual(keepAliveList[0], {
    accountId: "acc-oauth",
    apiKey: oauthJson,
    email: "oauth@example.com",
  });
  assert.deepEqual(keepAliveList[1], {
    accountId: "acc-api",
    apiKey: "sk-proj-abc",
    email: "api@example.com",
  });
});

test("persistRefreshedCodexTokens updates matching account with obfuscated credentials", () => {
  const initialOAuth = JSON.stringify({
    accessToken: "old-access",
    refreshToken: "old-refresh",
  });
  const updatedOAuth = JSON.stringify({
    accessToken: "new-access",
    refreshToken: "new-refresh",
    email: "updated@example.com",
  });

  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([
      { id: "acc-1", apiKey: obfuscate(initialOAuth), email: "initial@example.com" },
      { id: "acc-2", apiKey: obfuscate("sk-key-2") },
    ]),
  });

  persistRefreshedCodexTokens(
    {
      accountId: "acc-1",
      apiKey: updatedOAuth,
    },
    storage,
  );

  const savedRaw = storage.get(CODEX_ACCOUNTS_KEY);
  const parsed = JSON.parse(savedRaw);
  assert.equal(parsed.length, 2);

  const acc1 = parsed.find((a) => a.id === "acc-1");
  assert.ok(acc1);
  assert.notEqual(acc1.apiKey, initialOAuth);
  assert.equal(acc1.email, "initial@example.com");

  const acc2 = parsed.find((a) => a.id === "acc-2");
  assert.equal(acc2.apiKey, obfuscate("sk-key-2"));
});

test("persistRefreshedCodexTokens exits early if accountId or apiKey missing", () => {
  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "acc-1", apiKey: "foo" }]),
  });
  persistRefreshedCodexTokens({ accountId: "", apiKey: "bar" }, storage);
  persistRefreshedCodexTokens({ accountId: "acc-1", apiKey: "" }, storage);
  assert.equal(JSON.parse(storage.get(CODEX_ACCOUNTS_KEY))[0].apiKey, "foo");
});

test("persistRefreshedCodexTokens extracts email from OAuth payload if account lacks one", () => {
  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "acc-no-email", apiKey: obfuscate("old") }]),
  });
  persistRefreshedCodexTokens(
    {
      accountId: "acc-no-email",
      apiKey: JSON.stringify({ accessToken: "new-token", email: "extracted@example.com" }),
    },
    storage,
  );
  const parsed = JSON.parse(storage.get(CODEX_ACCOUNTS_KEY));
  assert.equal(parsed[0].email, "extracted@example.com");
});

test("persistRefreshedCodexTokens handles malformed json gracefully", () => {
  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "acc-test", apiKey: obfuscate("old") }]),
  });
  persistRefreshedCodexTokens(
    {
      accountId: "acc-test",
      apiKey: "{malformed_json",
    },
    storage,
  );
  const parsed = JSON.parse(storage.get(CODEX_ACCOUNTS_KEY));
  assert.ok(parsed[0].apiKey);
});

test("persistRefreshedCodexTokens triggers syncActiveCodexAccount if account is active", async () => {
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
  const oauthJson = JSON.stringify({
    accessToken: "active-token",
    refreshToken: "active-refresh",
    accountId: "active-chatgpt",
  });
  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "active-acc", apiKey: obfuscate("old") }]),
    [CODEX_ACTIVE_ID_KEY]: "active-acc",
  });
  persistRefreshedCodexTokens(
    {
      accountId: "active-acc",
      apiKey: oauthJson,
    },
    storage,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(invocations.some((i) => i.cmd === "sync_codex_config"));
});

test("syncCodexKeepAliveAccounts calls backend command with accounts", async () => {
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
  const storage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "acc-1", apiKey: obfuscate("sk-1") }]),
  });
  await syncCodexKeepAliveAccounts(storage);
  assert.equal(invocations[0].cmd, "sync_codex_keep_alive_accounts");
  assert.equal(invocations[0].args.accounts.length, 1);
});

test("notifyCodexKeepAliveStorageChange triggers background sync for CODEX_ACCOUNTS_KEY", async () => {
  const invocations = [];
  globalThis.localStorage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "acc-1", apiKey: obfuscate("sk-1") }]),
  });
  globalThis.window = {
    localStorage: globalThis.localStorage,
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        invocations.push({ cmd, args });
        return null;
      },
      transformCallback: () => 1,
    },
  };
  notifyCodexKeepAliveStorageChange("unrelated-key");
  assert.equal(invocations.length, 0);

  notifyCodexKeepAliveStorageChange(CODEX_ACCOUNTS_KEY);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(invocations.some((i) => i.cmd === "sync_codex_keep_alive_accounts"));
});

test("initializeCodexKeepAliveBridge registers listener, syncs, and starts keep alive", async () => {
  const invocations = [];
  globalThis.localStorage = createMockStorage({
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "acc-1", apiKey: obfuscate("sk-1") }]),
  });
  globalThis.window = {
    localStorage: globalThis.localStorage,
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        invocations.push({ cmd, args });
        return null;
      },
      transformCallback: () => 1,
    },
  };

  await initializeCodexKeepAliveBridge();
  // Repeated call does nothing due to initialized guard
  await initializeCodexKeepAliveBridge();

  assert.ok(invocations.some((i) => i.cmd === "sync_codex_keep_alive_accounts"));
  assert.ok(invocations.some((i) => i.cmd === "start_keep_alive"));
});

