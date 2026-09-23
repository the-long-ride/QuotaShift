import test from "node:test";
import assert from "node:assert/strict";

import {
  importCapturedAntigravityAccounts,
  uniqueCapturedAntigravityAccounts,
} from "../../.test-build/antigravity/capture-import.js";
import { createCapturedAntigravityAccountHandler } from "../../.test-build/antigravity/capture-account-ops.js";
import { obfuscate } from "../../.test-build/auth/auth.js";

function account(email, token, refreshToken) {
  return {
    id: "local-antigravity-session",
    label: email || "Antigravity",
    email,
    token: obfuscate(token),
    refreshToken: refreshToken ? obfuscate(refreshToken) : undefined,
  };
}

test("capture imports distinct IDE and shared-keyring identities once", () => {
  const candidates = [
    account("User@example.test", "ide-token"),
    account("user@EXAMPLE.test", "newer-token", "refresh-token"),
    account("second@example.test", "second-token"),
  ];
  let nextId = 0;
  const result = importCapturedAntigravityAccounts([], candidates, () => `ag-${++nextId}`);

  assert.equal(result.unique.length, 2);
  assert.deepEqual(
    result.added.map((entry) => entry.id),
    ["ag-1", "ag-2"],
  );
  assert.equal(result.accounts[0].token, candidates[1].token);
  assert.equal(result.accounts[1].email, "second@example.test");
});

test("capture leaves an already saved identity and its credentials unchanged", () => {
  const saved = { ...account("user@example.test", "saved-token"), id: "saved-id" };
  const result = importCapturedAntigravityAccounts(
    [saved],
    [account("USER@example.test", "captured-token", "new-refresh")],
    () => "new-id",
  );

  assert.equal(result.added.length, 0);
  assert.deepEqual(result.accounts, [saved]);
});

test("capture deduplicates matching credentials when email is unavailable", () => {
  const unique = uniqueCapturedAntigravityAccounts([
    account(undefined, "old-token", "same-refresh"),
    account(undefined, "new-token", "same-refresh"),
    account(undefined, "other-token"),
  ]);

  assert.equal(unique.length, 2);
  assert.equal(unique[0].token, obfuscate("old-token"));
  assert.equal(unique[1].token, obfuscate("other-token"));
});

test("capture merges identities connected by email and refresh token", () => {
  const unique = uniqueCapturedAntigravityAccounts([
    account("person@example.test", "ide-token"),
    account(undefined, "cli-token", "shared-refresh"),
    account("person@example.test", "desktop-token", "shared-refresh"),
  ]);

  assert.equal(unique.length, 1);
  assert.equal(unique[0].token, obfuscate("desktop-token"));
});

test("capture saves only new identities and selects the current saved account", async () => {
  const saved = { ...account("current@example.test", "saved-token"), id: "saved-id" };
  let stored = [saved];
  const refreshed = [];
  const selected = [];
  const local = [];
  const completed = [];
  const handle = createCapturedAntigravityAccountHandler({
    loadAccounts: () => stored,
    saveAccounts: (accounts) => {
      stored = accounts;
    },
    setActiveAccountId: (id) => selected.push(id),
    onAccountAdded: async (id) => refreshed.push(id),
    onLocalSessionCaptured: (entry) => local.push(entry),
    onCaptureSucceeded: (counts) => completed.push({ ...counts, savedCount: stored.length }),
  });
  const current = account("CURRENT@example.test", "current-token");
  const count = await handle([current, account("new@example.test", "new-token")], current);

  assert.equal(count, 1);
  assert.equal(stored.length, 2);
  assert.deepEqual(stored[0], saved);
  assert.equal(stored[1].email, "new@example.test");
  assert.deepEqual(refreshed, [stored[1].id]);
  assert.deepEqual(selected, [saved.id]);
  assert.deepEqual(local, [current]);
  assert.deepEqual(completed, [{ addedCount: 1, alreadyPresentCount: 1, savedCount: 2 }]);
});
