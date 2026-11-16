import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("AntigravityTab renders empty state directly inside app-content matching CodexTab", () => {
  const tab = read("src/components/antigravity/AntigravityTab.tsx");
  assert.match(
    tab,
    /<div className="app-content">\s*\{accounts\.length === 0 \|\| filteredAccounts\.length === 0 \? \(\s*<AntigravityEmptyState/,
  );
  assert.doesNotMatch(tab, /<div[^>]*codex-accounts-container[^>]*>\s*\{accounts\.length === 0/);
});

test("AntigravityEmptyState mirrors CodexEmptyState and CodexTabEmpty layout and copy", () => {
  const empty = read("src/components/antigravity/AntigravityEmptyState.tsx");
  const css = read("src/styles/codex/codex-cards.css");
  assert.match(empty, /className="codex-empty-state"/);
  assert.match(empty, /className="codex-empty-icon"/);
  assert.match(empty, /No Antigravity accounts/);
  assert.match(empty, /Click <strong>Add Account<\/strong>/);
  assert.match(empty, /No matching accounts/);
  assert.doesNotMatch(empty, /antigravity-empty-state/);
  assert.doesNotMatch(css, /\.antigravity-empty-state/);
});
