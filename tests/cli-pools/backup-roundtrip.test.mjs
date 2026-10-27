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
  buildBackupData,
  extractBackupPayload,
  restoreBackupData,
} from "../../.test-build/common/app-backup.js";
import {
  loadCliRotationPools,
  saveCliRotationPools,
  loadCodexPools,
  saveCodexPools,
} from "../../.test-build/common/app-storage.js";

test("safe backup round-trip preserves CLI pools and remaps account IDs", () => {
  mockStorage.clear();

  const agAccounts = [{ id: "ag-orig", email: "ag@test.com", token: "tok1", label: "AG 1" }];
  const cxAccounts = [{ id: "cx-orig", email: "cx@test.com", apiKey: "key1", label: "CX 1" }];
  const cliPools = [
    {
      id: "pool-cli-1",
      provider: "agy",
      name: "AG CLI Pool",
      accountIds: ["ag-orig"],
      enabled: true,
      autoSwitch: true,
      triggerWindows: ["5h", "weekly"],
      fallbackLatestEnabled: false,
      switchWhenIdleOnly: true,
    },
    {
      id: "pool-cli-2",
      provider: "codex",
      name: "Codex CLI Pool",
      accountIds: ["cx-orig"],
      enabled: true,
      autoSwitch: true,
      triggerWindows: ["5h"],
      fallbackLatestEnabled: true,
      switchWhenIdleOnly: true,
    },
  ];
  const modelPools = [
    {
      id: "model-p1",
      name: "Model Pool 1",
      model: "gpt-4o",
      accountIds: ["cx-orig"],
      modelSelectionMode: "manual",
    },
  ];

  saveCliRotationPools(cliPools);
  saveCodexPools(modelPools);

  // 1. Build backup
  const backup = buildBackupData(agAccounts, cxAccounts, "dark");
  assert.equal(backup.version, 3);
  assert.equal(backup.cliPools.length, 2);
  assert.equal(backup.antigravity.cliPools.length, 1);
  assert.equal(backup.codex.cliPools.length, 1);

  // 2. Extract payload check
  const extracted = extractBackupPayload(backup);
  assert.equal(extracted.cliPools.length, 2);

  // 3. Clear storage and simulate restoring into an environment where cx-orig has a new id
  mockStorage.clear();

  const currentCxAccounts = [
    { id: "cx-new-id", email: "cx@test.com", apiKey: "key1", label: "CX 1" },
  ];
  const currentAgAccounts = [];

  const restoreResult = restoreBackupData(backup, currentAgAccounts, currentCxAccounts, []);

  assert.equal(restoreResult.importedCliPoolsCount, 2);

  // Check stored CLI pools
  const storedCliPools = loadCliRotationPools();
  assert.equal(storedCliPools.length, 2);

  // Automation must be disabled on restore pending user opt-in
  assert.equal(storedCliPools[0].autoSwitch, false);
  assert.equal(storedCliPools[1].autoSwitch, false);

  // Codex account ID cx-orig remapped to cx-new-id because email matched
  assert.deepEqual(storedCliPools[1].accountIds, ["cx-new-id"]);

  // Model pools byte-for-byte unchanged behavior
  const restoredModelPools = loadCodexPools();
  assert.equal(restoredModelPools.length, 1);
  assert.deepEqual(restoredModelPools[0].accountIds, ["cx-new-id"]);
});

test("unresolved account IDs become disabled members on restore", () => {
  mockStorage.clear();

  const backup = {
    version: 3,
    antigravity: { accounts: [] },
    codex: { accounts: [], pools: [] },
    cliPools: [
      {
        id: "pool-ghost",
        provider: "agy",
        name: "Ghost Pool",
        accountIds: ["unknown-account-id"],
        enabled: true,
        autoSwitch: true,
        triggerWindows: ["5h"],
        fallbackLatestEnabled: false,
        switchWhenIdleOnly: true,
      },
    ],
  };

  restoreBackupData(backup, [], [], []);

  const stored = loadCliRotationPools();
  assert.equal(stored.length, 1);
  // Unresolved IDs disable the pool on restore
  assert.equal(stored[0].enabled, false);
  assert.equal(stored[0].autoSwitch, false);
});

test("legacy imports preserve current CLI pools", () => {
  mockStorage.clear();
  const existing = [
    {
      id: "local",
      provider: "agy",
      name: "Local",
      accountIds: [],
      enabled: false,
      autoSwitch: false,
      triggerWindows: ["5h"],
      fallbackLatestEnabled: false,
      switchWhenIdleOnly: true,
    },
  ];
  saveCliRotationPools(existing);
  restoreBackupData({ version: 2 }, [], [], []);
  assert.deepEqual(loadCliRotationPools(), existing);
});

test("restore remaps Antigravity members and rejects cross-provider IDs", () => {
  mockStorage.clear();
  const pool = {
    id: "ag",
    provider: "agy",
    name: "AG",
    accountIds: ["old-ag"],
    enabled: true,
    autoSwitch: true,
    triggerWindows: ["5h"],
    fallbackLatestEnabled: false,
    switchWhenIdleOnly: true,
  };
  const backup = {
    antigravity: { accounts: [{ id: "old-ag", email: "ag@test.com", token: "fake" }] },
    cliPools: [pool, { ...pool, id: "wrong", accountIds: ["cx"] }],
  };
  restoreBackupData(
    backup,
    [{ id: "new-ag", email: "ag@test.com", token: "fake" }],
    [{ id: "cx", email: "cx@test.com", apiKey: "fake" }],
    [],
  );
  const stored = loadCliRotationPools();
  assert.deepEqual(stored[0].accountIds, ["new-ag"]);
  assert.equal(stored[0].enabled, true);
  assert.equal(stored[1].enabled, false);
});

test("restored preferences retain exact prompt but disable automation and startup restart", async () => {
  mockStorage.clear();
  const { CLI_ROTATION_PREFERENCES_KEY, loadCliRotationPreferences } =
    await import("../../.test-build/cli-pools/preferences.js");
  const prompt = "  continue 🚀\n";
  restoreBackupData(
    {
      settings: {
        [CLI_ROTATION_PREFERENCES_KEY]: JSON.stringify({
          enabled: true,
          autoRestartAfterAppStart: true,
          continuationPrompt: prompt,
        }),
      },
    },
    [],
    [],
    [],
  );
  const prefs = loadCliRotationPreferences();
  assert.equal(prefs.enabled, false);
  assert.equal(prefs.autoRestartAfterAppStart, false);
  assert.equal(prefs.continuationPrompt, prompt);
});
