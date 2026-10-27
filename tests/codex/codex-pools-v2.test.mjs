import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCodexModelPoolsV2,
  validateEnabledPoolNames,
  migrateCodexPoolsV1,
  applyPoolMutation,
  getDefaultModelLimits,
  effortForThinkingBudget,
  defaultBudgetForEffort,
} from "../../.test-build/codex-pools-v2.js";
import { loadCodexModelPoolsV2, saveCodexModelPoolsV2 } from "../../.test-build/app-storage.js";
import {
  CODEX_POOLS_KEY,
  CODEX_MODEL_POOLS_V2_KEY,
  CODEX_ACTIVE_POOL_ID_KEY,
} from "../../.test-build/app-constants.js";

const knownAccounts = [
  { id: "acc-oauth-1", authMode: "siwc" },
  { id: "acc-oauth-2", authMode: "siwc" },
  { id: "acc-api-1", authMode: "openai-api-key" },
];

test("MP-01: v1_only_previous_active_enabled - only previous active pool migrates enabled if valid and unique", () => {
  const v1Pools = [
    {
      id: "pool-1",
      name: "Pool 1",
      model: "gpt-4o",
      accountIds: ["acc-oauth-1"],
      modelSelectionMode: "manual",
    },
    {
      id: "pool-2",
      name: "Pool 2",
      model: "o1-mini",
      accountIds: ["acc-oauth-2"],
      modelSelectionMode: "manual",
    },
  ];
  const result = migrateCodexPoolsV1(v1Pools, "pool-1", knownAccounts);
  assert.equal(result.pools.length, 2);
  const p1 = result.pools.find((p) => p.id === "pool-1");
  const p2 = result.pools.find((p) => p.id === "pool-2");
  assert.equal(p1?.enabled, false);
  assert.equal(p1?.publicModelName, "gpt-4o");
  assert.equal(p1?.upstreamModelId, "gpt-4o");
  assert.equal(p1?.authMode, "siwc");
  assert.equal(p2?.enabled, false);
});

test("MP-01: v1_missing_active_none_enabled - if active pool ID is missing or not found, all pools migrate disabled", () => {
  const v1Pools = [
    {
      id: "pool-1",
      name: "Pool 1",
      model: "gpt-4o",
      accountIds: ["acc-oauth-1"],
      modelSelectionMode: "manual",
    },
  ];
  const resultMissing = migrateCodexPoolsV1(v1Pools, null, knownAccounts);
  assert.equal(resultMissing.pools[0].enabled, false);

  const resultUnknown = migrateCodexPoolsV1(v1Pools, "non-existent-pool", knownAccounts);
  assert.equal(resultUnknown.pools[0].enabled, false);
});

