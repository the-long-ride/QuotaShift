import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("maximized main window removes app corner radius and restores state tracking", () => {
  const controls = read("src/components/common/WindowControls.tsx");
  const css = read("src/styles/desktop/window-controls.css");

  assert.match(
    controls,
    /document\.documentElement\.setAttribute\("data-window-maximized", value \? "true" : "false"\)/,
  );
  assert.match(controls, /\.isMaximized\(\)[\s\S]*\.then\(applyMaximizedState\)/);
  assert.match(
    css,
    /:root\[data-window-maximized="true"\] \.app-container\s*\{[\s\S]*border-radius:\s*0;/,
  );
});

test("account lists use one unbounded shared column calculation", () => {
  const imports = read("src/styles.css");
  const css = read("src/styles/accounts/account-card-flow.css");
  const hook = read("src/hooks/accounts/useAccountCardGridColumns.ts");
  const ag = read("src/components/antigravity/AntigravityTab.tsx");
  const codex = read("src/components/codex/CodexTab.tsx");
  const claude = read("src/components/claude/ClaudeAccountCards.tsx");

  assert.match(imports, /@import "\.\/styles\/accounts\/account-card-flow\.css";/);
  assert.match(
    css,
    /grid-template-columns:\s*repeat\(var\(--account-card-columns, 1\), minmax\(0, 1fr\)\);/,
  );
  assert.doesNotMatch(css, /@media \(min-width: 7350px\)|repeat\(17, minmax/);
  assert.match(hook, /window\.innerWidth/);
  assert.match(hook, /accountCardColumnCount/);
  assert.match(ag, /useAccountCardGridColumns\(\)/);
  assert.match(codex, /useAccountCardGridColumns\(\)/);
  assert.match(claude, /useAccountCardGridColumns\(\)/);
  assert.match(
    css,
    /\.tab-panel--antigravity \.monitored-account-list\s*\{[\s\S]*display:\s*contents;/,
  );
});
test("expanded account rows put compact-style tier badges before email", () => {
  const css = read("src/styles/accounts/account-card-flow.css");
  const codex = read("src/components/codex/CodexAccountCard.tsx");
  const ag = read("src/components/antigravity/AntigravityTab.tsx");
  const codexPlan = read("src/components/codex/CodexCardPlan.tsx");
  const agPlan = read("src/components/antigravity/AntigravityCardPlan.tsx");

  assert.match(
    css,
    /\.account-card-plan-badge\s*\{[\s\S]*padding:\s*1px 4px;[\s\S]*border-radius:\s*3px;[\s\S]*font-size:\s*7\.5px;[\s\S]*font-weight:\s*700;[\s\S]*text-transform:\s*uppercase;/,
  );
  assert.match(codexPlan, /className="account-card-plan-badge"/);
  assert.match(agPlan, /className="account-card-plan-badge"/);

  const codexRow = codex.slice(codex.indexOf("account-card-email-tier-row"));
  assert.ok(codexRow.indexOf("<CodexCardPlan") < codexRow.indexOf("codex-card-email-info"));

  const agRow = ag.slice(ag.indexOf("account-card-email-tier-row"));
  assert.ok(agRow.indexOf("<AntigravityCardPlan") < agRow.indexOf("codex-card-email-info"));
});

test("expanded aliases stay left while card actions remain pinned right", () => {
  const css = read("src/styles/accounts/account-card-flow.css");
  assert.match(css, /\.codex-card-header\s*\{[\s\S]*justify-content:\s*flex-start;/);
  assert.match(
    css,
    /\.codex-card-title-wrap\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*justify-content:\s*flex-start;[\s\S]*text-align:\s*left;/,
  );
  assert.match(css, /\.codex-card-header-actions\s*\{[\s\S]*margin-left:\s*auto;/);
});

test("Antigravity compact cards hide duplicate header email and tier metadata", () => {
  const header = read("src/components/antigravity/AntigravityCardHeader.tsx");
  const compact = read("src/styles/desktop/compact-mode.css");

  assert.match(header, /className="codex-card-header-email"/);
  assert.match(header, /className="codex-card-tier-badge"/);
  assert.match(
    compact,
    /\[data-card-mode="compact"\] \.tab-panel--antigravity \.codex-card-header-email,[\s\S]*\.tab-panel--antigravity \.codex-card-tier-badge\s*\{[\s\S]*display:\s*none\s*!important;/,
  );
  assert.doesNotMatch(
    compact,
    /\[data-card-mode="compact"\] \.tab-panel--antigravity \.codex-card-email-info\s*\{[^}]*display:\s*none/,
  );
});

test("local Antigravity session capture remains available from Add Account", () => {
  const tab = read("src/components/antigravity/AntigravityTab.tsx");
  const app = read("src/App.tsx");
  const modal = read("src/components/antigravity/AddAntigravityAccountModal.tsx");

  assert.doesNotMatch(tab, /AntigravityLocalSessionCard|local-session-card/);
  assert.match(tab, /onClick=\{onAddAccountClick\}/);
  assert.match(
    tab,
    /data-tooltip="Connect an Antigravity account or capture the active local session"/,
  );
  assert.match(app, /onAddAccountClick=\{\(\) => setAddAgOpen\(true\)\}/);
  assert.match(modal, /<AntigravityCaptureTab/);
});

test("flow-layout reorder captures 2D geometry and shows clear drag feedback", () => {
  const hook = read("src/hooks/accounts/usePointerCardReorder.ts");
  const util = read("src/utils/account/pointer-reorder.ts");
  const css = read("src/styles/accounts/account-card-flow.css");
  const codex = read("src/components/codex/CodexTab.tsx");
  const ag = read("src/components/antigravity/AntigravityTab.tsx");

  assert.match(hook, /left:\s*rect\.left/);
  assert.match(hook, /right:\s*rect\.right/);
  assert.match(hook, /grabOffsetX/);
  assert.match(util, /pointerX\?: number/);
  assert.match(util, /draggedCenterX/);
  assert.match(util, /dx \* dx \+ dy \* dy/);
  assert.match(codex, /account-card-grid--reordering/);
  assert.match(ag, /account-card-grid--reordering/);
  assert.match(
    css,
    /\.account-card-grid--reordering \.account-card--dragging\s*\{[\s\S]*transform:\s*scale\(1\.012\);[\s\S]*box-shadow:/,
  );
});
