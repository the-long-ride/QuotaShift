import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  loadCardLayoutModePreference,
  saveCardLayoutModePreference,
  formatCompactLimitLabel,
  formatCompactTierName,
  CARD_LAYOUT_MODE_KEY,
} from "../.test-build/card-layout-mode.js";

test("loadCardLayoutModePreference returns default expanded when storage empty", () => {
  const mockStorage = {
    getItem: () => null,
    setItem: () => {},
  };
  assert.equal(loadCardLayoutModePreference(mockStorage), "expanded");
});

test("loadCardLayoutModePreference returns compact when saved", () => {
  const mockStorage = {
    getItem: (key) => (key === CARD_LAYOUT_MODE_KEY ? "compact" : null),
    setItem: () => {},
  };
  assert.equal(loadCardLayoutModePreference(mockStorage), "compact");
});

test("saveCardLayoutModePreference writes to storage", () => {
  const store = {};
  const mockStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
  };
  saveCardLayoutModePreference("compact", mockStorage);
  assert.equal(store[CARD_LAYOUT_MODE_KEY], "compact");
  saveCardLayoutModePreference("expanded", mockStorage);
  assert.equal(store[CARD_LAYOUT_MODE_KEY], "expanded");
});

test("SettingsModal defines segmented switch with Compact and Expand buttons", () => {
  const modalCode = fs.readFileSync(path.resolve("src/components/common/SettingsModal.tsx"), "utf8");
  assert.match(modalCode, /settings-segmented-switch/);
  assert.match(modalCode, />\s*Compact\s*<\/button>/);
  assert.match(modalCode, />\s*Expand\s*<\/button>/);
});

test("compact-mode.css hides progress bars in compact mode", () => {
  const css = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  assert.match(css, /\[data-card-mode="compact"\]\s+\.progress-container/);
  assert.match(css, /display:\s*none\s*!important/);
});

test("AntigravityQuotaRows attaches antigravity-quota-group and antigravity-quota-list classes", () => {
  const code = fs.readFileSync(path.resolve("src/components/antigravity/AntigravityQuotaRows.tsx"), "utf8");
  assert.match(code, /antigravity-quota-group/);
  assert.match(code, /antigravity-quota-list/);
});

test("compact-mode.css forces 1-line row layout for antigravity-quota-group", () => {
  const css = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  assert.match(css, /\[data-card-mode="compact"\]\s+\.antigravity-quota-group\s*\{[^}]*flex-direction:\s*row\s*!important/s);
});

test("CodexTab wraps account info and limits in codex-card-row", () => {
  const code = fs.readFileSync(path.resolve("src/components/codex/CodexTab.tsx"), "utf8");
  assert.match(code, /className="codex-card-row"/);
});

test("compact-mode.css places codex-card-row on the same row", () => {
  const css = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  assert.match(css, /\[data-card-mode="compact"\]\s+\.codex-card-row\s*\{[^}]*flex-direction:\s*row\s*!important/s);
  assert.match(css, /\[data-card-mode="compact"\]\s+\.codex-card-row\s+\.codex-card-limits\s*\{[^}]*border-top:\s*none\s*!important/s);
});

test("formatCompactLimitLabel maps limit windows to 5HR, WK, MO, DAY, YR", () => {
  assert.equal(formatCompactLimitLabel("5 hrs limit"), "5HR");
  assert.equal(formatCompactLimitLabel("5h limit"), "5HR");
  assert.equal(formatCompactLimitLabel("Primary window"), "5HR");
  assert.equal(formatCompactLimitLabel("Primary / Session"), "5HR");
  assert.equal(formatCompactLimitLabel("Weekly limit"), "WK");
  assert.equal(formatCompactLimitLabel("Secondary window"), "WK");
  assert.equal(formatCompactLimitLabel("Secondary / Weekly"), "WK");
  assert.equal(formatCompactLimitLabel("Monthly limit"), "MO");
  assert.equal(formatCompactLimitLabel("Daily limit"), "DAY");
  assert.equal(formatCompactLimitLabel("Annual limit"), "YR");
});

test("formatCompactTierName maps plans to PRO, ULTRA, PLUS, FREE", () => {
  assert.equal(formatCompactTierName("Google AI Pro"), "PRO");
  assert.equal(formatCompactTierName("Google AI Ultra"), "ULTRA");
  assert.equal(formatCompactTierName("ChatGPT Plus"), "PLUS");
  assert.equal(formatCompactTierName("FREE"), "FREE");
  assert.equal(formatCompactTierName("Free"), "FREE");
  assert.equal(formatCompactTierName("ChatGPT Pro"), "PRO");
  assert.equal(formatCompactTierName("Team"), "TEAM");
  assert.equal(formatCompactTierName("Local profile"), "LOCAL");
});

