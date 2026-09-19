import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("all provider account bars expose the shared right-most sort menu", () => {
  const ag = read("src/components/antigravity/AntigravityTab.tsx");
  const codexTab = read("src/components/codex/CodexTab.tsx");
  const codex = read("src/components/codex/CodexAccountBar.tsx");
  const claude = read("src/components/claude/ClaudeTab.tsx");
  const menu = read("src/components/common/AccountSortMenu.tsx");
  const css = read("src/styles/account-sort-menu.css");
  const imports = read("src/styles.css");

  assert.match(ag, /AccountSortMenu/);
  assert.match(ag, /sortAntigravityAccountIds/);
  assert.ok(ag.lastIndexOf("<AccountSortMenu") > ag.lastIndexOf("Best"));

  assert.match(codexTab, /<CodexAccountBar/);
  assert.match(codex, /AccountSortMenu/);
  assert.match(codex, /sortCodexAccountIds/);
  assert.ok(codex.lastIndexOf("<AccountSortMenu") > codex.lastIndexOf("Best"));

  assert.match(claude, /AccountSortMenu/);
  assert.match(claude, /sortClaudeAccountIds/);
  assert.ok(claude.lastIndexOf("<AccountSortMenu") > claude.lastIndexOf("TrackCurrentAccountIcon"));

  for (const label of ["Alias name", "Email", "Tier", "Usage", "Last used"]) {
    assert.ok(menu.includes(label));
  }
  assert.match(menu, /applySort\(field, "asc"\)/);
  assert.match(menu, /applySort\(field, "desc"\)/);
  assert.match(menu, /aria-label="Sort accounts"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /viewBox="0 0 1024 1024"/);
  assert.match(menu, /M384 96a32 32/);

  assert.match(imports, /account-sort-menu\.css/);
  assert.match(css, /\.account-sort-menu/);
  assert.match(css, /\.account-sort-direction-btn/);
});

test("Claude profiles use persistent pointer-card ordering like other provider tabs", () => {
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");
  const hook = read("src/components/claude/useClaudeTabReorder.ts");
  const monitor = read("src/hooks/useClaudeAccountMonitor.ts");
  const ordering = read("src/hooks/useClaudeAccountOrdering.ts");
  const constants = read("src/utils/common/app-constants.ts");
  const app = read("src/App.tsx");
  const rust = read("src-tauri/src/claude/accounts.rs");

  assert.match(tab, /useClaudeTabReorder/);
  assert.match(cards, /CardDragHandle/);
  assert.match(cards, /data-sortable-account-id/);
  assert.match(cards, /account-card--dragging/);
  assert.match(hook, /usePointerCardReorder/);

  assert.match(constants, /CLAUDE_ORDER_KEY/);
  assert.match(constants, /CLAUDE_LAST_USED_KEY/);
  assert.match(monitor, /useClaudeAccountOrdering/);
  assert.match(ordering, /saveAccountOrder\(CLAUDE_ORDER_KEY/);
  assert.match(ordering, /loadAccountOrder\(CLAUDE_ORDER_KEY/);
  assert.match(ordering, /sortByOrderValue/);
  assert.match(ordering, /lastUsedAt/);
  assert.match(app, /onReorder=\{handleReorderClaudeAccounts\}/);

  assert.match(rust, /active: active_profile_keys\.contains\(&key\)/);
});
