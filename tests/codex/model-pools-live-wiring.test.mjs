import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("Codex Pools has independent enabled toggles instead of one selected routing pool", () => {
  const panel = read("src/components/codex/CodexModelPoolsV2Panel.tsx");
  const card = read("src/components/codex/CodexModelPoolV2Card.tsx");
  assert.match(panel, /onToggleEnabled/);
  assert.match(panel, /pool\.enabled/);
  assert.match(card, /publicModelName/);
  assert.doesNotMatch(panel, /onActivatePool/);
});

test("live router sends all enabled model pools to the backend", () => {
  const manager = read("src/hooks/codex/useCodexRouterManager.ts");
  assert.match(manager, /poolsV2:/);
  assert.match(manager, /modelPoolsV2\.filter\(\(pool\) => pool\.enabled\)/);
  assert.doesNotMatch(manager, /if \(!activeCodexPoolId\)/);
});

test("Claude tab exposes profile-specific experimental Model Pools connection wizard", () => {
  const view = read("src/components/claude/ClaudeTab.tsx");
  assert.match(view, /Connect to QuotaShift/);
  assert.match(view, /ClaudeCodePoolConnectWizard/);
  assert.match(view, /modelPoolsV2/);
});

test("Model Pool actions have QuotaShift's compact spacing", () => {
  const styles = read("src/styles/codex/codex-model-pools-v2.css");
  assert.match(styles, /\.qs-model-pools-grid/);
  assert.match(styles, /gap: 6px/);
  assert.match(styles, /\.qs-model-pools-toolbar-actions/);
});

test("V2 Model Pools reuse QuotaShift native card structure and switches", () => {
  const card = read("src/components/codex/CodexModelPoolV2Card.tsx");
  const server = read("src/components/codex/CodexRouterServerPanel.tsx");
  assert.match(card, /codex-card-header/);
  assert.match(card, /codex-pool-avatar/);
  assert.match(card, /codex-pool-auth-summary/);
  assert.match(card, /<CommonSwitch/);
  assert.match(server, /<CommonSwitch/);
  assert.match(card, /codex-pool-edit-btn/);
  assert.match(card, /codex-card-delete-btn/);
  assert.doesNotMatch(card, /type="checkbox"/, "pool status uses the shared switch component");
});

