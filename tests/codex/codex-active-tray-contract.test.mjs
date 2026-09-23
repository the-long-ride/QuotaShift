import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWithCssImports } from "../css-helper.mjs";

const app = readWithCssImports("src/App.tsx");
const tray = await readFile(
  new URL("../../src-tauri/src/window/window_manager.rs", import.meta.url),
  "utf8",
);

test("adding a Codex account does not mark it active before Apply", () => {
  const match = app.match(/\{isCodexModalOpen\s*&&\s*\(?\s*<AddAccountModal/);
  const modalStart = match ? match.index : -1;
  assert.notEqual(modalStart, -1, "Codex add-account modal contract must exist");
  const modalSlice = app.slice(modalStart, modalStart + 2200);
  assert.doesNotMatch(
    modalSlice,
    /onAccountAdded=\{async \(id\) => \{\s*setActiveCodexId\(id\);\s*localStorage\.setItem\(CODEX_ACTIVE_ID_KEY, id\)/,
  );
});

test("tracking the current Codex account sends the complete monitored payload", () => {
  const handlerStart = app.indexOf("const handleTrackCurrentCodexAccount");
  assert.notEqual(handlerStart, -1, "current Codex tracking handler must exist");
  const handlerSlice = app.slice(handlerStart, handlerStart + 3600);
  assert.doesNotMatch(handlerSlice, /set_monitored_codex[^\n]{0,240}\{\s*info:\s*\{\s*id:/);
  assert.match(handlerSlice, /handleTrackCodexAccount\(account\)/);
});

test("tracked tooltip survives Antigravity polling failure", () => {
  const errorBranch = tray.slice(
    tray.indexOf("Err(_) =>"),
    tray.indexOf("pub fn update_tray_only"),
  );
  assert.match(
    errorBranch,
    /monitored_tray\.is_some\(\) \|\| status\.monitored_codex\.is_some\(\)/,
  );
  assert.match(errorBranch, /format_tooltip_with_monitored\(&status, monitored_tray\.as_ref\(\)\)/);
  assert.match(errorBranch, /Language server not reachable/);
});
