import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("orderCliPoolAccounts preserves customized rotation order for selected accounts", async () => {
  const { orderCliPoolAccounts } = await import("../../src/utils/cli-pools/account-order.ts");
  const accounts = [
    { id: "acc-1", label: "Alpha" },
    { id: "acc-2", label: "Beta" },
    { id: "acc-3", label: "Gamma" },
  ];
  // User customized order: Beta first, then Gamma
  const selectedIds = ["acc-2", "acc-3"];
  const ordered = orderCliPoolAccounts(accounts, selectedIds);
  assert.deepEqual(
    ordered.map((a) => a.id),
    ["acc-2", "acc-3", "acc-1"],
  );
});

test("CodexModelPoolV2Members uses CliPoolAccountItem with order buttons and badge", () => {
  const source = read("src/components/codex/CodexModelPoolV2Members.tsx");
  assert.match(source, /CliPoolAccountItem/);
  assert.match(source, /orderCliPoolAccounts/);
  assert.match(source, /orderIndex=\{orderIndex\}/);
  assert.match(source, /onMoveUp=\{/);
  assert.match(source, /onMoveDown=\{/);
  assert.match(source, /cli-pool-account-list/);
  assert.match(source, /codex-pool-member-list/);
});

test("src/styles.css imports common/cli-pools.css", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /@import "\.\/styles\/common\/cli-pools\.css";/);
});
