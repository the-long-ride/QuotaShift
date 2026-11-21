import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isQuotaPollingEnabled,
  loadDisabledQuotaPollingIds,
  enableAllQuotaPolling,
  eligibleFallbackQuotaAccountId,
  scheduledQuotaAccounts,
  setQuotaPollingEnabled,
} from "../../.test-build/common/accounts/quota-polling.js";

const read = (path) => fs.readFileSync(path, "utf8");
function makeStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("account quota polling defaults on and persists per provider + account independently", () => {
  const store = makeStorage();
  assert.equal(isQuotaPollingEnabled("antigravity", "one", store), true);
  setQuotaPollingEnabled("antigravity", "one", false, store);
  assert.equal(isQuotaPollingEnabled("antigravity", "one", store), false);
  assert.equal(isQuotaPollingEnabled("codex", "one", store), true);
  assert.equal(isQuotaPollingEnabled("antigravity", "two", store), true);
  setQuotaPollingEnabled("antigravity", "one", true, store);
  assert.deepEqual(loadDisabledQuotaPollingIds("antigravity", store), []);
});

test("monitored entries override disabled preferences and unmonitor never disables polling", () => {
  const store = makeStorage();
  setQuotaPollingEnabled("codex", "tracked", false, store);
  store.setItem("quotashift_overlay_tracked_v2", JSON.stringify([{ provider: "codex", id: "tracked" }]));
  assert.equal(isQuotaPollingEnabled("codex", "tracked", store), true);
  store.setItem("quotashift_overlay_tracked_v2", "[]");
  assert.equal(isQuotaPollingEnabled("codex", "tracked", store), false);
  const tracked = read("src/hooks/app/tracking/useTrackedAccountIds.ts");
  assert.match(tracked, /setQuotaPollingEnabled\(entry.provider, entry.id, true\)/);
  assert.doesNotMatch(read("src/utils/common/accounts/tracked-accounts.ts"), /setQuotaPollingEnabled/);
});

test("idle and bootstrap fetch paths are filtered, but manual refresh remains available", () => {
  const s = read("src/hooks/app/useAppEventListeners.ts");
  const bootstrap = read("src/hooks/app/useAppSessionBootstrap.ts");
  assert.match(s, /scheduledQuotaAccounts\("codex", loadCodexAccounts\(\)\)/);
  assert.match(s, /scheduledQuotaAccounts\("antigravity", loadAntigravityAccounts\(\)\)/);
  assert.match(bootstrap, /scheduledQuotaAccounts\("codex", cxAccounts\)/);
  assert.match(bootstrap, /scheduledQuotaAccounts\("antigravity", agAccounts\)/);
  assert.match(bootstrap, /const triggerRefresh = async/);
  assert.match(bootstrap, /fetchAccountUsage\(acc, force\)/);
});

test("keep-alive never derives its enabled state from account quota-polling switches", () => {
  const keepAlive = read("src/hooks/app/useKeepAliveStateSync.ts");
  assert.match(keepAlive, /isQuotaPollingEnabled\("antigravity", accountId\)/);
  assert.match(keepAlive, /isQuotaPollingEnabled\("codex", accountId\)/);
  assert.match(keepAlive, /fresh.token/);
  assert.match(keepAlive, /fresh.apiKey/);
  assert.match(read("src/utils/common/backup/app-constants.ts"), /loadKeepAlivePreference/);
});

