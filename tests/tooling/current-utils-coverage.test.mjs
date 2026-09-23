import test from "node:test";
import assert from "node:assert/strict";

import {
  clampPercent,
  formatPercent,
  formatTokens,
  formatDuration,
  formatReset,
  formatCaptureTime,
  formatClaudeModelName,
} from "../../.test-build/claude/claude-formatters.js";
import { syncClaudeGuardrailsToOverlay } from "../../.test-build/common/claude-overlay-sync.js";
import {
  loadAntigravityAccounts,
  saveAntigravityAccounts,
  loadCodexAccounts,
  saveCodexAccounts,
  loadCodexPools,
  saveCodexPools,
  loadCodexModelCache,
  saveCodexModelCache,
  loadCodexUsageCache,
  saveCodexUsageEntry,
} from "../../.test-build/common/app-storage.js";
import {
  ANTIGRAVITY_ACCOUNTS_KEY,
  ANTIGRAVITY_ORDER_KEY,
  CODEX_ACCOUNTS_KEY,
  CODEX_ORDER_KEY,
  CODEX_POOLS_KEY,
  CODEX_MODEL_CATALOG_STORAGE_KEY,
  CODEX_USAGE_CACHE_STORAGE_KEY,
  loadKeepAlivePreference,
  resolveAntigravityPlanName,
} from "../../.test-build/common/app-constants.js";
import {
  CLAUDE_AUTO_RESUME_AT_RESET_KEY,
  CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY,
  CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY,
  CLAUDE_GUARDRAILS_ENABLED_KEY,
  CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY,
  CLAUDE_POLL_INTERVAL_KEY,
  CLAUDE_REDUCE_LOW_USAGE_KEY,
  CLAUDE_STOP_THRESHOLD_KEY,
  CLAUDE_WEEKLY_STOP_ENABLED_KEY,
  CLAUDE_WEEKLY_STOP_THRESHOLD_KEY,
  loadClaudePreferences,
  loadClaudePollIntervalPreference,
  loadClaudeStopThresholdPreference,
  loadClaudeLowUsageReductionPreference,
  saveClaudePollIntervalPreference,
  saveClaudeStopThresholdPreference,
  saveClaudeLowUsageReductionPreference,
} from "../../.test-build/common/claude-preferences.js";
import {
  buildInitialMonitoredCodexInfo,
  buildMonitoredCodexInfo,
  shouldSyncTrackedCodex,
} from "../../.test-build/codex/codex-tray-state.js";
import {
  isSensitiveStorageKey,
  readString,
  toError,
} from "../../.test-build/auth/secure-storage-types.js";

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
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
    values,
  };
}

test("Claude formatters cover unavailable, clamped, compact, duration, reset, capture, and model cases", () => {
  assert.equal(clampPercent(null), 0);
  assert.equal(clampPercent(Number.NaN), 0);
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(42.5), 42.5);
  assert.equal(clampPercent(140), 100);

  assert.equal(formatPercent(undefined), "Unavailable");
  assert.equal(formatPercent(Number.POSITIVE_INFINITY), "Unavailable");
  assert.equal(formatPercent(12.34), "12.3%");

  assert.equal(formatTokens(undefined), "--");
  assert.equal(formatTokens(Number.NaN), "--");
  assert.match(formatTokens(9999), /9[,.]?999|9999/);
  assert.ok(formatTokens(12500).length > 0);

  assert.equal(formatDuration(undefined), "--");
  assert.equal(formatDuration(-500), "0s");
  assert.equal(formatDuration(9000), "9s");
  assert.equal(formatDuration(125000), "2m 5s");
  assert.equal(formatDuration(7_500_000), "2h 5m");

  const now = new Date(2026, 8, 21, 10, 0, 0);
  const today = new Date(2026, 8, 21, 14, 5, 0);
  const tomorrow = new Date(2026, 8, 22, 8, 30, 0);
  const later = new Date(2026, 9, 2, 16, 45, 0);
  assert.equal(formatReset(undefined, now.getTime()), "Reset unavailable");
  assert.equal(formatReset(today.getTime(), now.getTime()), "14:05");
  assert.equal(formatReset(tomorrow.getTime() / 1000, now.getTime()), "Tomorrow 08:30");
  assert.match(formatReset(later.getTime() / 1000, now.getTime()), /^Oct 2, 16:45$/);

  assert.equal(formatCaptureTime(0), "Unknown");
  assert.ok(formatCaptureTime(now.getTime()).length > 0);
  assert.equal(formatClaudeModelName(undefined), "Claude Code");
  assert.equal(formatClaudeModelName("Claude"), "Claude Code");
  assert.equal(formatClaudeModelName("claude-sonnet-5"), "Claude Sonnet  5");
  assert.equal(formatClaudeModelName("prefix claude-sonnet-5 suffix"), "prefix Claude Sonnet  5 suffix");
  assert.equal(formatClaudeModelName("Opus"), "Opus");
});

