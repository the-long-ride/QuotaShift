import test from "node:test";
import assert from "node:assert/strict";

import { accountCardColumnCount } from "../../.test-build/account/account-card-columns.js";

test("account-card columns follow the unbounded 450px rhythm", () => {
  assert.equal(accountCardColumnCount(599.9), 1);
  assert.equal(accountCardColumnCount(600), 2);
  assert.equal(accountCardColumnCount(1049.999), 2);
  assert.equal(accountCardColumnCount(1050), 3);
  assert.equal(accountCardColumnCount(1500), 4);
  assert.equal(accountCardColumnCount(7350), 17);
  assert.equal(accountCardColumnCount(7800), 18);
  assert.equal(accountCardColumnCount(12300), 28);
});

test("account-card columns clamp invalid and negative widths to one column", () => {
  assert.equal(accountCardColumnCount(Number.NaN), 1);
  assert.equal(accountCardColumnCount(-200), 1);
});
