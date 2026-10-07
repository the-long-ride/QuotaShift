import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const header = fs.readFileSync("src/components/common/Header.tsx", "utf8");
const untrackBtn = fs.readFileSync("src/components/common/UntrackAllButton.tsx", "utf8");
const headerIcons = fs.readFileSync("src/components/common/HeaderIcons.tsx", "utf8");
const panelCss = fs.readFileSync("src/styles/shared/panel.css", "utf8");
const trackedAccounts = fs.readFileSync("src/utils/common/tracked-accounts.ts", "utf8");

test("UntrackAllButton renders conditionally on multi-track enabled and tracked accounts present", () => {
  assert.match(untrackBtn, /loadMultiTrackEnabled\(\)/);
  assert.match(untrackBtn, /loadTrackedList\(\)\.length\s*>\s*0/);
  assert.match(untrackBtn, /TRACKED_IDS_CHANGED_EVENT/);
  assert.match(untrackBtn, /if \(!visible\) return null;/);
});

test("UntrackAllButton confirms via CustomDialog and clears all tracked accounts", () => {
  assert.match(untrackBtn, /<CustomDialog/);
  assert.match(untrackBtn, /Untrack All Accounts/);
  assert.match(untrackBtn, /clearTrackedAccounts\(\)/);
  assert.match(untrackBtn, /className="untrack-all-btn"/);
  assert.match(untrackBtn, /data-tooltip="Untrack all accounts"/);
});

test("UntrackAllIcon uses theme-adaptive stroke and user-specified path data", () => {
  const untrackIconFile = fs.readFileSync("src/components/common/UntrackAllIcon.tsx", "utf8");
  assert.match(headerIcons, /export \{ UntrackAllIcon \} from "\.\/UntrackAllIcon"/);
  assert.match(untrackIconFile, /export const UntrackAllIcon/);
  assert.match(untrackIconFile, /viewBox="0 0 24 24"/);
  assert.match(untrackIconFile, /stroke="currentColor"/);
  assert.match(untrackIconFile, /M17\.21 6\.6C15\.86 5\.3/);
  assert.match(untrackIconFile, /M12 4V2/);
  assert.match(untrackIconFile, /M4 12H2/);
  assert.match(untrackIconFile, /M14\.12 9\.88L9\.88 14\.12/);
  assert.match(untrackIconFile, /M22 2L2 22/);
  assert.match(untrackIconFile, /opacity="0\.4"/);
});

test("Header places UntrackAllButton to the right of update button and left of refresh button", () => {
  assert.match(header, /<UntrackAllButton \/>/);
  const updateIdx = header.indexOf("<UpdateIcon />");
  const untrackIdx = header.indexOf("<UntrackAllButton />");
  const refreshIdx = header.indexOf("<RefreshIcon />");

  assert.ok(updateIdx < untrackIdx, "UntrackAllButton must be placed after Update button");
  assert.ok(untrackIdx < refreshIdx, "UntrackAllButton must be placed before Refresh button");
});

test("panel.css styles .untrack-all-btn identical to header icon buttons", () => {
  assert.match(panelCss, /\.gear-menu-btn,\s*\.untrack-all-btn,\s*\.quit-app-btn/);
  assert.match(panelCss, /\.untrack-all-btn:hover/);
  assert.match(panelCss, /\[data-theme="light"\] \.untrack-all-btn:hover/);
});

test("tracked-accounts module exports clearTrackedAccounts", () => {
  assert.match(trackedAccounts, /export function clearTrackedAccounts/);
  assert.match(trackedAccounts, /saveTrackedList\(\[\],/);
});

test("UntrackAllButton resets display mode to none via clearMonitoredOverlayState", () => {
  assert.match(untrackBtn, /clearMonitoredOverlayState\(\)/);
});
