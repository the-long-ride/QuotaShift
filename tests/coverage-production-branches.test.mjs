import test from "node:test";
import assert from "node:assert/strict";

import {
  scoreAntigravityNormalizedUsage,
  scoreCodexNormalizedUsage,
  scoreClaudeNormalizedUsage,
  sortAntigravityAccountIds,
  sortCodexAccountIds,
  weightedUsageScore,
} from "../.test-build/account/account-sort.js";
import {
  isAccountPollingSuspended,
  resumeAccountPolling,
  suspendAccountPolling,
} from "../.test-build/account/account-poll-suspension.js";
import {
  buildExactRequest,
  markCloudFallback,
  mergeExactResult,
  savePersistentWorkerPreference,
} from "../.test-build/antigravity/antigravity-exact.js";
import {
  DEFAULT_IDLE_POLL_INTERVAL_SECS,
  DEFAULT_TRACKED_POLL_INTERVAL_SECS,
  IDLE_POLL_INTERVAL_KEY,
  TRACKED_POLL_INTERVAL_KEY,
  loadIdlePollIntervalPreference,
  loadPollIntervalPreference,
  loadTrackedPollIntervalPreference,
  sanitizeIdlePollInterval,
  sanitizeTrackedPollInterval,
  saveIdlePollIntervalPreference,
  savePollIntervalPreference,
  saveTrackedPollIntervalPreference,
} from "../.test-build/common/poll-interval.js";
import {
  DEFAULT_PLATFORM_VISIBILITY,
  PLATFORM_VISIBILITY_KEY,
  firstVisiblePlatform,
  loadPlatformVisibilityPreference,
  normalizePlatformVisibility,
  savePlatformVisibilityPreference,
} from "../.test-build/common/platform-visibility.js";
import {
  UI_ADJUSTMENT_STORAGE_KEY,
  loadUiAdjustmentPreferences,
  normalizeUiAdjustmentPreferences,
  saveUiAdjustmentPreferences,
} from "../.test-build/common/ui-adjustment.js";
import {
  buildCodexRouterConfig,
  codexAccessTokenExpiryMs,
  refreshActivePoolOAuthCredentials,
  shouldRefreshCodexRouterOAuth,
} from "../.test-build/codex/codex-router.js";
import {
  buildShortcutFromKeyEvent,
  formatShortcutDisplay,
  matchesShortcutEvent,
  saveShortcutPreferences,
  shortcutKeycaps,
} from "../.test-build/common/shortcuts.js";
import {
  MAIN_WINDOW_ZOOM_STORAGE_KEY,
  loadMainWindowZoomPercent,
  normalizeMainWindowZoomPercent,
  saveMainWindowZoomPercent,
} from "../.test-build/common/main-window-zoom.js";
import { createShortcutRegistrationController } from "../.test-build/common/shortcut-registration.js";
import {
  buildCodexAuthContent,
  parseCodexLocalAuth,
} from "../.test-build/codex/current-local-session.js";
import {
  extractAntigravitySessionAccount,
  extractEmailFromUserStatus,
} from "../.test-build/antigravity/current-local-session.js";
import { deobfuscate } from "../.test-build/auth/auth.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

const agAccount = (id, extra = {}) => ({ id, label: id, token: "token", ...extra });
const codexAccount = (id, extra = {}) => ({ id, label: id, apiKey: "sk-test", ...extra });

