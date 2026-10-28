import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("storage keys have one canonical source instead of hook-local redeclarations", () => {
  const constants = read("src/utils/common/backup/app-constants.ts");
  const consumers = [
    "src/App.tsx",
    "src/hooks/app/useAppCoordinator.ts",
    "src/hooks/app/tracking/useAppUsageAndOverlay.ts",
    "src/hooks/app/useAppAccountOperations.ts",
    "src/hooks/antigravity/useAntigravityAccountOps.ts",
    "src/hooks/codex/useCodexAccountOps.ts",
    "src/hooks/app/useAppSessionBootstrap.ts",
    "src/hooks/app/useAppEventListeners.ts",
    "src/hooks/codex/useCodexRouterManager.ts",
  ].map(read);

  for (const name of [
    "ANTIGRAVITY_ACTIVE_ID_KEY",
    "CODEX_ACTIVE_ID_KEY",
    "CODEX_ACTIVE_POOL_ID_KEY",
    "CODEX_POOL_ROUTING_KEY",
    "OVERLAY_TRACKED_PROVIDER_KEY",
    "OVERLAY_TRACKED_ACCOUNT_ID_KEY",
  ]) {
    assert.match(constants, new RegExp(`export const ${name}`));
    for (const consumer of consumers) {
      assert.doesNotMatch(consumer, new RegExp(`(?:export\\s+)?const ${name}\\s*=`));
    }
  }
});

test("provider tier summaries share one presentation component", () => {
  const summary = read("src/components/common/accounts/AccountTierSummary.tsx");
  const antigravity = read("src/components/antigravity/AntigravityTab.tsx");
  const claude = read("src/components/claude/ClaudeTab.tsx");
  const codex = read("src/components/codex/cards/CodexAccountBar.tsx");

  assert.match(summary, /account-bar-summary/);
  assert.match(summary, /account-tier-badge-label/);
  assert.match(antigravity, /<AccountTierSummary/);
  assert.match(claude, /<AccountTierSummary/);
  assert.match(codex, /<AccountTierSummary/);
});

test("Claude overlay guardrail payload construction has one source", () => {
  const helper = read("src/utils/common/overlay/claude-overlay-sync.ts");
  const overlay = read("src/utils/common/overlay/app-overlay-helpers.ts");

  assert.match(helper, /export function buildClaudeGuardrailOverlayState/);
  assert.match(helper, /claudeGuardrails: buildClaudeGuardrailOverlayState\(preferences\)/);
  assert.equal((overlay.match(/buildClaudeGuardrailOverlayState\(preferences\)/g) ?? []).length, 2);
  assert.doesNotMatch(
    overlay,
    /fiveHourEnabled:\s*preferences\.fiveHour\.enabled[\s\S]{0,180}weeklyEnabled:/,
  );
});

test("copy-link, compact-refresh, and modal Escape behavior use shared implementations", () => {
  const copy = read("src/components/common/icons/CopySvgIcon.tsx");
  const refresh = read("src/components/common/icons/CompactRefreshIcon.tsx");
  const escapeHook = read("src/components/common/dialogs/useCloseOnEscape.ts");

  assert.match(copy, /export const CopyLinkSvgIcon/);
  assert.match(refresh, /export const CompactRefreshIcon/);
  assert.match(escapeHook, /export function useCloseOnEscape/);

  for (const path of [
    "src/components/antigravity/modal/AntigravityOAuthStepView.tsx",
    "src/components/codex/modals/CodexBrowserLoginTab.tsx",
    "src/components/codex/modals/CodexAvailableModelsDialog.tsx",
  ]) {
    assert.match(read(path), /CopyLinkSvgIcon/);
  }

  for (const path of [
    "src/components/antigravity/AntigravityAccountActions.tsx",
    "src/components/codex/CodexIcons.tsx",
  ]) {
    assert.match(read(path), /CompactRefreshIcon/);
  }

  for (const path of [
    "src/components/antigravity/modal/AddAntigravityAccountModal.tsx",
    "src/components/codex/modals/AddAccountModal.tsx",
    "src/components/common/settings/useSettingsModalTab.ts",
  ]) {
    assert.match(read(path), /useCloseOnEscape/);
    assert.doesNotMatch(read(path), /window\.addEventListener\("keydown", onKey\)/);
  }
});

test("removed dead settings icons stay removed", () => {
  const settingsIcons = read("src/components/common/settings-controls/SettingsIcons.tsx");
  assert.doesNotMatch(settingsIcons, /AppearanceIcon/);
  assert.doesNotMatch(settingsIcons, /LogsTabIcon/);
});
