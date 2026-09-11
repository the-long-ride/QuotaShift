import test from "node:test";
import assert from "node:assert/strict";

const { findAntigravityAccountMatch, findCodexAccountMatch, upsertAccountById } =
  await import("../.test-build/account/current-account.js");
const { obfuscate } = await import("../.test-build/auth/auth.js");

test("Antigravity matching prefers normalized email and then credential identity", () => {
  const accounts = [
    { id: "ag-1", label: "Google", token: obfuscate("token-one"), refreshToken: obfuscate("refresh-one"), email: " User@Example.com " },
    { id: "ag-2", label: "Other", token: obfuscate("token-two"), refreshToken: obfuscate("refresh-two"), email: "other@example.com" },
  ];

  assert.equal(findAntigravityAccountMatch(accounts, { ...accounts[0], email: "user@example.com" })?.id, "ag-1");
  assert.equal(findAntigravityAccountMatch(accounts, { ...accounts[0], email: "new@example.com" })?.id, "ag-1");
  // Match by refreshToken even when token has rotated and email is missing
  assert.equal(findAntigravityAccountMatch(accounts, { id: "candidate", label: "Local", token: obfuscate("new-access-token"), refreshToken: obfuscate("refresh-one") })?.id, "ag-1");
  assert.equal(findAntigravityAccountMatch(accounts, { id: "new", label: "New", token: obfuscate("missing") }), undefined);
});

test("Codex OAuth matching prefers account id, then email, then credential identity", () => {
  const oauthCredential = JSON.stringify({ accountId: "oauth-account-1", accessToken: "secret" });
  const accounts = [
    { id: "codex-1", label: "OAuth", apiKey: obfuscate(oauthCredential), email: "user@example.com" },
    { id: "codex-2", label: "Key", apiKey: obfuscate("sk-live-key"), email: "key@example.com" },
  ];

  assert.equal(
    findCodexAccountMatch(accounts, {
      id: "candidate",
      label: "Candidate",
      apiKey: obfuscate(JSON.stringify({ accountId: "oauth-account-1", accessToken: "new-secret" })),
      email: "different@example.com",
    })?.id,
    "codex-1",
  );
  assert.equal(findCodexAccountMatch(accounts, { id: "candidate", label: "Candidate", apiKey: obfuscate("new"), email: "KEY@EXAMPLE.COM" })?.id, "codex-2");
  assert.equal(findCodexAccountMatch(accounts, { id: "candidate", label: "Candidate", apiKey: obfuscate("sk-live-key") })?.id, "codex-2");
});

test("upsert replaces by id and appends without duplicate insertion", () => {
  const existing = [{ id: "one", label: "Old" }, { id: "two", label: "Two" }];
  assert.deepEqual(upsertAccountById(existing, { id: "one", label: "Updated" }), [
    { id: "one", label: "Updated" },
    { id: "two", label: "Two" },
  ]);
  assert.deepEqual(upsertAccountById(existing, { id: "three", label: "Three" }), [
    { id: "one", label: "Old" },
    { id: "two", label: "Two" },
    { id: "three", label: "Three" },
  ]);
});