test("V2 Model Pool cards are content-height and match responsive app card grid", () => {
  const panel = read("src/components/codex/CodexModelPoolsV2Panel.tsx");
  const css = read("src/styles/codex/codex-model-pools-v2.css");
  assert.match(panel, /qs-model-pools-grid/);
  assert.match(css, /\.qs-model-pools-grid\s*\{[^}]*align-content:\s*start;/s);
  assert.match(css, /\.qs-model-pool-card\s*\{[^}]*height:\s*auto;/s);
  assert.match(css, /var\(--account-card-columns/);
  assert.match(css, /var\(--card-bg\)/);
  assert.match(css, /var\(--text-secondary\)/);
});

test("V2 Model Pool editor shares QuotaShift account modal components", () => {
  const view = read("src/components/codex/CodexModelPoolV2Editor.tsx");
  assert.match(view, /<AccountModalLayout/);
  assert.match(view, /codex-pool-modal-form/);
  assert.match(view, /<CodexModelPoolV2Members/);
  assert.match(read("src/components/codex/CodexModelPoolV2Members.tsx"), /codex-pool-member-list/);
  assert.match(view, /dialog-btn dialog-btn--secondary/);
  assert.doesNotMatch(view, /custom-dialog-backdrop/);
});

test("Model Pool metadata stays left-aligned in a single horizontal row, not inherited centered columns", () => {
  const card = read("src/components/codex/CodexModelPoolV2Card.tsx");
  const css = read("src/styles/codex/codex-model-pools-v2.css");
  assert.match(card, /className="qs-model-pool-details"/);
  assert.doesNotMatch(
    card,
    /codex-card-row codex-pool-card-row qs-model-pool-details/,
    "legacy flex-column card rows caused the centered vertical metadata stack",
  );
  assert.match(
    css,
    /\.qs-model-pool-details\s*\{[^}]*flex-direction:\s*row;[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-start;/s,
  );
  assert.match(css, /\.qs-model-pool-details\s*\{[^}]*text-align:\s*left;/s);
});

test("V2 editor selects upstream model from scanned member-account results, retaining manual fallback", () => {
  const view = read("src/components/codex/CodexModelPoolV2Editor.tsx");
  const helpers = read("src/components/codex/codex-pool-helpers.ts");
  const panel = read("src/components/codex/CodexModelPoolsV2Panel.tsx");
  const tab = read("src/components/codex/CodexTab.tsx");
  assert.match(view + helpers, /buildCodexTierModelGroups/);
  assert.match(view, /validateCodexPoolModel/);
  assert.match(view, /modelSelectionMode/);
  assert.match(read("src/components/codex/CodexModelPoolV2ModelField.tsx"), /<CommonDropdown/);
  assert.match(panel, /modelCache=\{modelCache\}/);
  assert.match(tab, /modelCache=\{props\.codexModelCache/);
});

test("V2 pool editor explains SIWC account incompatibility before enabling", () => {
  const view = read("src/components/codex/CodexModelPoolV2Editor.tsx");
  assert.match(view, /Select registered ChatGPT plan accounts/);
  assert.match(read("src/components/codex/CodexModelPoolsV2Panel.tsx"), /Existing Codex OAuth/);
  assert.match(view, /SIWC/);
  assert.match(read("src/components/codex/CodexModelPoolV2Policies.tsx"), /<CommonDropdown/);
  assert.doesNotMatch(view, /<select\b/);
});

test("V2 pool editor aligns authorization and routing policy side-by-side in a wider QuotaShift modal", () => {
  const css = read("src/styles/codex/codex-model-pools-v2.css");
  assert.match(css, /\.dialog-box\.qs-model-pool-editor\s*\{[^}]*width:\s*min\(540px,/s);
  assert.match(
    css,
    /\.qs-model-pool-form-split\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s,
  );
});

test("CommonDropdown is rendered in a body portal with viewport-safe floating positioning", () => {
  const component = read("src/components/common/CommonDropdown.tsx");
  assert.match(component, /createPortal/);
  assert.match(component, /document\.body/);
  assert.match(component, /getBoundingClientRect/);
  assert.match(component, /position:\s*"fixed"/);
  assert.match(component, /menuRef/);
});

test("V2 Model Pool editor exposes Max Context Window and Thinking Budget / Effort controls", () => {
  const editor = read("src/components/codex/CodexModelPoolV2Editor.tsx");
  const nameFields = read("src/components/codex/CodexModelPoolV2NameFields.tsx");
  const modelField = read("src/components/codex/CodexModelPoolV2ModelField.tsx");
  const limits = read("src/components/codex/CodexModelPoolV2LimitsFields.tsx");
  const card = read("src/components/codex/CodexModelPoolV2Card.tsx");
  const poolV2 = read("src/utils/codex/codex-pools-v2.ts");
  const css = read("src/styles/codex/codex-model-pools-v2.css");

  assert.match(editor, /<CodexModelPoolV2LimitsFields/);
  assert.match(nameFields, /qs-model-pool-form-split/);
  assert.match(modelField, /qs-model-pool-model-row/);
  assert.match(limits, /qs-model-pool-limits-section/);
  assert.match(limits, /qs-model-pool-preset-btn/);
  assert.match(limits, /maxContextWindowTokens/);
  assert.match(limits, /thinkingBudgetTokens/);
  assert.match(limits, /reasoningEffort/);
  assert.match(poolV2, /getDefaultModelLimits/);
  assert.match(poolV2, /effortForThinkingBudget/);
  assert.match(card, /maxContextWindowTokens/);
  assert.match(css, /\.qs-model-pool-limits-section/);
  assert.match(css, /\.qs-model-pool-preset-btn/);
});
