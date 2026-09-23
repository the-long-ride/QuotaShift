import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/codex/AddAccountModal.tsx", "utf8");

test("browser login schedules every returned workspace for initial refresh", () => {
  assert.match(source, /const accountIds: string\[\] = \[\]/);
  assert.match(source, /accountIds\.push\(newAccount\.id\)/);
  assert.match(source, /accountIds\.forEach\(\(id\) => onStartFetching\(id, true\)\)/);
  assert.match(source, /onAccountsAdded\(accountIds\)/);
  assert.doesNotMatch(source, /lastAccountId/);
});
