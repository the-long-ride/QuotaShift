import test from "node:test";
import assert from "node:assert/strict";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

globalThis.localStorage = createStorage();

const {
  ACCOUNT_POLL_SUSPENDED_ERROR,
  isAccountPollingSuspended,
  resumeAccountPolling,
  suspendAccountPolling,
} = await import("../../.test-build/account/account-poll-suspension.js");

test("auth polling suspension persists by provider and account id", () => {
  suspendAccountPolling("codex", "cx-1");
  suspendAccountPolling("antigravity", "ag-1");

  assert.equal(isAccountPollingSuspended("codex", "cx-1"), true);
  assert.equal(isAccountPollingSuspended("antigravity", "ag-1"), true);
  assert.equal(isAccountPollingSuspended("codex", "ag-1"), false);
});

test("re-authentication resumes only the matching account", () => {
  suspendAccountPolling("codex", "cx-1");
  suspendAccountPolling("codex", "cx-2");
  resumeAccountPolling("codex", "cx-1");

  assert.equal(isAccountPollingSuspended("codex", "cx-1"), false);
  assert.equal(isAccountPollingSuspended("codex", "cx-2"), true);
});

test("suspended accounts expose a re-authentication error message", () => {
  assert.match(ACCOUNT_POLL_SUSPENDED_ERROR, /Re-authentication required/i);
  assert.match(ACCOUNT_POLL_SUSPENDED_ERROR, /polling is paused/i);
});
