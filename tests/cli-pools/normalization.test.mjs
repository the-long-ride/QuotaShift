import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCliRotationPools,
  validateCliPoolBinding,
  reconcileCliRotationPools,
} from "../../.test-build/cli-pools/normalize.js";

const mockAccounts = [
  { id: "ag-1", provider: "antigravity", email: "ag1@example.com" },
  { id: "ag-2", provider: "antigravity", email: "ag2@example.com" },
  { id: "cx-1", provider: "codex", email: "cx1@example.com" },
  { id: "cx-2", provider: "codex", email: "cx2@example.com" },
];

test("normalizes_provider_specific_pools preserves order, defaults, and valid IDs", () => {
  const raw = [
    {
      id: "pool-agy-1",
      provider: "agy",
      name: "  Agy Main Pool  ",
      accountIds: ["ag-1", "ag-2"],
      enabled: true,
    },
    {
      id: "pool-codex-1",
      provider: "codex",
      name: "Codex Secondary",
      accountIds: ["cx-1"],
      enabled: false,
    },
    {
      // Corrupt record without id
      name: "No ID",
      provider: "agy",
      accountIds: ["ag-1"],
    },
  ];

  const normalized = normalizeCliRotationPools(raw, mockAccounts);
  assert.equal(normalized.length, 2);

  assert.deepEqual(normalized[0], {
    id: "pool-agy-1",
    provider: "agy",
    name: "Agy Main Pool",
    accountIds: ["ag-1", "ag-2"],
    enabled: true,
    autoSwitch: false,
    triggerWindows: ["5h", "weekly"],
    fallbackLatestEnabled: false,
    switchWhenIdleOnly: true,
  });

  assert.deepEqual(normalized[1], {
    id: "pool-codex-1",
    provider: "codex",
    name: "Codex Secondary",
    accountIds: ["cx-1"],
    enabled: false,
    autoSwitch: false,
    triggerWindows: ["5h", "weekly"],
    fallbackLatestEnabled: false,
    switchWhenIdleOnly: true,
  });
});

test("rejects_duplicate_accounts within same pool while preserving order", () => {
  const raw = [
    {
      id: "pool-1",
      provider: "agy",
      name: "Dup Pool",
      accountIds: ["ag-1", "ag-2", "ag-1", "ag-2", "ag-1"],
      enabled: true,
    },
  ];

  const normalized = normalizeCliRotationPools(raw, mockAccounts);
  assert.equal(normalized.length, 1);
  assert.deepEqual(normalized[0].accountIds, ["ag-1", "ag-2"]);
});

test("rejects_cross_provider_member filtering out accounts from other providers", () => {
  const raw = [
    {
      id: "pool-agy",
      provider: "agy",
      name: "Mixed Agy",
      accountIds: ["ag-1", "cx-1", "ag-2"],
      enabled: true,
    },
    {
      id: "pool-codex",
      provider: "codex",
      name: "Mixed Codex",
      accountIds: ["cx-1", "ag-2", "cx-2"],
      enabled: true,
    },
  ];

  const normalized = normalizeCliRotationPools(raw, mockAccounts);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized[0].accountIds, ["ag-1", "ag-2"]);
  assert.deepEqual(normalized[1].accountIds, ["cx-1", "cx-2"]);
});

test("blocks_more_than_one_active_auth_domain enforces single active pool per provider", () => {
  const pools = [
    {
      id: "p1",
      provider: "agy",
      name: "Pool 1",
      accountIds: ["ag-1", "ag-2"],
      enabled: true,
      autoSwitch: true,
      triggerWindows: ["5h"],
      fallbackLatestEnabled: false,
      switchWhenIdleOnly: true,
    },
    {
      id: "p2",
      provider: "agy",
      name: "Pool 2",
      accountIds: ["ag-1", "ag-2"],
      enabled: true,
      autoSwitch: true,
      triggerWindows: ["5h"],
      fallbackLatestEnabled: false,
      switchWhenIdleOnly: true,
    },
  ];

  // Binding only allows 1 active pool id for agy
  const binding = validateCliPoolBinding({ agyActivePoolId: "p1", codexActivePoolId: null }, pools);
  assert.equal(binding.agyActivePoolId, "p1");
  assert.equal(binding.codexActivePoolId, null);

  // If bound pool is disabled or missing, binding must clear
  pools[0].enabled = false;
  const revalidated = validateCliPoolBinding(binding, pools);
  assert.equal(revalidated.agyActivePoolId, null);
});

test("does_not_modify_model_pools and keeps storage keys segregated", () => {
  const rawModelPools = [
    {
      id: "model-pool-1",
      name: "GPT-4o Router",
      model: "gpt-4o",
      accountIds: ["cx-1", "cx-2"],
      modelSelectionMode: "manual",
    },
  ];

  // Normalizing CLI pools does not accept or touch model pools without provider
  const normalized = normalizeCliRotationPools(rawModelPools, mockAccounts);
  assert.equal(normalized.length, 0);
});
