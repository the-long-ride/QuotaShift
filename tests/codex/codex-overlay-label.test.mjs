import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readWithCssImports } from '../css-helper.mjs';

const appCode = readWithCssImports('src/App.tsx');
const overlayHelpersCode = readFileSync('src/utils/common/app-overlay-helpers.ts', 'utf8');
const overlayCode =
  readFileSync('src/components/overlay/OverlayApp.tsx', 'utf8') +
  (existsSync('src/components/overlay/OverlayCard.tsx')
    ? readFileSync('src/components/overlay/OverlayCard.tsx', 'utf8')
    : '');

test('publishOverlayUpdate preserves the Codex plan for the overlay tier badge', () => {
  assert.match(
    overlayHelpersCode,
    /const rawTier = cache\?\.planName \?\? acc\?\.lastPlan \?\? "Free"/,
    'overlay payload must prefer the same fresh cached plan used by the account card'
  );
  assert.match(
    overlayHelpersCode,
    /const tier = classifyCodexTier\(rawTier,/,
    'overlay payload must canonicalize the detected plan instead of collapsing paid plans'
  );
  assert.doesNotMatch(
    overlayHelpersCode,
    /toUpperCase\(\)\.includes\("PRO"\) \? "PRO" : "FREE"/,
    'PLUS, GO, BUSINESS, ENTERPRISE, and EDU must not collapse to FREE/PRO'
  );
  assert.match(
    overlayCode,
    /provider === "codex"\) return classifyCodexTier\(tier, true\)/,
    'overlay badge must use the shared Codex tier classifier'
  );
});

test('publishOverlayUpdate maps rate limit windows to 5H, WK, and MO for singleBars', () => {
  assert.match(
    appCode,
    /"5H"/,
    'App.tsx singleBars must map 5h window to "5H"'
  );
  assert.match(
    appCode,
    /"WK"/,
    'App.tsx singleBars must map weekly window to "WK"'
  );
  assert.match(
    appCode,
    /"MO"/,
    'App.tsx singleBars must map monthly window to "MO"'
  );
});

test('OverlayApp BarRow component converts 5h, weekly, and monthly rowLabel to compact labels', () => {
  assert.match(
    overlayCode,
    /label\s*=\s*l\.includes\("month"\)[\s\S]*?"MO"[\s\S]*?"5H"[\s\S]*?"WK"[\s\S]*?rowLabel/,
    'OverlayApp BarRow must map labels to compact 5H, WK, MO to prevent text overflow'
  );
});

test('Simulated label resolution matches expected behavior for various window types', () => {
  const resolveOverlayLabel = (kind, label) => {
    const l = (label || '').toLowerCase();
    if (kind === '5h' || l.includes('5h')) return '5H';
    if (kind === 'weekly' || l.includes('week')) return 'WK';
    if (kind === 'monthly' || l.includes('month')) return 'MO';
    return label;
  };

  const resolveFallbackLabel = (rowLabel) => {
    const l = rowLabel.toLowerCase();
    return l.includes('month') ? 'MO' : l.includes('5h') ? '5H' : (l.includes('week') || l === 'wk') ? 'WK' : rowLabel;
  };

  assert.equal(resolveOverlayLabel('5h', '5H LIMIT'), '5H');
  assert.equal(resolveOverlayLabel('5h', '5h limit'), '5H');
  assert.equal(resolveOverlayLabel('weekly', 'Weekly limit'), 'WK');
  assert.equal(resolveOverlayLabel('weekly', 'WEEKLY LIMIT'), 'WK');
  assert.equal(resolveOverlayLabel('monthly', 'Monthly limit'), 'MO');
  assert.equal(resolveOverlayLabel('monthly', 'MONTHLY LIMIT'), 'MO');
  assert.equal(resolveFallbackLabel('5H LIMIT'), '5H');
  assert.equal(resolveFallbackLabel('5h'), '5H');
  assert.equal(resolveFallbackLabel('Weekly limit'), 'WK');
  assert.equal(resolveFallbackLabel('WEEKLY LIMIT'), 'WK');
  assert.equal(resolveFallbackLabel('Wk'), 'WK');
  assert.equal(resolveFallbackLabel('Monthly limit'), 'MO');
  assert.equal(resolveFallbackLabel('Ctx'), 'Ctx');
});

