import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readWithCssImports } from './css-helper.mjs';

const read = (path) => readWithCssImports(path);

test('CodexTab uses double-click to track and single-click does nothing', () => {
  const code = read('src/components/codex/CodexTab.tsx');

  // Single click does nothing
  assert.match(code, /const handleCardClick = \(\) => \{/);
  assert.match(code, /Single click does nothing; double-click marks as tracked/);

  // Double click calls onTrack
  assert.match(code, /const handleCardDoubleClick = \(account: CodexAccount\) => \{/);
  assert.match(code, /onTrack\(account\)/);
  assert.match(code, /onDoubleClick=\{.*handleCardDoubleClick/);

  // Email copy handler and tooltip
  assert.match(code, /const handleCopyEmail = async \(id: string, email: string/);
  assert.match(code, /copiedEmailId === acc\.id \? "Copied" : "Click to copy email"/);
  assert.match(code, /window\.dispatchEvent\(\s*new CustomEvent\("show-tooltip",\s*\{\s*detail:\s*\{\s*target:\s*targetEl,\s*text:\s*"Copied"/);

  // Hint text
  assert.match(code, /Double-click a card to monitor in tray/);
});

test('AntigravityTab uses double-click to track and single-click does nothing', () => {
  const code = read('src/components/antigravity/AntigravityTab.tsx');

  // Single click does nothing
  assert.match(code, /const handleCardClick = \(\) => \{/);
  assert.match(code, /Single click does nothing; double-click marks as tracked/);

  // Double click calls onTrack
  assert.match(code, /const handleCardDoubleClick = \(account: AntigravityAccount\) => \{/);
  assert.match(code, /onTrack\(account\)/);
  assert.match(code, /onDoubleClick=\{.*handleCardDoubleClick/);

  // Email copy handler and tooltip for monitored accounts and local session
  assert.match(code, /const handleCopyEmail = async \(id: string, email: string/);
  assert.match(code, /copiedEmailId === acc\.id \? "Copied" : "Click to copy email"/);
  assert.match(code, /copiedEmailId === "local-session" \? "Copied" : "Click to copy email"/);
  assert.match(code, /window\.dispatchEvent\(\s*new CustomEvent\("show-tooltip",\s*\{\s*detail:\s*\{\s*target:\s*targetEl,\s*text:\s*"Copied"/);

  // Hint text
  assert.match(code, /Double-click a card to monitor in tray/);
});

test('Tooltip listens to show-tooltip custom event and centers over text range', () => {
  const code = read('src/components/common/Tooltip.tsx');

  assert.match(code, /window\.addEventListener\("show-tooltip",\s*handleShowCustomTooltip\)/);
  assert.match(code, /window\.removeEventListener\("show-tooltip",\s*handleShowCustomTooltip\)/);
  assert.match(code, /range\.selectNodeContents\(target\)/);
  assert.match(code, /range\.getBoundingClientRect\(\)/);
});

test('Account cards constrain email span without stretching with flex: 1', () => {
  const codexCode = read('src/components/codex/CodexTab.tsx');
  const agyCode = read('src/components/antigravity/AntigravityTab.tsx');

  const codexSpans = codexCode.match(/className="codex-card-email-info"[\s\S]*?<\/span>/g) ?? [];
  assert.ok(codexSpans.length > 0);
  for (const span of codexSpans) {
    assert.match(span, /maxWidth:\s*"100%"/);
    assert.doesNotMatch(span, /flex:\s*1/);
  }

  const agySpans = agyCode.match(/className="codex-card-email-info"[\s\S]*?<\/span>/g) ?? [];
  assert.ok(agySpans.length > 0);
  for (const span of agySpans) {
    assert.match(span, /maxWidth:\s*"100%"/);
    assert.doesNotMatch(span, /flex:\s*1/);
  }
});

test('dialog-box--account sizes to content and does not force 370px min-height', () => {
  const css = read('src/styles.css');

  assert.match(css, /\.dialog-box--account\s*\{[^}]*min-height:\s*auto;/);
  assert.doesNotMatch(css, /\.dialog-box--account\s*\{[^}]*min-height:\s*370px;/);
});

test('AntigravityAccountActions uses codex-card-refresh-btn matching Codex', () => {
  const code = read('src/components/antigravity/AntigravityAccountActions.tsx');

  // Should use SVG icon instead of text
  assert.doesNotMatch(code, />\s*Refresh exact\s*</);
  assert.doesNotMatch(code, />\s*Working…\s*</);
  assert.match(code, /className=\{`codex-card-refresh-btn\$\{cache\?\.loading \? " spinning" : ""\}`\}/);
  assert.match(code, /<svg viewBox="0 0 24 24" width="11" height="11"/);
  assert.match(code, /data-tooltip="Refresh quota for this account"/);
});

test('App.tsx prompts with CustomDialog confirmation before deleting Antigravity or Codex accounts', () => {
  const code = read('src/App.tsx');
  const dialogCode = read('src/components/common/CustomDialog.tsx');
  const css = read('src/styles/modals.css');

  assert.match(code, /accountPendingDelete/);
  assert.match(code, /<CustomDialog[\s\S]*?Remove Account/);
  assert.match(code, /confirmText="Delete"/);
  assert.match(code, /confirmVariant="danger"/);
  assert.match(code, /messageAlign="left"/);
  assert.match(code, /accountPendingDelete\.email && accountPendingDelete\.name/);
  assert.match(code, /handleDeleteAntigravityAccount = async \(acc: AntigravityAccount\) => \{[\s\S]*?setAccountPendingDelete/);
  assert.match(code, /handleDeleteCodexAccount = async \(acc: CodexAccount\) => \{[\s\S]*?setAccountPendingDelete/);

  assert.match(dialogCode, /confirmVariant === "danger"\s*\?\s*"dialog-btn--danger"/);
  assert.match(dialogCode, /messageAlign === "left"\s*\?\s*"dialog-message--left"/);

  assert.match(css, /\.dialog-message--left\s*\{[^}]*text-align:\s*left;/);
  assert.match(css, /\.dialog-btn--danger\s*\{[^}]*background:\s*#dc2626;/);
});

test('Header settings dropdown uses codex-pool-switch buttons and wider menu width', () => {
  const header = read('src/components/common/Header.tsx');
  const css = read('src/styles/panel.css');

  assert.match(header, /codex-pool-switch/);
  assert.match(header, /codex-pool-switch-thumb/);
  assert.doesNotMatch(header, /gear-toggle-dot/);
  assert.match(css, /\.gear-dropdown\s*\{[^}]*min-width:\s*calc\(175px\s*\+\s*2rem\);/);
});