test("account usage scorers cover fallback sources, disabled windows, missing caches, and clamping", () => {
  assert.equal(weightedUsageScore(60, null), 10);
  assert.equal(weightedUsageScore(null, 40), 40);

  const accountQuotas = agAccount("aq", {
    lastPlan: "Plus",
    quotas: [{ model: "m", percent: 70, weeklyPercent: 80 }],
  });
  assert.ok(scoreAntigravityNormalizedUsage(accountQuotas) > 0);

  const cloud = [{ modelId: "gemini-2.5-pro", remainingPercent: 50 }];
  assert.notEqual(
    scoreAntigravityNormalizedUsage(agAccount("cache-cloud", { lastPlan: "Plus" }), {
      planTier: "Plus",
      cloudQuotas: cloud,
    }),
    null,
  );
  assert.notEqual(
    scoreAntigravityNormalizedUsage(
      agAccount("account-cloud", { lastPlan: "Plus", cloudQuotas: cloud }),
    ),
    null,
  );
  assert.equal(scoreAntigravityNormalizedUsage(agAccount("none", { lastPlan: "Plus" })), null);

  const disabled = scoreAntigravityNormalizedUsage(agAccount("disabled", { lastPlan: "Plus" }), {
    planTier: "Plus",
    quotas: [
      {
        model: "m",
        percent: 10,
        fiveHourDisabled: true,
        weeklyDisabled: true,
      },
    ],
  });
  assert.equal(disabled, null);

  assert.equal(scoreCodexNormalizedUsage(codexAccount("missing"), null), null);
  assert.equal(scoreCodexNormalizedUsage(codexAccount("loading"), { loading: true }), null);
  assert.equal(scoreCodexNormalizedUsage(codexAccount("error"), { error: "bad" }), null);
  assert.equal(
    scoreCodexNormalizedUsage(codexAccount("free", { lastPlan: "ChatGPT Free" }), {
      planName: "ChatGPT Free",
      isOAuth: true,
      secondary: { used_percent: 150 },
    }),
    100 / 24,
  );

  const claude = {
    account: { id: "c", configDir: "c", subscriptionType: "max-20x" },
    fiveHour: { usedPercentage: 120 },
    sevenDay: { usedPercentage: -20 },
  };
  assert.equal(scoreClaudeNormalizedUsage(claude), 2000 / 6);
});

test("provider sorters cover missing metadata, cache email fallback, tier ranking, and stable ties", () => {
  const ag = [
    agAccount("b", { label: "  Beta ", email: "", lastPlan: "Plus", lastUsedAt: Infinity }),
    agAccount("a", { label: "Alpha", email: "a@example.com", lastPlan: "Free", lastUsedAt: 10 }),
    agAccount("c", { label: "", email: "", lastPlan: "Ultra" }),
  ];
  const agCache = { b: { email: "b@example.com" } };
  assert.deepEqual(sortAntigravityAccountIds(ag, agCache, "email", "asc"), ["a", "b", "c"]);
  assert.deepEqual(sortAntigravityAccountIds(ag, agCache, "tier", "desc"), ["c", "b", "a"]);
  assert.deepEqual(sortAntigravityAccountIds(ag, agCache, "lastUsed", "asc"), ["a", "b", "c"]);

  const cx = [
    codexAccount("b", { label: "Same", email: null, lastPlan: "ChatGPT Plus" }),
    codexAccount("a", { label: "Same", email: "a@example.com", lastPlan: "ChatGPT Free" }),
  ];
  assert.deepEqual(sortCodexAccountIds(cx, {}, "alias", "asc"), ["b", "a"]);
  assert.deepEqual(sortCodexAccountIds(cx, {}, "email", "desc"), ["a", "b"]);
});

