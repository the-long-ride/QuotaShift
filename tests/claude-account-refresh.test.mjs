import test from "node:test";
import assert from "node:assert/strict";

import { runClaudeAccountRefresh } from "../.test-build/claude/claude-account-refresh.js";

const status = (id, suspended = false) => ({
  account: { id },
  suspended,
});

test("Claude account refresh settles loading after success", async () => {
  const transitions = [];
  const requests = [];

  const result = await runClaudeAccountRefresh({
    accountId: "claude-a",
    platformVisible: true,
    statuses: [status("claude-a")],
    requestStatuses: async (...args) => {
      requests.push(args);
      return [];
    },
    onRefreshingChange: (refreshing) => transitions.push(refreshing),
  });

  assert.deepEqual(requests, [[true, 1, "claude-a"]]);
  assert.deepEqual(transitions, [true, false]);
  assert.deepEqual(result, { attempted: true, error: null });
});

test("Claude account refresh settles loading after failure", async () => {
  const transitions = [];
  const expected = new Error("network");

  const result = await runClaudeAccountRefresh({
    accountId: "claude-a",
    platformVisible: true,
    statuses: [status("claude-a")],
    requestStatuses: async () => {
      throw expected;
    },
    onRefreshingChange: (refreshing) => transitions.push(refreshing),
  });

  assert.deepEqual(transitions, [true, false]);
  assert.equal(result.attempted, true);
  assert.equal(result.error, expected);
});

test("Claude account refresh skips hidden, missing, and suspended accounts", async () => {
  let requests = 0;
  const transitions = [];
  const requestStatuses = async () => {
    requests += 1;
    return [];
  };
  const onRefreshingChange = (value) => transitions.push(value);

  assert.equal(
    (
      await runClaudeAccountRefresh({
        accountId: "claude-a",
        platformVisible: false,
        statuses: [status("claude-a")],
        requestStatuses,
        onRefreshingChange,
      })
    ).attempted,
    false,
  );
  assert.equal(
    (
      await runClaudeAccountRefresh({
        accountId: "missing",
        platformVisible: true,
        statuses: [status("claude-a")],
        requestStatuses,
        onRefreshingChange,
      })
    ).attempted,
    false,
  );
  assert.equal(
    (
      await runClaudeAccountRefresh({
        accountId: "claude-a",
        platformVisible: true,
        statuses: [status("claude-a", true)],
        requestStatuses,
        onRefreshingChange,
      })
    ).attempted,
    false,
  );

  assert.equal(requests, 0);
  assert.deepEqual(transitions, []);
});
