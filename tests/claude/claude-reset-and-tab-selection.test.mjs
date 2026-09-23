import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { formatReset } from "../../.test-build/claude/claude-formatters.js";
import { resolveTrackedProviderTab } from "../../.test-build/common/tracked-provider-tab.js";
import { readWithCssImports } from "../css-helper.mjs";

const read = (path) => readWithCssImports(path);

const expectedAbsoluteReset = (date) =>
  `${date.toLocaleString("en", { month: "short" })} ${date.getDate()}, ${expectedTime(date)}`;

const expectedTime = (date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

test("Claude reset formatter says tomorrow for the next local calendar day", () => {
  const now = new Date(2026, 8, 16, 23, 30);
  const reset = new Date(2026, 8, 17, 7, 10);

  assert.equal(
    formatReset(reset.getTime() / 1000, now.getTime()),
    `Tomorrow ${expectedTime(reset)}`,
  );
});

test("Claude reset formatter shows time only for today and absolute dates beyond tomorrow", () => {
  const now = new Date(2026, 8, 16, 10, 0);
  const today = new Date(2026, 8, 16, 19, 10);
  const later = new Date(2026, 8, 23, 2, 0);

  assert.equal(formatReset(today.getTime() / 1000, now.getTime()), expectedTime(today));
  assert.equal(formatReset(later.getTime() / 1000, now.getTime()), expectedAbsoluteReset(later));
});

test("Claude reset formatter recognizes tomorrow across a month and year boundary", () => {
  const now = new Date(2026, 11, 31, 23, 45);
  const reset = new Date(2027, 0, 1, 1, 15);

  assert.equal(
    formatReset(reset.getTime() / 1000, now.getTime()),
    `Tomorrow ${expectedTime(reset)}`,
  );
});

test("tracked provider resolver preserves explicit provider and legacy Codex fallback", () => {
  assert.equal(resolveTrackedProviderTab("claude", false), "claude");
  assert.equal(resolveTrackedProviderTab("codex", false), "codex");
  assert.equal(resolveTrackedProviderTab("antigravity", true), "antigravity");
  assert.equal(resolveTrackedProviderTab(null, true), "codex");
  assert.equal(resolveTrackedProviderTab(null, false), "antigravity");
});

test("tracked Claude is selected on initial app render and whenever the main window is reopened", () => {
  const app = read("src/App.tsx");
  const activeTabStart = app.indexOf("const [activeTab");
  const activeTabEnd = app.indexOf("[antigravityAccounts", activeTabStart);
  assert.ok(
    activeTabStart >= 0 && activeTabEnd > activeTabStart,
    "active tab initializer must exist",
  );
  const initializer = app.slice(activeTabStart, activeTabEnd);
  assert.match(initializer, /resolveTrackedProviderTab/);
  assert.match(initializer, /OVERLAY_TRACKED_PROVIDER_KEY/);

  const listenerStart = app.indexOf('const uWindow = await listen<boolean>("window-shown"');
  const listenerEnd = app.indexOf("const uWorker", listenerStart);
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart, "window-shown listener must exist");
  const listener = app.slice(listenerStart, listenerEnd);
  assert.match(listener, /resolveTrackedProviderTab/);
  assert.match(listener, /OVERLAY_TRACKED_PROVIDER_KEY/);
});
