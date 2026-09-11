import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { readWithCssImports } from "./css-helper.mjs";

const read = (path) => readWithCssImports(path);
const app = read("src/App.tsx");
const available = read("src/components/codex/CodexAvailableModelsDialog.tsx");
const pool = read("src/components/codex/CodexPoolModal.tsx");
const layout = read("src/components/common/AccountModalLayout.tsx");
const codexTab = read("src/components/codex/CodexTab.tsx");
const antigravityTab = read("src/components/antigravity/AntigravityTab.tsx");
const addCodex = read("src/components/codex/AddAccountModal.tsx");
const addAntigravity = read("src/components/antigravity/AddAntigravityAccountModal.tsx");
const types = read("src/utils/common/types.ts");
const styles = read("src/styles.css");

test("available-model rows use one left-aligned formatted line with raw-id copy", () => {
  assert.match(available, /formatCodexModelLine\(model\.displayName, model\.id\)/);
  assert.match(available, /copyCodexModelId\(model\.id\)/);
  assert.match(available, /codex-model-copy-btn/);
  assert.doesNotMatch(available, /codex-model-dialog-model-id">\{model\.id\}/);
  assert.match(styles, /\.codex-model-dialog-row\s*\{[^}]*text-align:\s*left/s);
});

test("pool model choices use the same line format and independent copy button", () => {
  assert.match(pool, /formatCodexModelLine\(entry\.model\.displayName, entry\.model\.id\)/);
  assert.match(pool, /copyCodexModelId\(entry\.model\.id\)/);
  assert.match(pool, /codex-model-option-row/);
  assert.match(pool, /bodyClassName="codex-pool-modal-body-scroll"/);
});

test("pool outer scrollbar is hidden while model list keeps a thin transparent-track scrollbar", () => {
  assert.match(layout, /bodyClassName\?: string/);
  assert.match(styles, /\.codex-pool-modal-body-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /\.codex-model-listbox\s*\{[^}]*scrollbar-width:\s*thin/s);
  assert.match(styles, /\.codex-model-listbox::-webkit-scrollbar\s*\{[^}]*width:\s*3px/s);
  assert.match(styles, /\.codex-model-listbox::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent/s);
});

test("saved Codex and Antigravity accounts persist last-used timestamps", () => {
  const occurrences = types.match(/lastUsedAt\?: number;/g) ?? [];
  assert.ok(occurrences.length >= 2, "both saved account types must carry lastUsedAt");
  assert.match(app, /persistCodexLastUsed/);
  assert.match(app, /persistAntigravityLastUsed/);
  assert.match(app, /persistCodexLastUsed\(matchedId\)/);
  assert.match(app, /persistAntigravityLastUsed\(matched\.id\)/);
  assert.match(app, /persistCodexLastUsed\(acc\.id, usedAt\)/);
  assert.match(app, /persistAntigravityLastUsed\(acc\.id\)/);
});

test("browser account collection does not count as use and reconnect preserves last-used history", () => {
  const antigravityModalPropsStart = app.indexOf("<AddAntigravityAccountModal");
  const antigravityModalPropsEnd = app.indexOf("{/* Export / Import Passphrase Modal */}", antigravityModalPropsStart);
  assert.ok(antigravityModalPropsStart >= 0 && antigravityModalPropsEnd > antigravityModalPropsStart);
  const antigravityModalProps = app.slice(antigravityModalPropsStart, antigravityModalPropsEnd);
  assert.doesNotMatch(
    antigravityModalProps,
    /persistAntigravityLastUsed/,
    "Browser Login only collects credentials; it must not stamp Last used",
  );
  assert.match(
    addAntigravity,
    /accounts\[existingIdx\]\s*=\s*\{\s*\.\.\.accounts\[existingIdx\],\s*\.\.\.newAccount\s*\}/s,
    "reconnecting an Antigravity account must preserve persisted metadata such as lastUsedAt",
  );
  assert.match(
    addCodex,
    /existingAccount\s*\?\s*\{\s*\.\.\.existingAccount,\s*\.\.\.newAccount\s*\}\s*:\s*newAccount/s,
    "reconnecting a Codex workspace must preserve persisted metadata such as lastUsedAt",
  );
});

test("routed Codex use is observed from router status and persisted", () => {
  assert.match(app, /lastSeenRouterRequestCountRef/);
  assert.match(app, /recordRoutedCodexUse/);
  assert.match(app, /get_codex_router_status/);
  assert.match(app, /setInterval\([^)]*2000/s);
});

test("every saved account card renders last-used text", () => {
  assert.match(codexTab, /formatLastUsed\(acc\.lastUsedAt\)/);
  assert.match(antigravityTab, /formatLastUsed\(acc\.lastUsedAt\)/);
});
