import test from "node:test";
import assert from "node:assert/strict";
import { loadCodexUsageCache, saveCodexUsageEntry } from "../../.test-build/common/app-storage.js";
import { CODEX_USAGE_CACHE_STORAGE_KEY } from "../../.test-build/common/app-constants.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    values,
  };
}

test("Codex usage cache persistence stores successful snapshots without transient state", () => {
  const storage = createStorage();
  saveCodexUsageEntry(
    "account-a",
    {
      fetchedAt: 123,
      isOAuth: true,
      planName: "ChatGPT Plus",
      rate_limit: { primary_window: { used_percent: 10 } },
      loading: true,
      error: "temporary",
    },
    storage,
  );

  const raw = JSON.parse(storage.values.get(CODEX_USAGE_CACHE_STORAGE_KEY));
  assert.equal(raw["account-a"].fetchedAt, 123);
  assert.equal(raw["account-a"].loading, false);
  assert.equal("error" in raw["account-a"], false);

  assert.deepEqual(loadCodexUsageCache(storage), {
    "account-a": {
      fetchedAt: 123,
      isOAuth: true,
      planName: "ChatGPT Plus",
      rate_limit: { primary_window: { used_percent: 10 } },
      loading: false,
      error: undefined,
    },
  });
});

test("invalid persisted usage entries are ignored", () => {
  const storage = createStorage();
  storage.setItem(
    CODEX_USAGE_CACHE_STORAGE_KEY,
    JSON.stringify({
      valid: { fetchedAt: 456, isOAuth: false, snapshot: { hardLimit: 100 } },
      missingTime: { isOAuth: true },
      invalidTime: { fetchedAt: "bad", isOAuth: true },
    }),
  );

  assert.deepEqual(loadCodexUsageCache(storage), {
    valid: {
      fetchedAt: 456,
      isOAuth: false,
      snapshot: { hardLimit: 100 },
      loading: false,
      error: undefined,
    },
  });
});
