import test from "node:test";
import assert from "node:assert/strict";
import { orderCliPoolAccounts } from "../../.test-build/cli-pools/account-order.js";

test("selected accounts display in rotation order before unselected accounts", () => {
  const accounts = ["a", "b", "c", "d"].map((id) => ({ id }));
  assert.deepEqual(
    orderCliPoolAccounts(accounts, ["c", "a"]).map((account) => account.id),
    ["c", "a", "b", "d"],
  );
  assert.deepEqual(
    orderCliPoolAccounts(accounts, ["a", "c"]).map((account) => account.id),
    ["a", "c", "b", "d"],
  );
  assert.deepEqual(
    accounts.map((account) => account.id),
    ["a", "b", "c", "d"],
  );
});

test("stale or duplicate selected IDs do not create extra rows", () => {
  const accounts = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(orderCliPoolAccounts(accounts, ["gone", "b", "b"]), [accounts[1], accounts[0]]);
});
