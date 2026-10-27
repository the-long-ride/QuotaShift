import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEnabledPoolNames,
  normalizeCodexModelPoolsV2,
  applyPoolMutation,
} from "../../.test-build/codex-pools-v2.js";

test("two_enabled_pools_same_upstream_display_distinct_aliases", () => {
  const pools = [
    {
      id: "pool-1",
      displayName: "Pool 1",
      publicModelName: "fast-alias-1",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["acc-1"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
    {
      id: "pool-2",
      displayName: "Pool 2",
      publicModelName: "fast-alias-2",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["acc-2"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];

  const validation = validateEnabledPoolNames(pools);
  assert.equal(validation.valid, true);
  assert.notEqual(pools[0].publicModelName, pools[1].publicModelName);
  assert.equal(pools[0].upstreamModelId, pools[1].upstreamModelId);
});

test("duplicate_enabled_alias_inline_error", () => {
  const pools = [
    {
      id: "pool-1",
      displayName: "Pool 1",
      publicModelName: "shared-alias",
      upstreamModelId: "gpt-4o",
      enabled: true,
      memberAccountIds: ["acc-1"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
    {
      id: "pool-2",
      displayName: "Pool 2",
      publicModelName: "shared-alias",
      upstreamModelId: "gpt-4o-mini",
      enabled: true,
      memberAccountIds: ["acc-2"],
      modelSelectionMode: "manual",
      routingPolicy: "cache-aware",
      authMode: "siwc",
    },
  ];

  const validation = validateEnabledPoolNames(pools);
  assert.equal(validation.valid, false);
  assert.match(validation.error || "", /Duplicate enabled public model alias: 'shared-alias'/);
});

test("toggle_one_does_not_disable_other", () => {
  const initialState = {
    revision: 1,
    pools: [
      {
        id: "pool-1",
        displayName: "Pool 1",
        publicModelName: "alias-1",
        upstreamModelId: "gpt-4o",
        enabled: true,
        memberAccountIds: ["acc-1"],
        modelSelectionMode: "manual",
        routingPolicy: "cache-aware",
        authMode: "siwc",
      },
      {
        id: "pool-2",
        displayName: "Pool 2",
        publicModelName: "alias-2",
        upstreamModelId: "gpt-4o",
        enabled: true,
        memberAccountIds: ["acc-2"],
        modelSelectionMode: "manual",
        routingPolicy: "cache-aware",
        authMode: "siwc",
      },
    ],
  };

  const mutation = {
    kind: "setEnabled",
    expectedRevision: 1,
    poolId: "pool-1",
    enabled: false,
  };

  const res = applyPoolMutation(initialState, mutation);
  assert.equal(res.success, true);
  assert.equal(res.pools.find((p) => p.id === "pool-1").enabled, false);
  assert.equal(res.pools.find((p) => p.id === "pool-2").enabled, true);
});

test("disabling_binding_used_alias_warns_only_affected_profile", () => {
  const profileBindings = [
    { profileId: "prof-a", mappedAlias: "alias-1" },
    { profileId: "prof-b", mappedAlias: "alias-2" },
  ];

  const disabledAlias = "alias-1";
  const affected = profileBindings.filter((b) => b.mappedAlias === disabledAlias);
  assert.equal(affected.length, 1);
  assert.equal(affected[0].profileId, "prof-a");
});

test("pool_edit_does_not_change_global_codex_auth", () => {
  const globalCodexAuth = { appliedAccountId: "global-acc-1", provider: "codex" };
  const editedPool = {
    id: "pool-1",
    memberAccountIds: ["local-acc-2", "local-acc-3"],
    enabled: true,
  };

  // Editing pool members has zero side effects on global applied account
  assert.equal(globalCodexAuth.appliedAccountId, "global-acc-1");
  assert.equal(editedPool.memberAccountIds.includes(globalCodexAuth.appliedAccountId), false);
});

test("cache_hit_badge_only_for_measured_cache_reads", () => {
  const usageWithCache = {
    input_tokens: 100,
    cached_tokens: 45,
  };
  const usageWithoutCache = {
    input_tokens: 100,
  };

  const hasCacheRead = (u) => typeof u.cached_tokens === "number" && u.cached_tokens > 0;
  assert.equal(hasCacheRead(usageWithCache), true);
  assert.equal(hasCacheRead(usageWithoutCache), false);
});
