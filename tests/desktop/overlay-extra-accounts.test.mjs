import test from "node:test";
import assert from "node:assert/strict";

const { attachAdditionalAccounts, listOverlayAccounts } =
  await import("../../.test-build/common/overlay-extra-accounts.js");

const card = (accountId, provider = "codex") => ({
  provider,
  accountId,
  label: `Card ${accountId}`,
});
const e = (id, provider = "codex") => ({ provider, id });
const build = ({ provider, id }) => card(id, provider);

test("single tracked account keeps the payload unchanged", () => {
  const primary = card("a");
  const result = attachAdditionalAccounts(primary, [e("a")], build);
  assert.deepEqual(result, primary);
  assert.equal("additionalAccounts" in result, false);
});

test("extra tracked accounts are attached in order without a hard card cap", () => {
  const result = attachAdditionalAccounts(card("a"), [e("a"), e("b"), e("c"), e("d")], build);
  assert.deepEqual(
    result.additionalAccounts.map((item) => item.accountId),
    ["b", "c", "d"],
  );
  assert.deepEqual(
    listOverlayAccounts(result).map((item) => item.accountId),
    ["a", "b", "c", "d"],
  );
});

test("extras can come from other providers, even with the same account id", () => {
  const entries = [e("a", "claude"), e("g", "antigravity"), e("a")];
  const result = attachAdditionalAccounts(card("a"), entries, build);
  assert.deepEqual(
    listOverlayAccounts(result).map((item) => `${item.provider}:${item.accountId}`),
    ["codex:a", "claude:a", "antigravity:g"],
  );
});

test("missing or mismatched builds are skipped and stale extras dropped", () => {
  const stale = { ...card("a"), additionalAccounts: [card("old")] };
  const flaky = ({ provider, id }) =>
    id === "b"
      ? null
      : id === "c"
        ? card("other")
        : card(id, provider === "claude" ? "codex" : provider);
  const result = attachAdditionalAccounts(stale, [e("b"), e("c"), e("d", "claude"), e("a")], flaky);
  assert.equal("additionalAccounts" in result, false);
});

test("nested extras are flattened and a primary without id still works", () => {
  const nested = (entry) => ({ ...build(entry), additionalAccounts: [card("deep")] });
  const result = attachAdditionalAccounts(
    { provider: "claude", label: "Claude" },
    [e("x")],
    nested,
  );
  assert.deepEqual(result.additionalAccounts, [card("x")]);
});

test("list handles empty payloads", () => {
  assert.deepEqual(listOverlayAccounts(null), []);
  assert.deepEqual(listOverlayAccounts(undefined), []);
  assert.deepEqual(listOverlayAccounts(card("a")), [card("a")]);
});
