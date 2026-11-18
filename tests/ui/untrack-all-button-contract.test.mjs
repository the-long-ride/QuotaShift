import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const header = fs.readFileSync("src/components/common/header/Header.tsx", "utf8");
const untrackBtn = fs.readFileSync("src/components/common/header/UntrackAllButton.tsx", "utf8");
const headerIcons = fs.readFileSync("src/components/common/header/HeaderIcons.tsx", "utf8");
const panelCss = fs.readFileSync("src/styles/shared/panel.css", "utf8");
const trackedAccounts = fs.readFileSync("src/utils/common/accounts/tracked-accounts.ts", "utf8");

test("UntrackAllButton renders conditionally on multi-track enabled and tracked accounts present", () => {
  assert.match(untrackBtn, /loadMultiTrackEnabled\(\)/);
  assert.match(untrackBtn, /loadTrackedList\(\)\.length\s*>\s*0/);
  assert.match(untrackBtn, /TRACKED_IDS_CHANGED_EVENT/);
  assert.match(untrackBtn, /if \(!visible\) return null;/);
});

test("UntrackAllButton opens the MonitoredAccountsModal via OPEN_MONITORED_ACCOUNTS_MODAL_EVENT", () => {
  assert.match(untrackBtn, /OPEN_MONITORED_ACCOUNTS_MODAL_EVENT/);
  assert.match(untrackBtn, /className="untrack-all-btn"/);
  assert.match(untrackBtn, /data-tooltip="Manage monitored accounts"/);
  assert.match(untrackBtn, /<MonitoredAccountsIcon \/>/);
});

test("MonitoredAccountsModal provides top-right quick sort, rank-above-icon layout, ghost drop shadow, and Untrack All confirm", () => {
  const modal = fs.readFileSync(
    "src/components/common/monitored/MonitoredAccountsModal.tsx",
    "utf8",
  );
  const css = fs.readFileSync("src/styles/shared/monitored-accounts-modal.css", "utf8");
  assert.match(modal, /<AccountModalLayout/);
  assert.match(modal, /title=\{`Monitored Accounts - \$\{displayedItems\.length\}`\}/);
  assert.match(modal, /headerActions=\{/);
  assert.match(modal, /usePointerCardReorder/);
  assert.match(modal, /data-sortable-account-id/);
  assert.match(modal, /is-drag-target-ghost/);
  assert.match(modal, /is-drag-floating/);
  assert.match(css, /\.monitored-account-row\.is-drag-target-ghost/);
  assert.match(css, /border-style:\s*dashed/);
  assert.match(modal, /monitored-rank-col[\s\S]*?#\{index \+ 1\}[\s\S]*?<PlatformBrandIcon/);
  assert.doesNotMatch(modal, /monitored-platform-tag|item\.platformLabel<\/span>\s*<span className="monitored-meta-sep">/);
  for (const field of ["platform", "alias", "email", "tier"]) {
    assert.match(modal, new RegExp(`"${field}"`));
  }
  assert.match(modal, /untrackAccount\(/);
  assert.match(modal, /reorderTrackedAccounts\(/);
  assert.match(modal, /<CustomDialog/);
  assert.match(modal, /Untrack All Accounts/);
  assert.match(modal, /clearTrackedAccounts\(\)/);
  assert.match(modal, /clearMonitoredOverlayState\(\)/);
});

test("MonitoredAccountsIcon and UntrackAllIcon remain exported with theme-adaptive strokes", () => {
  const iconFile = fs.readFileSync(
    "src/components/common/header/MonitoredAccountsIcon.tsx",
    "utf8",
  );
  const untrackIconFile = fs.readFileSync("src/components/common/header/UntrackAllIcon.tsx", "utf8");
  assert.match(headerIcons, /export \{ UntrackAllIcon \} from "\.\/UntrackAllIcon"/);
  assert.match(headerIcons, /export \{ MonitoredAccountsIcon \} from "\.\/MonitoredAccountsIcon"/);
  assert.match(iconFile, /export const MonitoredAccountsIcon/);
  assert.match(iconFile, /stroke="currentColor"/);
  assert.match(untrackIconFile, /export const UntrackAllIcon/);
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

test("tracked-accounts module exports clearTrackedAccounts and reorderTrackedAccounts", () => {
  assert.match(trackedAccounts, /export function clearTrackedAccounts/);
  assert.match(trackedAccounts, /export function reorderTrackedAccounts/);
  assert.match(trackedAccounts, /saveTrackedList\(\[\],/);
});
