import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    },
  };
}

function installBrowserMocks(storage) {
  const events = [];
  const invocations = [];
  globalThis.localStorage = storage;
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
  }
  globalThis.window = {
    localStorage: storage,
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        invocations.push({ cmd, args });
        return null;
      },
      transformCallback: () => 1,
    },
  };
  return { events, invocations };
}

test("codex keep-alive unsuspends account polling, suppresses self re-sync, and notifies UI state", async () => {
  const storage = createStorage();
  const { events, invocations } = installBrowserMocks(storage);

  const auth = await import("../../.test-build/auth/auth.js");
  const constants = await import("../../.test-build/common/backup/app-constants.js");
  const suspension = await import(
    "../../.test-build/account/capture/account-poll-suspension.js"
  );
  const cxKeepAlive = await import("../../.test-build/codex/account/codex-keep-alive.js");

  assert.equal(typeof cxKeepAlive.CODEX_KEEP_ALIVE_UPDATED_EVENT, "string");
  assert.ok(cxKeepAlive.CODEX_KEEP_ALIVE_UPDATED_EVENT.length > 0);

  suspension.suspendAccountPolling("codex", "cx-1");
  assert.equal(suspension.isAccountPollingSuspended("codex", "cx-1"), true);

  storage.setItem(
    constants.CODEX_ACCOUNTS_KEY,
    JSON.stringify([
      {
        id: "cx-1",
        apiKey: auth.obfuscate(JSON.stringify({ accessToken: "old", refreshToken: "rt-1" })),
      },
    ]),
  );

  // Intercept storage.setItem to simulate SecureStorageAdapter.onMutation firing synchronously
  const origSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    origSetItem(key, value);
    cxKeepAlive.notifyCodexKeepAliveStorageChange(key);
  };

  cxKeepAlive.persistRefreshedCodexTokens(
    {
      accountId: "cx-1",
      apiKey: JSON.stringify({ accessToken: "new-access", refreshToken: "rt-1" }),
    },
    storage,
  );

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(suspension.isAccountPollingSuspended("codex", "cx-1"), false);
  assert.equal(
    invocations.filter((i) => i.cmd === "sync_codex_keep_alive_accounts").length,
    0,
    "self-initiated token persistence must not trigger sync_codex_keep_alive_accounts loop",
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === cxKeepAlive.CODEX_KEEP_ALIVE_UPDATED_EVENT &&
        e.detail?.accountId === "cx-1",
    ),
    "persistRefreshedCodexTokens must notify React listeners",
  );
});

test("antigravity keep-alive exports persistRefreshedTokens, unsuspends polling, avoids re-sync loop, and forwards email", async () => {
  const storage = createStorage();
  const { events, invocations } = installBrowserMocks(storage);

  const auth = await import("../../.test-build/auth/auth.js");
  const suspension = await import(
    "../../.test-build/account/capture/account-poll-suspension.js"
  );
  const agKeepAlive = await import(
    "../../.test-build/antigravity/antigravity-keep-alive.js"
  );

  assert.equal(typeof agKeepAlive.persistRefreshedTokens, "function");
  assert.equal(typeof agKeepAlive.buildKeepAliveAccounts, "function");
  assert.equal(typeof agKeepAlive.ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT, "string");

  suspension.suspendAccountPolling("antigravity", "ag-1");
  storage.setItem(
    "antigravity-accounts-list",
    JSON.stringify([
      {
        id: "ag-1",
        email: "user@example.com",
        token: auth.obfuscate("old-ag-token"),
        refreshToken: auth.obfuscate("rt-ag"),
        authMethod: "consumer",
      },
    ]),
  );

  const built = agKeepAlive.buildKeepAliveAccounts(storage);
  assert.equal(built[0].email, "user@example.com");

  const origSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    origSetItem(key, value);
    agKeepAlive.notifyAntigravityKeepAliveStorageChange(key);
  };

  agKeepAlive.persistRefreshedTokens(
    {
      accountId: "ag-1",
      accessToken: "new-ag-token",
      authMethod: "consumer",
    },
    storage,
  );

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(suspension.isAccountPollingSuspended("antigravity", "ag-1"), false);
  const stored = JSON.parse(storage.getItem("antigravity-accounts-list"));
  assert.equal(auth.deobfuscate(stored[0].token), "new-ag-token");
  assert.equal(
    invocations.filter((i) => i.cmd === "sync_antigravity_keep_alive_accounts").length,
    0,
    "self-initiated token persistence must not trigger sync_antigravity_keep_alive_accounts loop",
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === agKeepAlive.ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT &&
        e.detail?.accountId === "ag-1",
    ),
    "persistRefreshedTokens must notify React listeners",
  );
});

test("mergeCodexOAuthRefreshResponse merges refreshed tokens and preserves existing refresh token", async () => {
  const { mergeCodexOAuthRefreshResponse } = await import(
    "../../.test-build/codex/account/codex-oauth-refresh.js"
  );

  const merged = mergeCodexOAuthRefreshResponse(
    {
      accessToken: "expired-token",
      refreshToken: "keep-rt",
      idToken: "old-id",
      accountId: "acc-orig",
      tokens: { access_token: "expired-token", refresh_token: "keep-rt" },
    },
    {
      access_token: "fresh-token",
      id_token: "fresh-id",
    },
    "2026-11-18T12:00:00.000Z",
  );

  assert.equal(merged.accessToken, "fresh-token");
  assert.equal(merged.refreshToken, "keep-rt");
  assert.equal(merged.idToken, "fresh-id");
  assert.equal(merged.accountId, "acc-orig");
  assert.equal(merged.lastRefresh, "2026-11-18T12:00:00.000Z");
  assert.equal(merged.tokens.access_token, "fresh-token");
  assert.equal(merged.tokens.refresh_token, "keep-rt");

  assert.throws(() => mergeCodexOAuthRefreshResponse({}, {}), /access_token/);
});

test("React keep-alive sync, Codex 401 refresh retry, and taskbar set-focus capability are wired", () => {
  const coordinator = fs.readFileSync("src/hooks/app/useAppCoordinator.ts", "utf8");
  const syncHook = fs.readFileSync("src/hooks/app/useKeepAliveStateSync.ts", "utf8");
  const codexFetcher = fs.readFileSync("src/hooks/codex/useCodexUsageFetcher.ts", "utf8");
  const caps = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));

  assert.match(coordinator, /useKeepAliveStateSync\(/);
  assert.match(syncHook, /ANTIGRAVITY_KEEP_ALIVE_UPDATED_EVENT/);
  assert.match(syncHook, /CODEX_KEEP_ALIVE_UPDATED_EVENT/);
  assert.match(codexFetcher, /refresh_chatgpt_token/);
  assert.match(codexFetcher, /mergeCodexOAuthRefreshResponse/);
  assert.ok(
    caps.permissions.includes("core:window:allow-set-focus"),
    "default capability must allow core:window:allow-set-focus for taskbar context menu",
  );
});
