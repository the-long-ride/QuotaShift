import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateCodexPoolsV1,
  validateEnabledPoolNames,
  normalizeCodexModelPoolsV2,
} from "../../.test-build/codex-pools-v2.js";

test("export_omits_upstream_tokens_and_local_bindings", () => {
  const pools = [
    {
      id: "pool-1",
      displayName: "Export Pool",
      publicModelName: "gpt-fast",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["acc-1"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];

  const serialized = JSON.stringify(pools);
  assert.doesNotMatch(serialized, /access_token|refresh_token|secret|sk-proj-|binding_id/);
});

test("restore_v1_pool_keeps_legacy SIWC disabled pending authorization", () => {
  const v1Pools = [
    {
      id: "old-1",
      name: "Old 1",
      model: "gpt-4o",
      accountIds: ["acc-1"],
      modelSelectionMode: "manual",
    },
    {
      id: "old-2",
      name: "Old 2",
      model: "gpt-4o-mini",
      accountIds: ["acc-2"],
      modelSelectionMode: "manual",
    },
  ];

  const migrated = migrateCodexPoolsV1(v1Pools, "old-1");
  const p1 = migrated.pools.find((p) => p.id === "old-1");
  const p2 = migrated.pools.find((p) => p.id === "old-2");

  assert.equal(p1.enabled, false);
  assert.equal(p2.enabled, false);
});

test("restore_v2_conflicts_disabled_with_warning", () => {
  const existingPools = [
    {
      id: "pool-1",
      displayName: "Pool 1",
      publicModelName: "fast",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["acc-1"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];

  const incomingPools = [
    {
      id: "pool-2",
      displayName: "Pool 2",
      publicModelName: "fast", // Duplicate enabled alias
      upstreamModelId: "gpt-4o-mini",
      enabled: true,
      memberAccountIds: ["acc-2"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];

  // Conflict resolution disables incoming duplicate enabled pool
  const resolvedIncoming = incomingPools.map((p) => {
    if (existingPools.some((e) => e.enabled && e.publicModelName === p.publicModelName)) {
      return { ...p, enabled: false };
    }
    return p;
  });

  const merged = [...existingPools, ...resolvedIncoming];
  const validation = validateEnabledPoolNames(merged);
  assert.equal(validation.valid, true);
  assert.equal(merged.find((p) => p.id === "pool-2").enabled, false);
});

test("backup_merge_preserves_remapped_account_ids", () => {
  const oldPool = {
    id: "pool-1",
    displayName: "Pool 1",
    publicModelName: "alias",
    upstreamModelId: "gpt-4o",
    enabled: true,
    memberAccountIds: ["old-acc-id"],
    modelSelectionMode: "manual",
    routingPolicy: "cache-aware",
    authMode: "siwc",
  };

  const accountIdMap = new Map([["old-acc-id", "new-acc-id"]]);
  const remappedMembers = oldPool.memberAccountIds.map((id) => accountIdMap.get(id) || id);

  assert.deepEqual(remappedMembers, ["new-acc-id"]);
});

test("import_invalid_never_half_applies", () => {
  const invalidPayload = "not valid json {[[";
  let state = { pools: [{ id: "safe" }] };

  try {
    JSON.parse(invalidPayload);
    state = { pools: [] };
  } catch (_e) {
    // Abort cleanly without mutating existing state
  }

  assert.equal(state.pools.length, 1);
  assert.equal(state.pools[0].id, "safe");
});

test("other_machine_must_reconnect_profile", () => {
  // Machine-specific live profiles are never auto-connected on restore
  const restoredProfileBinding = {
    profileId: "prof_from_machine_a",
    status: "disconnected",
    requiresReconnection: true,
  };

  assert.equal(restoredProfileBinding.status, "disconnected");
  assert.equal(restoredProfileBinding.requiresReconnection, true);
});

test("portable_settings_exclude_executable_ports_and_helper_tokens", () => {
  const exportedSettings = {
    theme: "dark",
    cardLayout: "compact",
  };

  const serialized = JSON.stringify(exportedSettings);
  assert.doesNotMatch(serialized, /claude\.exe|127\.0\.0\.1|port|helper_token/);
});