test('Codex reset count uses the shared control before the tier badge', () => {
  const codexCard = readFileSync('src/components/codex/CodexAccountCard.tsx', 'utf8');
  const resetCount = readFileSync('src/components/common/AccountResetCount.tsx', 'utf8');
  assert.match(codexCard, /<AccountResetCount[\s\S]*?count=\{availableResets\}/);
  assert.ok(
    codexCard.indexOf('<AccountResetCount') < codexCard.indexOf('className="codex-card-tier-badge"'),
  );
  assert.match(resetCount, /count <= 0 \|\| !onClick/);
  assert.match(resetCount, /formatResetCount\(count\)/);
});

test('codex-cards.css defines smaller 8px font size for meta and link with dotted underline', () => {
  const codexCardsCss = readFileSync('src/styles/codex/codex-cards.css', 'utf8');
  assert.match(codexCardsCss, /\.codex-card-meta\s*\{[\s\S]*?font-size:\s*8px;/);
  assert.match(codexCardsCss, /\.codex-card-meta--link\s*\{[\s\S]*?font-size:\s*8px;/);
  assert.match(codexCardsCss, /\.codex-card-meta--link\s*\{[\s\S]*?text-decoration-style:\s*dotted;/);
});

test('CodexResetCreditsDialog is compact and only displays local time without UTC', () => {
  const dialogCode = readFileSync('src/components/codex/CodexResetCreditsDialog.tsx', 'utf8');
  const sharedDialog = readFileSync('src/components/common/ResetCreditsDialog.tsx', 'utf8');
  assert.match(sharedDialog, /width:\s*["']320px["']/);
  assert.match(dialogCode, /<ResetCreditsDialog/);
  assert.match(dialogCode, /expires\.local/);
  assert.match(dialogCode, /granted\.local/);
  assert.doesNotMatch(dialogCode, /expires\.utc/);
  assert.doesNotMatch(dialogCode, /granted\.utc/);
  assert.doesNotMatch(dialogCode, /\(UTC\)/);
});

test('dialog-box codex-model-dialog padding is halved and plans are rendered uppercase', () => {
  const poolsCss = readFileSync('src/styles/codex/codex-pools.css', 'utf8');
  const cardsCss = readFileSync('src/styles/codex/codex-cards.css', 'utf8');
  const dialogCode = readFileSync('src/components/codex/CodexResetCreditsDialog.tsx', 'utf8');
  const sharedDialog = readFileSync('src/components/common/ResetCreditsDialog.tsx', 'utf8');
  const resetCss = readFileSync('src/styles/accounts/reset-credits-dialog.css', 'utf8');
  const tabCode =
    readFileSync('src/components/codex/CodexTab.tsx', 'utf8') +
    (existsSync('src/components/codex/CodexAccountCard.tsx')
      ? readFileSync('src/components/codex/CodexAccountCard.tsx', 'utf8')
      : '');

  // Padding reduced by half (8px 10px instead of 16px 20px)
  assert.match(poolsCss, /\.dialog-box\.codex-model-dialog\s*\{[\s\S]*?padding:\s*8px\s+10px;/);

  // Plan uppercase in account cards and modal
  assert.match(cardsCss, /\.codex-card-plan\s*\{[\s\S]*?text-transform:\s*uppercase;/);
  assert.match(tabCode, /planText\s*=\s*classifyCodexTier\(\s*cache\?\.planName \?\? acc\.lastPlan/);
  assert.match(resetCss, /text-transform:\s*uppercase;/);
  assert.match(dialogCode, /account\.lastPlan\s*\?\?\s*["']Plan unknown["']\)\.toUpperCase\(\)/);

  // Text aligned to left, values aligned to right in reset card, remain placed at Available badge
  assert.match(dialogCode, /remain !== ["']N\/A["'] \? remain : item\.status \|\| ["']available["']/);
  assert.doesNotMatch(sharedDialog, /<span>Expires:<\/span>/);
  assert.match(resetCss, /justify-content:\s*space-between;/);
  assert.match(sharedDialog, /Expiry:/);

});
