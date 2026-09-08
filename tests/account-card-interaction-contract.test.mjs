import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('CodexTab uses double-click to track and single-click does nothing', () => {
  const code = read('src/components/CodexTab.tsx');

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
  const code = read('src/components/AntigravityTab.tsx');

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
  const code = read('src/components/Tooltip.tsx');

  assert.match(code, /window\.addEventListener\("show-tooltip",\s*handleShowCustomTooltip\)/);
  assert.match(code, /window\.removeEventListener\("show-tooltip",\s*handleShowCustomTooltip\)/);
  assert.match(code, /range\.selectNodeContents\(target\)/);
  assert.match(code, /range\.getBoundingClientRect\(\)/);
});

test('Account cards constrain email span without stretching with flex: 1', () => {
  const codexCode = read('src/components/CodexTab.tsx');
  const agyCode = read('src/components/AntigravityTab.tsx');

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