test("account poll suspension fails closed around malformed or unavailable storage", () => {
  const original = globalThis.localStorage;
  try {
    delete globalThis.localStorage;
    assert.equal(isAccountPollingSuspended("codex", "x"), false);
    suspendAccountPolling("codex", "x");
    resumeAccountPolling("codex", "x");
    assert.equal(isAccountPollingSuspended("codex", ""), false);

    globalThis.localStorage = storage({
      quotashift_auth_poll_suspensions_v1: "[]",
    });
    assert.equal(isAccountPollingSuspended("codex", "x"), false);

    globalThis.localStorage = storage({
      quotashift_auth_poll_suspensions_v1: "{bad",
    });
    assert.equal(isAccountPollingSuspended("codex", "x"), false);

    globalThis.localStorage = {
      getItem() {
        throw new Error("read");
      },
      setItem() {
        throw new Error("write");
      },
    };
    suspendAccountPolling("codex", "x");
    assert.equal(isAccountPollingSuspended("codex", "x"), false);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test("Antigravity exact helpers cover optional credentials, preference writes, fallback, and default errors", () => {
  const writes = [];
  savePersistentWorkerPreference(true, { setItem: (key, value) => writes.push([key, value]) });
  savePersistentWorkerPreference(false, { setItem: (key, value) => writes.push([key, value]) });
  assert.deepEqual(writes.map((entry) => entry[1]), ["true", "false"]);

  assert.equal(
    buildExactRequest(
      { id: "x", label: "x", email: "x@example.com", token: "encoded" },
      () => "   ",
    ),
    null,
  );
  assert.deepEqual(
    buildExactRequest(
      { id: "x", label: "x", email: " x@example.com ", token: "encoded" },
      () => "access",
    ),
    {
      accountId: "x",
      email: "x@example.com",
      accessToken: "access",
      refreshToken: null,
      profileUrl: null,
      authMethod: null,
    },
  );

  const failed = mergeExactResult(undefined, {
    accountId: "x",
    state: "error",
    fetchedAt: "now",
    status: null,
    error: null,
  }, 123);
  assert.equal(failed.fetchedAt, 123);
  assert.equal(failed.error, "Exact Antigravity quota refresh failed");

  const cloud = mergeExactResult(
    { source: "cloud", exactState: "cloud_fallback", workerMessage: "existing", fetchedAt: 5 },
    {
      accountId: "x",
      state: "error",
      fetchedAt: "now",
      status: null,
      error: "Antigravity IDE not found",
    },
    10,
  );
  assert.equal(cloud.exactState, "cloud_fallback");
  assert.equal(cloud.workerMessage, "existing");
  assert.equal(cloud.error, undefined);

  assert.equal(markCloudFallback(undefined, { error: "cloud failed" }).error, "cloud failed");
  assert.equal(markCloudFallback(undefined, {}).error, undefined);
});

test("poll interval helpers cover sanitizers, storage failures, and tracked change events", () => {
  assert.equal(sanitizeTrackedPollInterval(4.4), 5);
  assert.equal(sanitizeTrackedPollInterval(5000), 1200);
  assert.equal(sanitizeTrackedPollInterval(" 77 "), 77);
  assert.equal(sanitizeTrackedPollInterval("bad"), DEFAULT_TRACKED_POLL_INTERVAL_SECS);
  assert.equal(sanitizeIdlePollInterval(5.6), 6);
  assert.equal(sanitizeIdlePollInterval("1500"), 1200);
  assert.equal(sanitizeIdlePollInterval("bad"), DEFAULT_IDLE_POLL_INTERVAL_SECS);

  const throwing = {
    getItem() {
      throw new Error("read");
    },
    setItem() {
      throw new Error("write");
    },
  };
  assert.equal(loadPollIntervalPreference(throwing), 30);
  assert.equal(loadTrackedPollIntervalPreference(throwing), 30);
  assert.equal(loadIdlePollIntervalPreference(throwing), 600);
  savePollIntervalPreference(30, throwing);
  saveTrackedPollIntervalPreference(30, throwing);
  saveIdlePollIntervalPreference(30, throwing);

  const tracked = storage({ [TRACKED_POLL_INTERVAL_KEY]: "" });
  const idle = storage({ [IDLE_POLL_INTERVAL_KEY]: "" });
  assert.equal(loadTrackedPollIntervalPreference(tracked), 30);
  assert.equal(loadIdlePollIntervalPreference(idle), 600);

  const originalWindow = globalThis.window;
  const OriginalCustomEvent = globalThis.CustomEvent;
  const events = [];
  try {
    globalThis.window = { dispatchEvent: (event) => events.push(event) };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
    saveTrackedPollIntervalPreference(42, tracked);
    assert.equal(events[0].detail, 42);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (OriginalCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = OriginalCustomEvent;
  }
});

test("platform visibility normalizes partial/malformed data and tolerates storage errors", () => {
  assert.deepEqual(normalizePlatformVisibility(null), DEFAULT_PLATFORM_VISIBILITY);
  assert.deepEqual(normalizePlatformVisibility([]), DEFAULT_PLATFORM_VISIBILITY);
  assert.deepEqual(normalizePlatformVisibility({ antigravity: false, codex: "no", claude: true }), {
    antigravity: false,
    codex: true,
    claude: true,
  });
  assert.equal(firstVisiblePlatform({ antigravity: true, codex: true, claude: true }), "antigravity");

  const malformed = storage({ [PLATFORM_VISIBILITY_KEY]: "{bad" });
  assert.deepEqual(loadPlatformVisibilityPreference(malformed), DEFAULT_PLATFORM_VISIBILITY);
  const throwing = {
    getItem() {
      throw new Error("read");
    },
    setItem() {
      throw new Error("write");
    },
  };
  assert.deepEqual(loadPlatformVisibilityPreference(throwing), DEFAULT_PLATFORM_VISIBILITY);
  savePlatformVisibilityPreference(DEFAULT_PLATFORM_VISIBILITY, throwing);
});

test("UI adjustment helpers cover null storage, malformed JSON, string scale, and rejected writes", () => {
  assert.deepEqual(normalizeUiAdjustmentPreferences({ overlayScale: "79", overlayTheme: "mono" }), {
    overlayScale: 80,
    overlayTheme: "mono",
  });
  assert.deepEqual(normalizeUiAdjustmentPreferences({ overlayScale: "not-a-number" }), {
    overlayScale: 100,
    overlayTheme: "glassmorphism",
  });
  assert.deepEqual(loadUiAdjustmentPreferences(null), {
    overlayScale: 100,
    overlayTheme: "glassmorphism",
  });

  const malformed = storage({ [UI_ADJUSTMENT_STORAGE_KEY]: "{bad" });
  assert.deepEqual(loadUiAdjustmentPreferences(malformed), {
    overlayScale: 100,
    overlayTheme: "glassmorphism",
  });
  saveUiAdjustmentPreferences({ overlayScale: 150, overlayTheme: "mono" }, null);
  assert.throws(
    () =>
      saveUiAdjustmentPreferences(
        { overlayScale: 150, overlayTheme: "mono" },
        { getItem: () => null, setItem: () => { throw new Error("write"); } },
      ),
    /write/,
  );
});

function jwt(payload) {
  return `head.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

test("Codex router config skips invalid credentials and filters model IDs", () => {
  const now = Date.now();
  const values = new Map([
    ["throw", null],
    ["bad-json", "{bad"],
    ["bad-oauth", JSON.stringify({ accessToken: "", accountId: "id" })],
    ["empty-key", "   "],
    ["good", JSON.stringify({ access_token: "a", refresh_token: 4, account_id: "acct" })],
  ]);
  const config = buildCodexRouterConfig({
    accounts: [
      codexAccount("throw", { apiKey: "throw" }),
      codexAccount("bad-json", { apiKey: "bad-json" }),
      codexAccount("bad-oauth", { apiKey: "bad-oauth" }),
      codexAccount("empty-key", { apiKey: "empty-key" }),
      codexAccount("good", { apiKey: "good" }),
    ],
    pools: [{ id: "p", name: "P", model: "m", accountIds: ["good"] }],
    usageCache: {
      good: {
        fetchedAt: now,
        rate_limit: { primary_window: { used_percent: 130, window_duration_mins: 300 } },
      },
    },
    modelCache: {
      good: {
        accountId: "good",
        planName: "Plus",
        fetchedAt: now,
        models: [{ id: "" }, { id: 5 }, { id: " model " }],
      },
    },
    appliedAccountId: null,
    activePoolId: "p",
    decodeCredential: (value) => {
      if (value === "throw") throw new Error("decode");
      return values.get(value) ?? value;
    },
  });

  assert.equal(config.accounts.length, 1);
  assert.equal(config.accounts[0].auth.kind, "oAuth");
  assert.equal(config.accounts[0].auth.refreshToken, null);
  assert.deepEqual(config.accounts[0].availableModelIds, [" model "]);
  assert.equal(config.accounts[0].quotaWindows[0].remainingPercent, 0);
  assert.equal(config.accounts[0].usageFetchedAt, now);
  assert.equal(config.pools[0].modelSelectionMode, "manual");
});

test("Codex OAuth expiry helpers cover malformed JWTs and refresh fallback rules", () => {
  assert.equal(codexAccessTokenExpiryMs("not-jwt"), null);
  assert.equal(codexAccessTokenExpiryMs("a.bad!.c"), null);
  assert.equal(codexAccessTokenExpiryMs(jwt([])), null);
  assert.equal(codexAccessTokenExpiryMs(jwt({ exp: "123" })), null);
  assert.equal(codexAccessTokenExpiryMs(jwt({ exp: 123 })), 123000);

  const now = 1_000_000_000;
  assert.equal(shouldRefreshCodexRouterOAuth({ accessToken: "x" }, now), false);
  assert.equal(shouldRefreshCodexRouterOAuth({ refreshToken: "r", accessToken: "" }, now), true);
  assert.equal(
    shouldRefreshCodexRouterOAuth(
      { refreshToken: "r", accessToken: jwt({ exp: (now + 60_000) / 1000 }) },
      now,
    ),
    true,
  );
  assert.equal(
    shouldRefreshCodexRouterOAuth(
      { refreshToken: "r", accessToken: jwt({ exp: (now + 600_000) / 1000 }) },
      now,
    ),
    false,
  );
  assert.equal(
    shouldRefreshCodexRouterOAuth({ refreshToken: "r", accessToken: "opaque", lastRefresh: "bad" }, now),
    true,
  );
  assert.equal(
    shouldRefreshCodexRouterOAuth(
      { refreshToken: "r", accessToken: "opaque", lastRefresh: new Date(now - 60_000).toISOString() },
      now,
    ),
    false,
  );
  assert.equal(
    shouldRefreshCodexRouterOAuth(
      { refreshToken: "r", accessToken: "opaque", lastRefresh: new Date(now - 60 * 60_000).toISOString() },
      now,
    ),
    true,
  );
});

test("active-pool OAuth refresh covers gating, failures, id token rotation, and no-pool path", async () => {
  const now = Date.now();
  const old = new Date(now - 60 * 60_000).toISOString();
  const oauth = (id, extra = {}) =>
    codexAccount(id, {
      apiKey: JSON.stringify({
        accessToken: "opaque",
        refreshToken: "refresh-" + id,
        accountId: "acct-" + id,
        lastRefresh: old,
        ...extra,
      }),
    });

  const noPool = await refreshActivePoolOAuthCredentials({
    accounts: [oauth("a")],
    pools: [],
    activePoolId: "missing",
    decodeCredential: (value) => value,
    encodeCredential: (value) => value,
    refreshToken: async () => ({}),
    now,
  });
  assert.deepEqual(noPool.refreshedAccountIds, []);

  const accounts = [
    oauth("good"),
    oauth("missing-access"),
    oauth("throws"),
    oauth("blocked"),
    codexAccount("api", { apiKey: "sk-api" }),
    codexAccount("bad-json", { apiKey: "{bad" }),
    codexAccount("decode-error", { apiKey: "decode-error" }),
  ];
  const attempts = [];
  const result = await refreshActivePoolOAuthCredentials({
    accounts,
    pools: [{ id: "p", name: "P", model: "m", accountIds: accounts.map((account) => account.id) }],
    activePoolId: "p",
    decodeCredential: (value) => {
      if (value === "decode-error") throw new Error("decode");
      return value;
    },
    encodeCredential: (value) => value,
    shouldAttempt: (id) => id !== "blocked",
    onAttempt: (id) => attempts.push(id),
    refreshToken: async (_refresh, account) => {
      if (account.id === "good") {
        return { access_token: "fresh", refresh_token: "", id_token: "id-new" };
      }
      if (account.id === "missing-access") return {};
      throw new Error("network");
    },
    now,
  });

  assert.deepEqual(attempts, ["good", "missing-access", "throws"]);
  assert.deepEqual(result.refreshedAccountIds, ["good"]);
  assert.deepEqual(result.failedAccountIds, ["missing-access", "throws"]);
  const good = JSON.parse(result.accounts[0].apiKey);
  assert.equal(good.accessToken, "fresh");
  assert.equal(good.refreshToken, "refresh-good");
  assert.equal(good.idToken, "id-new");
});

test("shortcut helpers cover platform display, punctuation, invalid keys, exact modifiers, and event dispatch", () => {
  assert.deepEqual(shortcutKeycaps("CommandOrControl+Shift+Q"), ["Ctrl", "Shift", "Q"]);
  assert.deepEqual(shortcutKeycaps(""), []);
  assert.equal(formatShortcutDisplay("Control+Command+A"), "Ctrl + Cmd + A");

  const base = { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false };
  assert.equal(buildShortcutFromKeyEvent({ ...base, key: " ", code: "Space" }), "CommandOrControl+Space");
  assert.equal(buildShortcutFromKeyEvent({ ...base, key: "?", code: "Unknown" }), null);
  assert.equal(
    matchesShortcutEvent({ ...base, key: "a", code: "KeyA" }, "Control+A"),
    true,
  );
  assert.equal(
    matchesShortcutEvent({ ...base, ctrlKey: false, metaKey: true, key: "a", code: "KeyA" }, "Command+A"),
    true,
  );
  assert.equal(
    matchesShortcutEvent({ ...base, altKey: true, key: "a", code: "KeyA" }, "CommandOrControl+A"),
    false,
  );
  assert.equal(matchesShortcutEvent({ ...base, key: "a", code: "KeyA" }, ""), false);

  const originalWindow = globalThis.window;
  const OriginalCustomEvent = globalThis.CustomEvent;
  const events = [];
  try {
    globalThis.window = { dispatchEvent: (event) => events.push(event) };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type) {
        this.type = type;
      }
    };
    const target = storage();
    saveShortcutPreferences(
      {
        toggleOverlay: "Alt+O",
        toggleOverlayEnabled: false,
        refreshAccount: "Alt+R",
        refreshAccountEnabled: false,
        addAccount: "Alt+N",
        toggleTheme: "Alt+L",
        toggleCardView: "Alt+E",
        focusSearch: "Alt+F",
        refreshAll: "Alt+U",
        openSettings: "Alt+S",
        quitApp: "Alt+Q",
      },
      target,
    );
    assert.equal(events.length, 1);
    assert.equal(target.values.size, 11);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (OriginalCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = OriginalCustomEvent;
  }
});


test("main window zoom covers default, malformed, string, null-storage, and persistence branches", () => {
  assert.equal(normalizeMainWindowZoomPercent(null), 100);
  assert.equal(normalizeMainWindowZoomPercent(""), 100);
  assert.equal(normalizeMainWindowZoomPercent("bad"), 100);
  assert.equal(normalizeMainWindowZoomPercent("121.4"), 121);
  assert.equal(loadMainWindowZoomPercent(null), 100);
  saveMainWindowZoomPercent(130, null);

  const target = storage();
  saveMainWindowZoomPercent(192, target);
  assert.equal(target.getItem(MAIN_WINDOW_ZOOM_STORAGE_KEY), "190");
  assert.equal(loadMainWindowZoomPercent(target), 190);
});

test("local session parsers cover malformed, fallback, profile-precedence, and short-key branches", () => {
  assert.equal(extractEmailFromUserStatus(null), undefined);
  assert.equal(extractEmailFromUserStatus("{bad"), undefined);
  assert.equal(extractEmailFromUserStatus(12), undefined);
  assert.equal(extractEmailFromUserStatus({ email: " direct@example.com " }), " direct@example.com ");
  assert.equal(
    extractEmailFromUserStatus({ userInfo: { email: "nested@example.com" }, email: "other@example.com" }),
    "nested@example.com",
  );

  assert.equal(extractAntigravitySessionAccount("bad"), null);
  assert.equal(extractAntigravitySessionAccount({}), null);
  const ag = extractAntigravitySessionAccount(
    {
      "antigravityUnifiedStateSync.oauthToken": "token",
      "antigravity.refreshToken": "",
      "antigravity.profileUrl": "stored-avatar",
    },
    "",
    { email: "profile@example.com", picture: "profile-avatar" },
  );
  assert.equal(ag.label, "profile");
  assert.equal(ag.email, "profile@example.com");
  assert.equal(deobfuscate(ag.profileUrl), "profile-avatar");
  assert.equal(ag.refreshToken, undefined);

  assert.equal(parseCodexLocalAuth([]), null);
  assert.equal(parseCodexLocalAuth(12), null);
  assert.equal(parseCodexLocalAuth({ auth_mode: "chatgpt", tokens: null }), null);
  assert.equal(
    parseCodexLocalAuth({ auth_mode: "chatgpt", tokens: { access_token: "" } }),
    null,
  );
  assert.equal(parseCodexLocalAuth({ auth_mode: "openai_api_key", OPENAI_API_KEY: "" }), null);

  const oauth = parseCodexLocalAuth({
    auth_mode: "chatgpt",
    tokens: { access_token: "access" },
    last_refresh: "",
  });
  assert.equal(oauth.id, "acct-oauth-shared-local-session");
  assert.equal(oauth.label, "Codex CLI");
  const oauthData = JSON.parse(deobfuscate(oauth.apiKey));
  assert.equal(oauthData.refreshToken, null);
  assert.equal(oauthData.accountId, "shared-local-session");

  const shortKey = parseCodexLocalAuth({
    auth_mode: "openai_api_key",
    OPENAI_API_KEY: "short",
  });
  assert.match(shortKey.id, /^acct-apikey-key-\d+$/);
  assert.equal(shortKey.label, "Codex CLI");

  const malformedObjectPrefix = JSON.parse(buildCodexAuthContent("{bad"));
  assert.deepEqual(malformedObjectPrefix, {
    auth_mode: "openai_api_key",
    OPENAI_API_KEY: "{bad",
  });
});

test("shortcut registration tolerates optional inspection and native registration failures", async () => {
  let toggles = 0;
  const noInspectRegistered = new Map();
  const noInspect = createShortcutRegistrationController(
    {
      async register(shortcut, handler) {
        noInspectRegistered.set(shortcut, handler);
      },
      async unregister(shortcut) {
        noInspectRegistered.delete(shortcut);
      },
    },
    { onToggleOverlay: () => toggles++, onRefreshAccount() {} },
  );
  await noInspect.replace({
    toggleOverlay: "Ctrl+Alt+D",
    refreshAccount: "",
  });
  noInspectRegistered.get("Ctrl+Alt+D")();
  assert.equal(toggles, 1);
  await noInspect.dispose();
  await noInspect.dispose();

  const errors = [];
  const warns = [];
  const oldError = console.error;
  const oldWarn = console.warn;
  console.error = (...args) => errors.push(args);
  console.warn = (...args) => warns.push(args);
  try {
    const failing = createShortcutRegistrationController(
      {
        async isRegistered() {
          throw new Error("inspect");
        },
        async register() {
          throw new Error("register");
        },
        async unregister() {
          throw new Error("unregister");
        },
      },
      { onToggleOverlay() {}, onRefreshAccount() {} },
    );
    await failing.replace({ toggleOverlay: "Ctrl+Alt+D", refreshAccount: "" });
    assert.ok(warns.length >= 1);
    assert.ok(errors.length >= 1);
    await failing.dispose();
    await failing.replace({ toggleOverlay: "Other", refreshAccount: "" });
  } finally {
    console.error = oldError;
    console.warn = oldWarn;
  }
});


test("account polling storage lookup tolerates a throwing global localStorage accessor", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    assert.equal(isAccountPollingSuspended("codex", "x"), false);
    suspendAccountPolling("codex", "x");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("main window zoom default storage branch works without browser localStorage", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    if (!descriptor || descriptor.configurable) delete globalThis.localStorage;
    assert.equal(loadMainWindowZoomPercent(), 100);
    saveMainWindowZoomPercent(120);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
  }
});
