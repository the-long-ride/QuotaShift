import test from "node:test";
import assert from "node:assert/strict";

const { attachAdditionalAccounts, listOverlayAccounts } =
  await import("../../.test-build/common/overlay-extra-accounts.js");

const card = (accountId) => ({ provider: "codex", accountId, label: `Card ${accountId}` });

test("single tracked account keeps the payload unchanged", () => {
  const primary = card("a");
  const result = attachAdditionalAccounts(primary, ["a"], card);
  assert.deepEqual(result, primary);
  assert.equal("additionalAccounts" in result, false);
});

test("extra tracked accounts are attached in order and capped at three cards", () => {
  const result = attachAdditionalAccounts(card("a"), ["a", "b", "c", "d"], card);
  assert.deepEqual(
    result.additionalAccounts.map((item) => item.accountId),
    ["b", "c"],
  );
  assert.deepEqual(
    listOverlayAccounts(result).map((item) => item.accountId),
    ["a", "b", "c"],
  );
});

test("missing or mismatched builds are skipped and stale extras dropped", () => {
  const stale = { ...card("a"), additionalAccounts: [card("old")] };
  const build = (id) => (id === "b" ? null : id === "c" ? card("other") : card(id));
  const result = attachAdditionalAccounts(stale, ["b", "c", "a"], build);
  assert.equal("additionalAccounts" in result, false);
});

test("nested extras are flattened and a primary without id still works", () => {
  const nested = (id) => ({ ...card(id), additionalAccounts: [card("deep")] });
  const result = attachAdditionalAccounts({ provider: "claude", label: "Claude" }, ["x"], nested);
  assert.deepEqual(result.additionalAccounts, [card("x")]);
});

test("list handles empty payloads", () => {
  assert.deepEqual(listOverlayAccounts(null), []);
  assert.deepEqual(listOverlayAccounts(undefined), []);
  assert.deepEqual(listOverlayAccounts(card("a")), [card("a")]);
});