test("MP-01: case_fold_duplicate_enabled_alias_rejected - ASCII case-folded alias conflicts among enabled pools are rejected", () => {
  const pools = [
    {
      id: "pool-1",
      displayName: "Pool 1",
      publicModelName: "gpt-4o",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["reg_11111111"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
    {
      id: "pool-2",
      displayName: "Pool 2",
      publicModelName: "GPT-4O",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["reg_22222222"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];
  const validation = validateEnabledPoolNames(pools, knownAccounts);
  assert.equal(validation.valid, false);
  assert.ok(validation.error?.toLowerCase().includes("duplicate"));
});

test("MP-01: disabled_duplicate_alias_allowed - duplicate aliases are permitted across disabled pools", () => {
  const pools = [
    {
      id: "pool-1",
      displayName: "Pool 1",
      publicModelName: "gpt-4o",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["reg_11111111"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
    {
      id: "pool-2",
      displayName: "Pool 2 Draft",
      publicModelName: "gpt-4o",
      upstreamModelId: "gpt-4o",
      enabled: false,
      memberAccountIds: ["reg_22222222"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];
  const validation = validateEnabledPoolNames(pools, knownAccounts);
  assert.equal(validation.valid, true);
});

test("MP-01: enable_conflict_fails_atomically - enabling a pool with conflicting alias fails atomically without partial update", () => {
  const currentRegistry = {
    revision: 1,
    pools: [
      {
        id: "pool-1",
        displayName: "Pool 1",
        publicModelName: "gpt-4o",
        upstreamModelId: "gpt-4o",
        enabled: true,
        memberAccountIds: ["reg_11111111"],
        modelSelectionMode: "manual",
        routingPolicy: "cache-aware",
        authMode: "siwc",
      },
      {
        id: "pool-2",
        displayName: "Pool 2",
        publicModelName: "GPT-4O",
        upstreamModelId: "gpt-4o",
        enabled: false,
        memberAccountIds: ["reg_22222222"],
        modelSelectionMode: "manual",
        routingPolicy: "cache-aware",
        authMode: "siwc",
      },
    ],
  };

  const mutation = {
    kind: "setEnabled",
    expectedRevision: 1,
    poolId: "pool-2",
    enabled: true,
  };

  const result = applyPoolMutation(currentRegistry, mutation, knownAccounts);
  assert.equal(result.success, false);
  assert.equal(currentRegistry.pools[1].enabled, false);
});

test("MP-01: shared_upstream_different_alias_valid - multiple enabled pools may share upstreamModelId if publicModelNames differ", () => {
  const pools = [
    {
      id: "pool-1",
      displayName: "Pool 1",
      publicModelName: "fast-4o",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["reg_11111111"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
    {
      id: "pool-2",
      displayName: "Pool 2",
      publicModelName: "deep-4o",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["reg_22222222"],
      modelSelectionMode: "manual",
      routingPolicy: "balanced",
      authMode: "siwc",
    },
  ];
  const validation = validateEnabledPoolNames(pools, knownAccounts);
  assert.equal(validation.valid, true);
});

test("MP-01: duplicate_member_ids_removed_in_order - member account IDs are deduplicated preserving first-occurrence order", () => {
  const rawPool = {
    id: "pool-1",
    displayName: "Pool 1",
    publicModelName: "gpt-4o",
    upstreamModelId: "gpt-4o",
    enabled: true,
    memberAccountIds: ["acc-oauth-1", "acc-oauth-2", "acc-oauth-1", "acc-oauth-2"],
    modelSelectionMode: "manual",
    routingPolicy: "cache-aware",
    authMode: "siwc",
  };
  const normalized = normalizeCodexModelPoolsV2([rawPool]);
  assert.deepEqual(normalized[0].memberAccountIds, ["acc-oauth-1", "acc-oauth-2"]);
});

test("MP-01: unknown_member_rejected_on_enable - pool referencing unknown account cannot be enabled", () => {
  const pools = [
    {
      id: "pool-1",
      displayName: "Pool 1",
      publicModelName: "gpt-4o",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["acc-unknown-999"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];
  const validation = validateEnabledPoolNames(pools, knownAccounts);
  assert.equal(validation.valid, false);
  assert.ok(validation.error?.includes("unknown account"));
});

test("MP-01: invalid_import_does_not_modify_live_v2 - importing malformed or conflicting pools fails atomically", () => {
  const liveRegistry = {
    revision: 5,
    pools: [
      {
        id: "pool-live",
        displayName: "Live Pool",
        publicModelName: "gpt-4o",
        upstreamModelId: "gpt-4o",
        enabled: true,
        memberAccountIds: ["acc-oauth-1"],
        modelSelectionMode: "manual",
        routingPolicy: "cache-aware",
        authMode: "siwc",
      },
    ],
  };

  const invalidMutation = {
    kind: "replace",
    expectedRevision: 5,
    pools: [
      {
        id: "p1",
        displayName: "Invalid Alias",
        publicModelName: "inv@lid alias name!",
        upstreamModelId: "gpt-4o",
        enabled: true,
        memberAccountIds: ["acc-oauth-1"],
        modelSelectionMode: "manual",
        routingPolicy: "cache-aware",
        authMode: "siwc",
      },
    ],
  };

  const result = applyPoolMutation(liveRegistry, invalidMutation, knownAccounts);
  assert.equal(result.success, false);
  assert.equal(liveRegistry.revision, 5);
  assert.equal(liveRegistry.pools[0].id, "pool-live");
});

test("MP-01: ambiguous_old_auth_mode_migrates_disabled - mixed auth accounts in v1 pool force pool to migrate disabled", () => {
  const v1Pools = [
    {
      id: "pool-mixed",
      name: "Mixed Pool",
      model: "gpt-4o",
      accountIds: ["acc-oauth-1", "acc-api-1"],
      modelSelectionMode: "manual",
    },
  ];
  const result = migrateCodexPoolsV1(v1Pools, "pool-mixed", knownAccounts);
  const migrated = result.pools[0];
  assert.equal(migrated.enabled, false);
  assert.ok(result.diagnostics.length > 0);
  assert.ok(result.diagnostics[0].includes("ambiguous"));
});

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

test("MP-01: storage_migration_migrates_v1_and_persists_v2", () => {
  const mockStorage = createMockStorage({
    [CODEX_POOLS_KEY]: JSON.stringify([
      {
        id: "p1",
        name: "Pool 1",
        model: "gpt-4o",
        accountIds: ["acc-oauth-1"],
      },
      {
        id: "p2",
        name: "Pool 2",
        model: "o1-mini",
        accountIds: ["acc-oauth-2"],
      },
    ]),
    [CODEX_ACTIVE_POOL_ID_KEY]: "p1",
  });

  const pools = loadCodexModelPoolsV2(mockStorage, knownAccounts);
  assert.equal(pools.length, 2);
  assert.equal(pools[0].enabled, false);
  assert.equal(pools[1].enabled, false);

  // Assert v2 was durably saved
  const savedV2 = JSON.parse(mockStorage.getItem(CODEX_MODEL_POOLS_V2_KEY));
  assert.equal(savedV2.length, 2);
  assert.equal(savedV2[0].id, "p1");

  // Assert v1 was NOT destroyed for disaster recovery
  assert.ok(mockStorage.getItem(CODEX_POOLS_KEY));
});

test("MP-01: storage_migration_reads_existing_v2_without_re_migrating", () => {
  const mockStorage = createMockStorage({
    [CODEX_POOLS_KEY]: JSON.stringify([
      {
        id: "p-old",
        name: "Old V1 Pool",
        model: "gpt-3.5-turbo",
        accountIds: ["acc-oauth-1"],
      },
    ]),
    [CODEX_MODEL_POOLS_V2_KEY]: JSON.stringify([
      {
        id: "p-v2",
        displayName: "Existing V2 Pool",
        publicModelName: "gpt-4o",
        upstreamModelId: "gpt-4o",
        enabled: true,
        memberAccountIds: ["acc-oauth-1"],
        modelSelectionMode: "manual",
        routingPolicy: "cache-aware",
        authMode: "siwc",
      },
    ]),
  });

  const pools = loadCodexModelPoolsV2(mockStorage, knownAccounts);
  assert.equal(pools.length, 1);
  assert.equal(pools[0].id, "p-v2");
  assert.equal(pools[0].displayName, "Existing V2 Pool");
});

test("MP-01: storage_migration_handles_corrupt_v1_gracefully", () => {
  const mockStorage = createMockStorage({
    [CODEX_POOLS_KEY]: "{ invalid json corrupted ...",
  });

  const pools = loadCodexModelPoolsV2(mockStorage, knownAccounts);
  assert.deepEqual(pools, []);
});

test("SIWC legacy Codex OAuth pools migrate as disabled drafts requiring new consent", () => {
  const legacy = [
    {
      id: "former-active",
      name: "Former Active",
      model: "gpt-test",
      accountIds: ["acc-oauth-1"],
      modelSelectionMode: "manual",
    },
  ];
  const result = migrateCodexPoolsV1(legacy, "former-active", knownAccounts);
  assert.equal(result.pools[0].enabled, false);
  assert.deepEqual(result.pools[0].memberAccountIds, ["acc-oauth-1"]);
  assert.equal(result.pools[0].authMode, "siwc");
  assert.match(result.diagnostics.join(" "), /authorization/i);
});

test("unknown legacy pool credentials cannot auto-enable a SIWC pool", () => {
  const legacy = [
    {
      id: "former-active",
      name: "Former Active",
      model: "gpt-test",
      accountIds: ["unknown-legacy"],
      modelSelectionMode: "manual",
    },
  ];
  const result = migrateCodexPoolsV1(legacy, "former-active");
  assert.equal(result.pools[0].enabled, false);
  assert.match(result.diagnostics.join(" "), /authorization/i);
});

test("Native SIWC pool members are distinct from legacy Codex accounts", () => {
  const siwcPool = {
    id: "siwc-native-1",
    displayName: "ChatGPT",
    publicModelName: "chatgpt-native",
    upstreamModelId: "gpt-test",
    enabled: true,
    memberAccountIds: ["reg_0123456789abcdef"],
    modelSelectionMode: "discovered",
    routingPolicy: "cache-aware",
    authMode: "siwc",
  };
  assert.equal(validateEnabledPoolNames([siwcPool], knownAccounts).valid, true);
  assert.equal(
    validateEnabledPoolNames([{ ...siwcPool, memberAccountIds: ["acc-oauth-1"] }], knownAccounts)
      .valid,
    false,
    "Legacy Codex account IDs must not pass native SIWC member validation",
  );
  assert.equal(
    validateEnabledPoolNames(
      [{ ...siwcPool, memberAccountIds: ["not-a-registration"] }],
      knownAccounts,
    ).valid,
    false,
  );
});

test("Model Pool V2 context window and OpenAI thinking effort defaults and custom overrides", () => {
  assert.deepEqual(getDefaultModelLimits("gpt-6.1-sol"), {
    maxContextWindowTokens: 400_000,
    thinkingBudgetTokens: 8_192,
    reasoningEffort: "medium",
  });
  assert.equal(getDefaultModelLimits("o3-mini").maxContextWindowTokens, 200_000);
  assert.equal(getDefaultModelLimits("gpt-4.1").maxContextWindowTokens, 1_000_000);
  assert.equal(getDefaultModelLimits("gpt-4o").maxContextWindowTokens, 128_000);

  assert.equal(effortForThinkingBudget(512), "minimal");
  assert.equal(effortForThinkingBudget(2048), "low");
  assert.equal(effortForThinkingBudget(8192), "medium");
  assert.equal(effortForThinkingBudget(16384), "high");
  assert.equal(effortForThinkingBudget(32768), "xhigh");
  assert.equal(defaultBudgetForEffort("medium"), 8_192);
  assert.equal(defaultBudgetForEffort("high"), 16_384);

  const normalized = normalizeCodexModelPoolsV2([
    {
      id: "p-default",
      displayName: "Sol",
      publicModelName: "gpt-6.1-sol",
      upstreamModelId: "gpt-6.1-sol",
      enabled: false,
      memberAccountIds: [],
    },
    {
      id: "p-custom",
      displayName: "Custom",
      publicModelName: "gpt-6-custom",
      upstreamModelId: "gpt-6",
      enabled: false,
      memberAccountIds: [],
      maxContextWindowTokens: 256_000,
      thinkingBudgetTokens: 24_000,
    },
  ]);

  assert.equal(normalized[0].maxContextWindowTokens, 400_000);
  assert.equal(normalized[0].thinkingBudgetTokens, 8_192);
  assert.equal(normalized[0].reasoningEffort, "medium");

  assert.equal(normalized[1].maxContextWindowTokens, 256_000);
  assert.equal(normalized[1].thinkingBudgetTokens, 24_000);
  assert.equal(normalized[1].reasoningEffort, "high");
});
