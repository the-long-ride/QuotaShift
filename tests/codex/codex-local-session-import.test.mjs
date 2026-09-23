import test from "node:test";
import assert from "node:assert/strict";

import { obfuscate, deobfuscate } from "../../.test-build/auth/auth.js";
import { prepareCodexLocalSessionImport } from "../../.test-build/codex/local-session-import.js";

function account(id, accountId, accessToken, email) {
  return {
    id,
    label: id,
    email,
    apiKey: obfuscate(JSON.stringify({ accountId, accessToken, isOAuth: true })),
  };
}

test("Codex local import marks a matching account as already present without duplicating it", () => {
  const existing = account("saved-id", "workspace-123", "old-access-token", "user@example.test");
  const rawAuth = JSON.stringify({
    auth_mode: "chatgpt",
    tokens: { account_id: "workspace-123", access_token: "new-access-token" },
  });

  const result = prepareCodexLocalSessionImport(rawAuth, "Codex CLI", [existing]);

  assert.equal(result.status, "success");
  assert.equal(result.alreadyPresent, true);
  assert.equal(result.account.id, existing.id);
  assert.equal(result.accounts.length, 1);
  assert.equal(JSON.parse(deobfuscate(result.account.apiKey)).accessToken, "new-access-token");
});

test("Codex local import identifies a new account separately from an existing one", () => {
  const rawAuth = JSON.stringify({
    auth_mode: "chatgpt",
    tokens: { account_id: "new-workspace", access_token: "new-access-token" },
  });

  const result = prepareCodexLocalSessionImport(rawAuth, "Codex CLI", []);

  assert.equal(result.status, "success");
  assert.equal(result.alreadyPresent, false);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.account.id, "acct-oauth-new-workspace");
});