test("Claude overlay guardrail sync is provider-scoped, tolerant, and preserves existing payload", () => {
  const previous = globalThis.localStorage;
  const storage = createStorage();
  globalThis.localStorage = storage;
  try {
    syncClaudeGuardrailsToOverlay({
      fiveHour: { enabled: true, thresholdPct: 95 },
      weekly: { enabled: false, thresholdPct: 98 },
    });
    assert.equal(storage.values.size, 0);

    storage.setItem("quotashift_overlay_data", "{bad-json");
    syncClaudeGuardrailsToOverlay({
      fiveHour: { enabled: true, thresholdPct: 95 },
      weekly: { enabled: false, thresholdPct: 98 },
    });
    assert.equal(storage.getItem("quotashift_overlay_data"), "{bad-json");

    storage.setItem("quotashift_overlay_data", JSON.stringify({ provider: "codex", keep: 1 }));
    syncClaudeGuardrailsToOverlay({
      fiveHour: { enabled: true, thresholdPct: 95 },
      weekly: { enabled: false, thresholdPct: 98 },
    });
    assert.deepEqual(JSON.parse(storage.getItem("quotashift_overlay_data")), {
      provider: "codex",
      keep: 1,
    });

    storage.setItem("quotashift_overlay_data", JSON.stringify({ provider: "claude", keep: 1 }));
    syncClaudeGuardrailsToOverlay({
      fiveHour: { enabled: true, thresholdPct: 94 },
      weekly: { enabled: true, thresholdPct: 97 },
    });
    assert.deepEqual(JSON.parse(storage.getItem("quotashift_overlay_data")), {
      provider: "claude",
      keep: 1,
      claudeGuardrails: {
        fiveHourEnabled: true,
        fiveHourThresholdPct: 94,
        weeklyEnabled: true,
        weeklyThresholdPct: 97,
      },
    });
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("app storage loads, orders, normalizes, saves, and fails closed for malformed state", () => {
  const previous = globalThis.localStorage;
  const storage = createStorage({
    [ANTIGRAVITY_ACCOUNTS_KEY]: JSON.stringify([{ id: "a" }, { id: "b" }]),
    [ANTIGRAVITY_ORDER_KEY]: JSON.stringify(["b", "a"]),
    [CODEX_ACCOUNTS_KEY]: JSON.stringify([{ id: "c" }, { id: "d" }]),
    [CODEX_ORDER_KEY]: JSON.stringify(["d", "c"]),
    [CODEX_POOLS_KEY]: JSON.stringify([
      { id: "p", name: " Pool ", model: " gpt ", accountIds: ["c", "c", " d "] },
      { id: "", name: "bad", model: "bad", accountIds: [] },
    ]),
    [CODEX_MODEL_CATALOG_STORAGE_KEY]: JSON.stringify({ c: { fetchedAt: 1, models: ["gpt"] } }),
  });
  globalThis.localStorage = storage;
  try {
    assert.deepEqual(loadAntigravityAccounts().map((x) => x.id), ["b", "a"]);
    assert.deepEqual(loadCodexAccounts().map((x) => x.id), ["d", "c"]);
    assert.deepEqual(loadCodexPools(), [
      {
        id: "p",
        name: "Pool",
        model: "gpt",
        accountIds: ["c", "d"],
        modelSelectionMode: "manual",
      },
    ]);
    assert.deepEqual(loadCodexModelCache(), { c: { fetchedAt: 1, models: ["gpt"] } });

    saveAntigravityAccounts([{ id: "z" }]);
    saveCodexAccounts([{ id: "y" }]);
    saveCodexPools([{ id: "p2", name: "P2", model: "m", accountIds: [] }]);
    saveCodexModelCache({ y: { fetchedAt: 2, models: ["m"] } });
    assert.deepEqual(JSON.parse(storage.getItem(ANTIGRAVITY_ACCOUNTS_KEY)), [{ id: "z" }]);
    assert.deepEqual(JSON.parse(storage.getItem(CODEX_ACCOUNTS_KEY)), [{ id: "y" }]);
    assert.equal(JSON.parse(storage.getItem(CODEX_POOLS_KEY))[0].id, "p2");
    assert.deepEqual(JSON.parse(storage.getItem(CODEX_MODEL_CATALOG_STORAGE_KEY)), {
      y: { fetchedAt: 2, models: ["m"] },
    });

    storage.setItem(ANTIGRAVITY_ACCOUNTS_KEY, "{bad");
    storage.setItem(CODEX_ACCOUNTS_KEY, "{bad");
    storage.setItem(CODEX_POOLS_KEY, "{bad");
    storage.setItem(CODEX_MODEL_CATALOG_STORAGE_KEY, "{bad");
    assert.deepEqual(loadAntigravityAccounts(), []);
    assert.deepEqual(loadCodexAccounts(), []);
    assert.deepEqual(loadCodexPools(), []);
    assert.deepEqual(loadCodexModelCache(), {});
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("Codex usage cache rejects malformed roots and invalid saves while preserving valid entries", () => {
  const storage = createStorage();
  storage.setItem(CODEX_USAGE_CACHE_STORAGE_KEY, "[]");
  assert.deepEqual(loadCodexUsageCache(storage), {});

  storage.setItem(CODEX_USAGE_CACHE_STORAGE_KEY, "{bad");
  assert.deepEqual(loadCodexUsageCache(storage), {});

  storage.setItem(
    CODEX_USAGE_CACHE_STORAGE_KEY,
    JSON.stringify({
      primitive: 1,
      valid: { fetchedAt: 10, loading: true, error: "old", value: 3 },
    }),
  );
  assert.deepEqual(loadCodexUsageCache(storage), {
    valid: { fetchedAt: 10, loading: false, error: undefined, value: 3 },
  });

  const before = storage.getItem(CODEX_USAGE_CACHE_STORAGE_KEY);
  saveCodexUsageEntry("ignored", { fetchedAt: Number.NaN }, storage);
  assert.equal(storage.getItem(CODEX_USAGE_CACHE_STORAGE_KEY), before);

  saveCodexUsageEntry("next", { fetchedAt: 20, loading: true, error: "transient", value: 4 }, storage);
  const persisted = JSON.parse(storage.getItem(CODEX_USAGE_CACHE_STORAGE_KEY));
  assert.deepEqual(persisted.next, { fetchedAt: 20, loading: false, value: 4 });
});

test("app constants expose keep-alive defaults and normalize Antigravity plan labels", () => {
  assert.equal(loadKeepAlivePreference(createStorage()), true);
  assert.equal(loadKeepAlivePreference(createStorage({ keepAliveActive: "false" })), false);
  assert.equal(loadKeepAlivePreference(createStorage({ keepAliveActive: "true" })), true);

  assert.equal(resolveAntigravityPlanName(null), null);
  assert.equal(resolveAntigravityPlanName("free-tier"), "Free");
  assert.equal(resolveAntigravityPlanName("standard"), "Paid");
  assert.equal(resolveAntigravityPlanName("legacy-tier"), "Legacy");
  assert.equal(resolveAntigravityPlanName("google_ai_pro"), "Google AI Pro");
  assert.equal(resolveAntigravityPlanName("ai-ultra"), "Google AI Ultra");
  assert.equal(resolveAntigravityPlanName("GCP Project Quota 123"), null);
  assert.equal(resolveAntigravityPlanName("Custom Plan"), "Custom Plan");
  assert.equal(resolveAntigravityPlanName("enterprise"), "Enterprise");
});

test("Claude preference compatibility helpers cover legacy migration, low-usage setting, and failures", () => {
  const legacy = createStorage({
    [CLAUDE_POLL_INTERVAL_KEY]: "",
    [CLAUDE_STOP_THRESHOLD_KEY]: "91",
    [CLAUDE_GUARDRAILS_ENABLED_KEY]: "true",
    [CLAUDE_AUTO_RESUME_AT_RESET_KEY]: "true",
  });
  const migrated = loadClaudePreferences(legacy);
  assert.equal(migrated.pollIntervalSecs, 20);
  assert.equal(migrated.autoResumeAtReset, true);
  assert.deepEqual(migrated.fiveHour, { enabled: true, thresholdPct: 91 });
  assert.deepEqual(migrated.weekly, { enabled: true, thresholdPct: 91 });

  const disabledLegacy = createStorage({
    [CLAUDE_GUARDRAILS_ENABLED_KEY]: "false",
    [CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY]: "true",
    [CLAUDE_WEEKLY_STOP_ENABLED_KEY]: "true",
  });
  assert.equal(loadClaudePreferences(disabledLegacy).fiveHour.enabled, false);
  assert.equal(loadClaudePreferences(disabledLegacy).weekly.enabled, false);

  const modern = createStorage({
    [CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY]: "true",
    [CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY]: "true",
    [CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY]: "93",
    [CLAUDE_WEEKLY_STOP_ENABLED_KEY]: "false",
    [CLAUDE_WEEKLY_STOP_THRESHOLD_KEY]: "99",
    [CLAUDE_REDUCE_LOW_USAGE_KEY]: "true",
  });
  assert.equal(loadClaudeLowUsageReductionPreference(modern), true);
  assert.equal(loadClaudeStopThresholdPreference(modern), 93);

  saveClaudePollIntervalPreference(33, modern);
  assert.equal(loadClaudePollIntervalPreference(modern), 33);
  saveClaudeStopThresholdPreference(88, modern);
  assert.equal(loadClaudePreferences(modern).fiveHour.thresholdPct, 88);
  assert.equal(loadClaudePreferences(modern).weekly.thresholdPct, 88);
  saveClaudeLowUsageReductionPreference(false, modern);
  assert.equal(loadClaudeLowUsageReductionPreference(modern), false);

  const broken = {
    getItem() {
      throw new Error("read fail");
    },
  };
  assert.equal(loadClaudePreferences(broken).enabled, false);
});

test("Codex tray state covers nested windows, fallbacks, clamping, and initial state", () => {
  assert.equal(shouldSyncTrackedCodex("codex", "a", "a"), true);
  assert.equal(shouldSyncTrackedCodex("codex", null, "a"), false);
  assert.equal(shouldSyncTrackedCodex("claude", "a", "a"), false);

  const nested = buildMonitoredCodexInfo(
    { id: "a", label: "", email: "a@example.com" },
    {
      snapshot: {
        rate_limit: {
          primary_window: { used_percent: -20 },
          weekly_window: { used_percent: 110 },
        },
      },
    },
  );
  assert.equal(nested.label, "a@example.com");
  assert.equal(nested.primaryPercent, 100);
  assert.equal(nested.secondaryPercent, 0);

  const missing = buildMonitoredCodexInfo({ id: "b", label: "", email: "" }, {});
  assert.equal(missing.label, "Codex");
  assert.equal(missing.primaryPercent, null);
  assert.equal(missing.secondaryPercent, null);

  assert.deepEqual(buildInitialMonitoredCodexInfo([{ id: "a", label: "A" }], "a"), {
    accountId: "a",
    label: "A",
    primaryPercent: null,
    primaryLabel: "5h",
    secondaryPercent: null,
    secondaryLabel: "wk",
  });
  assert.equal(buildInitialMonitoredCodexInfo([{ id: "a", label: "A" }], "missing"), null);
  assert.equal(buildInitialMonitoredCodexInfo([{ id: "a", label: "A" }], null), null);
});

test("secure-storage helpers classify sensitive keys and normalize values/errors", () => {
  assert.equal(isSensitiveStorageKey("antigravity-accounts-list"), true);
  assert.equal(isSensitiveStorageKey("antigravity-custom-accounts"), true);
  assert.equal(isSensitiveStorageKey("antigravity-theme"), false);
  assert.equal(readString("value"), "value");
  assert.equal(readString(42), undefined);
  const error = new Error("boom");
  assert.equal(toError(error), error);
  assert.match(toError("boom").message, /boom/);
});
