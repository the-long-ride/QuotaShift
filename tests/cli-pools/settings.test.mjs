import test from "node:test";
import assert from "node:assert/strict";

const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) ?? null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

import {
  loadCliRotationPreferences,
  saveCliRotationPreferences,
  validateContinuationPrompt,
  snapshotContinuationPrompt,
  resetCliRotationPreferences,
  resetContinuationPrompt,
  CLI_ROTATION_PREFERENCES_KEY,
} from "../../.test-build/cli-pools/preferences.js";

import { BACKUP_SETTING_KEYS } from "../../.test-build/common/settings-backup.js";

test("defaults: returns default prompt and disabled state when empty", () => {
  mockStorage.clear();
  const prefs = loadCliRotationPreferences();
  assert.equal(prefs.enabled, false);
  assert.equal(prefs.continuationPrompt, "continue remaining works");
  assert.equal(prefs.requiredFreshSamples, 2);
  assert.equal(prefs.minSampleSeparationSecs, 5);
  assert.equal(prefs.gracefulWaitSecs, 15);
  assert.equal(prefs.autoRestartAfterAppStart, false);
});

test("validation: validates continuation prompt constraints", () => {
  // Empty
  assert.equal(validateContinuationPrompt("").valid, false);
  assert.equal(validateContinuationPrompt("   ").valid, false);

  // Normal valid
  assert.equal(validateContinuationPrompt("continue remaining works").valid, true);

  // Unicode, quotes, newlines
  const complex =
    "continue remaining works\nwith 'quotes' and \"double quotes\" and emoji 🚀 and tiếng Việt";
  assert.equal(validateContinuationPrompt(complex).valid, true);

  // Contains NUL
  assert.equal(validateContinuationPrompt("hello\0world").valid, false);

  // Oversized > 2000 chars
  const oversized = "a".repeat(2001);
  assert.equal(validateContinuationPrompt(oversized).valid, false);
  assert.equal(validateContinuationPrompt("a".repeat(2000)).valid, true);

  // Non-string
  assert.equal(validateContinuationPrompt(null).valid, false);
  assert.equal(validateContinuationPrompt(undefined).valid, false);
  assert.equal(validateContinuationPrompt(12345).valid, false);
});

test("save and reset: persists preferences and allows resetting to defaults", () => {
  mockStorage.clear();
  const updated = {
    enabled: true,
    continuationPrompt: "resume task immediately",
    requiredFreshSamples: 3,
    minSampleSeparationSecs: 10,
    gracefulWaitSecs: 20,
    autoRestartAfterAppStart: false,
  };
  saveCliRotationPreferences(updated);

  const loaded = loadCliRotationPreferences();
  assert.equal(loaded.enabled, true);
  assert.equal(loaded.continuationPrompt, "resume task immediately");
  assert.equal(loaded.requiredFreshSamples, 3);

  // Reset
  const reset = resetCliRotationPreferences();
  assert.equal(reset.continuationPrompt, "continue remaining works");
  assert.equal(reset.enabled, false);
});

test("per-operation prompt snapshot immutability", () => {
  mockStorage.clear();
  saveCliRotationPreferences({
    enabled: true,
    continuationPrompt: "prompt-v1",
    requiredFreshSamples: 2,
    minSampleSeparationSecs: 5,
    gracefulWaitSecs: 15,
    autoRestartAfterAppStart: false,
  });

  const snapshot = snapshotContinuationPrompt();
  assert.equal(snapshot.prompt, "prompt-v1");
  assert.ok(typeof snapshot.hash === "string" && snapshot.hash.length > 0);
  assert.ok(typeof snapshot.snapshotAt === "number");

  // Mutating preferences storage afterward does not alter previous snapshot
  saveCliRotationPreferences({
    enabled: true,
    continuationPrompt: "prompt-v2-changed",
    requiredFreshSamples: 2,
    minSampleSeparationSecs: 5,
    gracefulWaitSecs: 15,
    autoRestartAfterAppStart: false,
  });

  assert.equal(snapshot.prompt, "prompt-v1");
});

test("backup allowlist: CLI_ROTATION_PREFERENCES_KEY is in BACKUP_SETTING_KEYS", () => {
  assert.ok(
    BACKUP_SETTING_KEYS.includes(CLI_ROTATION_PREFERENCES_KEY),
    "CLI_ROTATION_PREFERENCES_KEY must be in BACKUP_SETTING_KEYS",
  );
});

test("partial preference save reads from the same injected storage", () => {
  mockStorage.clear();
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  saveCliRotationPreferences({ enabled: true, continuationPrompt: "  custom 🚀\n" }, storage);
  saveCliRotationPreferences({ gracefulWaitSecs: 30 }, storage);
  const saved = loadCliRotationPreferences(storage);
  assert.equal(saved.enabled, true);
  assert.equal(saved.continuationPrompt, "  custom 🚀\n");
  assert.equal(saved.gracefulWaitSecs, 30);
  assert.equal(mockStorage.size, 0);
});

test("resetting only the prompt preserves all rotation settings", () => {
  mockStorage.clear();
  const original = saveCliRotationPreferences({
    enabled: true,
    gracefulWaitSecs: 25,
    continuationPrompt: "custom",
  });
  const reset = resetContinuationPrompt();
  assert.deepEqual(reset, { ...original, continuationPrompt: "continue remaining works" });
});

test("loadCliRotationPreferences handles corrupt or throwing storage", () => {
  const corruptStorage = {
    getItem: () => "invalid json {",
  };
  const defaults = loadCliRotationPreferences(corruptStorage);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.continuationPrompt, "continue remaining works");

  const nonObjectStorage = {
    getItem: () => "123",
  };
  assert.equal(loadCliRotationPreferences(nonObjectStorage).enabled, false);

  const throwingStorage = {
    getItem: () => {
      throw new Error("storage failed");
    },
  };
  assert.equal(loadCliRotationPreferences(throwingStorage).enabled, false);

  // Fallback when localStorage is undefined
  const origLocal = globalThis.localStorage;
  delete globalThis.localStorage;
  const noStoragePrefs = loadCliRotationPreferences();
  assert.equal(noStoragePrefs.enabled, false);
  assert.equal(typeof noStoragePrefs.continuationPrompt, "string");
  saveCliRotationPreferences({ enabled: true });
  resetCliRotationPreferences();
  globalThis.localStorage = origLocal;
});