test("Claude backend skips disabled profiles only for scheduled polling, not manual/guardrails/monitored", () => {
  const rust = read("src-tauri/src/claude/accounts.rs");
  assert.match(rust, /disabled_account_ids: Option<Vec<String>>/);
  assert.match(rust, /if !force\s*&& !guardrails_active.unwrap_or\(false\)/);
  assert.match(rust, /!monitored_ids.contains\(&account.id\)/);
  assert.match(rust, /disabled_ids.contains\(&account.id\)/);
  const claudeHook = read("src/hooks/claude/useClaudeAccountMonitor.ts");
  assert.match(claudeHook, /disabledAccountIds: guardrailsActive \? \[\] : loadDisabledQuotaPollingIds\("claude"\)/);
  const guardrails = read("src/hooks/claude/useClaudeMonitor.ts");
  assert.match(guardrails, /if \(guardrailsActive\) enableAllQuotaPolling\("claude"/);
});

test("the Star/Donate prompt waits for an actual main-window activation", () => {
  const modal = read("src/components/common/support/SupportPromptModal.tsx");
  assert.match(modal, /mainWindow.isVisible\(\)/);
  assert.match(modal, /mainWindow.isFocused\(\)/);
  assert.match(modal, /mainWindow.onFocusChanged/);
  assert.match(modal, /listen\("window-shown", shown\)/);
  assert.match(modal, /scheduleEligibility\(\)/);
  assert.match(modal, /createSupportPromptActivationGate\(\)/);
  assert.match(modal, /window.addEventListener\("blur", blurred\)/);
  const timerBody = modal.slice(modal.indexOf("const scheduleEligibility"), modal.indexOf("const onMainWindowActivation"));
  assert.doesNotMatch(timerBody, /setIsOpen\(true\)/);
});

test("scheduled quota list excludes only disabled unmonitored accounts", () => {
  const prior = globalThis.localStorage;
  const store = makeStorage();
  globalThis.localStorage = store;
  try {
    setQuotaPollingEnabled("codex", "off", false, store);
    const accounts = [{ id: "on" }, { id: "off" }, { id: "second" }];
    assert.deepEqual(
      scheduledQuotaAccounts("codex", accounts).map((account) => account.id),
      ["on", "second"],
    );
    store.setItem("quotashift_overlay_tracked_v2", JSON.stringify([{ provider: "codex", id: "off" }]));
    assert.deepEqual(
      scheduledQuotaAccounts("codex", accounts).map((account) => account.id),
      ["on", "off", "second"],
    );
  } finally {
    if (prior === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prior;
  }
});

test("Guardrails re-enable all disabled Claude profiles in one storage update", () => {
  const prevStorage = globalThis.localStorage;
  const prevWindow = globalThis.window;
  const store = makeStorage();
  const emitted = [];
  globalThis.localStorage = store;
  globalThis.window = { dispatchEvent: (event) => emitted.push(event.type) };
  try {
    setQuotaPollingEnabled("claude", "first", false, store);
    setQuotaPollingEnabled("claude", "second", false, store);
    emitted.length = 0;
    enableAllQuotaPolling("claude", ["first", "second", "third"]);
    assert.deepEqual(loadDisabledQuotaPollingIds("claude", store), []);
    assert.deepEqual(emitted, ["quotashift:quota-polling-changed"]);
  } finally {
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  }
});

test("legacy monitored cadence fallback respects the actual account switch", () => {
  const store = makeStorage();
  const accounts = [{ id: "first" }, { id: "second" }];
  setQuotaPollingEnabled("antigravity", "first", false, store);
  assert.equal(eligibleFallbackQuotaAccountId("antigravity", null, accounts, store), null);
  assert.equal(
    eligibleFallbackQuotaAccountId("antigravity", "stale-or-other-provider", accounts, store),
    null,
    "stale selected IDs must not bypass the disabled first card",
  );
  assert.equal(
    eligibleFallbackQuotaAccountId("antigravity", "second", accounts, store),
    "second",
  );
  setQuotaPollingEnabled("antigravity", "first", true, store);
  assert.equal(eligibleFallbackQuotaAccountId("antigravity", null, accounts, store), "first");
  assert.equal(eligibleFallbackQuotaAccountId("codex", null, [], store), null);
  const eventListeners = read("src/hooks/app/useAppEventListeners.ts");
  assert.match(eventListeners, /eligibleFallbackQuotaAccountId\(provider, savedAccountId, accounts\)/);
});
