import test from "node:test";
import assert from "node:assert/strict";

import {
  clearCodexActivePool,
  persistCodexActiveAccount,
  persistCodexActivePool,
  restoreCodexPoolRoutingSelection,
} from "../../.test-build/codex/codex-active-storage.js";
import {
  CODEX_ACTIVE_ID_KEY,
  CODEX_ACTIVE_POOL_ID_KEY,
  CODEX_POOL_ROUTING_KEY,
} from "../../.test-build/common/app-constants.js";

const createStorage = () => {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

test("Codex active account and active routing pool are persisted independently", () => {
  const storage = createStorage();

  persistCodexActiveAccount(storage, "account-a");
  persistCodexActivePool(storage, "pool-a");
  assert.equal(storage.values.get(CODEX_ACTIVE_ID_KEY), "account-a");
  assert.equal(storage.values.get(CODEX_ACTIVE_POOL_ID_KEY), "pool-a");

  persistCodexActiveAccount(storage, "account-b");
  assert.equal(storage.values.get(CODEX_ACTIVE_ID_KEY), "account-b");
  assert.equal(storage.values.get(CODEX_ACTIVE_POOL_ID_KEY), "pool-a");
});

test("clearing the active Codex pool leaves the active account intact", () => {
  const storage = createStorage();
  persistCodexActiveAccount(storage, "account-a");
  persistCodexActivePool(storage, "pool-a");

  clearCodexActivePool(storage);

  assert.equal(storage.values.get(CODEX_ACTIVE_ID_KEY), "account-a");
  assert.equal(storage.values.has(CODEX_ACTIVE_POOL_ID_KEY), false);
});

test("routing restore requires a still-existing selected pool", () => {
  const storage = createStorage();
  storage.setItem(CODEX_ACTIVE_POOL_ID_KEY, "pool-a");
  storage.setItem(CODEX_POOL_ROUTING_KEY, "true");

  assert.deepEqual(restoreCodexPoolRoutingSelection(storage, [{ id: "pool-a" }]), {
    activePoolId: "pool-a",
    shouldRestoreRouting: true,
    disabledMissingPool: false,
  });

  storage.setItem(CODEX_ACTIVE_POOL_ID_KEY, "deleted-pool");
  storage.setItem(CODEX_POOL_ROUTING_KEY, "true");
  assert.deepEqual(restoreCodexPoolRoutingSelection(storage, [{ id: "pool-a" }]), {
    activePoolId: null,
    shouldRestoreRouting: false,
    disabledMissingPool: true,
  });
  assert.equal(storage.values.has(CODEX_ACTIVE_POOL_ID_KEY), false);
  assert.equal(storage.values.get(CODEX_POOL_ROUTING_KEY), "false");
});