test("compact-mode.css toggles label-full vs label-compact and plan-full vs plan-compact", () => {
  const css = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  assert.match(css, /\.label-compact,\s*\.plan-compact\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\[data-card-mode="compact"\]\s+\.label-compact,\s*\[data-card-mode="compact"\]\s+\.plan-compact\s*\{[^}]*display:\s*inline\s*!important/s);
});

test("CodexTab places email and tier badge to the right of alias in order: aliasname - email - tier badge", () => {
  const code = fs.readFileSync(path.resolve("src/components/codex/CodexTab.tsx"), "utf8");
  const aliasIdx = code.indexOf("codex-label-text");
  const emailIdx = code.indexOf("codex-card-header-email");
  const badgeIdx = code.indexOf("codex-card-tier-badge");
  assert.ok(aliasIdx !== -1 && emailIdx !== -1 && badgeIdx !== -1);
  assert.ok(aliasIdx < emailIdx, "aliasname must appear before header email");
  assert.ok(emailIdx < badgeIdx, "header email must appear before tier badge");
});

test("compact-mode.css shows header email and tier badge only in compact mode", () => {
  const css = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  assert.match(css, /\.codex-card-header-email,\s*\.codex-card-tier-badge\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\[data-card-mode="compact"\]\s+\.codex-card-header-email\s*\{[^}]*display:\s*inline-block\s*!important/s);
  assert.match(css, /\[data-card-mode="compact"\]\s+\.codex-card-tier-badge\s*\{[^}]*display:\s*inline-flex\s*!important/s);
});

test("AntigravityQuotaRows uses ModelPoolIcon in compact mode and text in expanded mode", () => {
  const code = fs.readFileSync(path.resolve("src/components/antigravity/AntigravityQuotaRows.tsx"), "utf8");
  assert.match(code, /import\s+\{\s*ModelPoolIcon\s*\}\s+from\s+["']\.\.\/common\/ModelLogos["']/);
  assert.match(code, /className="label-full">\s*\{quota\.model\}\s*<\/span>/);
  assert.match(code, /className="label-compact model-icon-compact">\s*<ModelPoolIcon\s+model=\{quota\.model\}\s*\/>/);
});

test("ModelLogos exports GeminiLogo, OpenAILogo, ClaudeOpenAIDualLogo, and ModelPoolIcon", () => {
  const code = fs.readFileSync(path.resolve("src/components/common/ModelLogos.tsx"), "utf8");
  assert.match(code, /export const GeminiLogo/);
  assert.match(code, /export const OpenAILogo/);
  assert.match(code, /export const ClaudeOpenAIDualLogo/);
  assert.match(code, /export const ModelPoolIcon/);
  assert.match(code, /viewBox="0 0 28 28"/);
  assert.match(code, /viewBox="0 0 512 512"/);
});

test("compact-mode.css sizes quota-item-header to 42px and styles model-dual-logo", () => {
  const css = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  assert.match(css, /\[data-card-mode="compact"\]\s+\.antigravity-quota-group\s+\.quota-item-header\s*\{[^}]*flex:\s*0 0 42px\s*!important/s);
  assert.match(css, /\[data-card-mode="compact"\]\s+\.model-icon-compact\s*\{[^}]*display:\s*inline-flex\s*!important/s);
  assert.match(css, /\.model-dual-logo\s*\{[^}]*display:\s*inline-flex/s);
});

test("Antigravity account email displays fully without 95px truncation", () => {
  const compactCss = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  const agyCss = fs.readFileSync(path.resolve("src/styles/antigravity.css"), "utf8");
  const agyTab = fs.readFileSync(path.resolve("src/components/antigravity/AntigravityTab.tsx"), "utf8");

  assert.match(compactCss, /\.tab-panel--antigravity\s+\.codex-card-email-info\s*\{[^}]*max-width:\s*none\s*!important/s);
  assert.match(agyCss, /\.tab-panel--antigravity\s+\.codex-card-email-info\s*\{[^}]*max-width:\s*none\s*!important/s);
  assert.match(agyTab, /className="tab-panel tab-panel--active tab-panel--antigravity"/);
});

test("compact-mode.css anchors Codex header email and tier badge to the right", () => {
  const css = fs.readFileSync(path.resolve("src/styles/compact-mode.css"), "utf8");
  assert.match(
    css,
    /\[data-card-mode="compact"\]\s+\.codex-card-header-email\s*\{[^}]*margin-left:\s*auto\s*!important/s
  );
  assert.match(
    css,
    /\[data-card-mode="compact"\]\s+\.codex-label-text\s*\+\s*\.codex-card-tier-badge[^{]*\{[^}]*margin-left:\s*auto\s*!important/s
  );
});



