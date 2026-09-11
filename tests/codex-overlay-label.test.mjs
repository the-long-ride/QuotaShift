import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appCode = readFileSync('src/App.tsx', 'utf8');
const overlayCode = readFileSync('src/components/overlay/OverlayApp.tsx', 'utf8');

test('publishOverlayUpdate maps rate limit windows to 5H, WK, and MO for singleBars', () => {
  assert.match(
    appCode,
    /tier = cache\?\.planName\?\.toUpperCase\(\)\.includes\("PRO"\) \? "PRO" : "FREE"/,
    'App.tsx must calculate tier before constructing overlay payload'
  );
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
    /label = l\.includes\("month"\) \? "MO" : l\.includes\("5h"\) \? "5H" : \(l\.includes\("week"\) \|\| l === "wk"\) \? "WK" : rowLabel/,
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

test('CodexTab renders 0 resets as raw text without click action, and >0 resets as link', () => {
  const codexTabCode = readFileSync('src/components/codex/CodexTab.tsx', 'utf8');
  assert.match(codexTabCode, /canOpenResets\s*=\s*availableResets\s*>\s*0/);
  assert.match(codexTabCode, /canOpenResets\s*\?[\s\S]*?<button[\s\S]*?codex-card-meta--link/);
  assert.match(codexTabCode, /:\s*\(\s*<span\s+className="codex-card-meta"[\s\S]*?\{resetsSummary\}\s*<\/span>/);
});

test('codex-cards.css defines smaller 8px font size for meta and link with dotted underline', () => {
  const codexCardsCss = readFileSync('src/styles/codex-cards.css', 'utf8');
  assert.match(codexCardsCss, /\.codex-card-meta\s*\{[\s\S]*?font-size:\s*8px;/);
  assert.match(codexCardsCss, /\.codex-card-meta--link\s*\{[\s\S]*?font-size:\s*8px;/);
  assert.match(codexCardsCss, /\.codex-card-meta--link\s*\{[\s\S]*?text-decoration-style:\s*dotted;/);
});

test('CodexResetCreditsDialog is compact and only displays local time without UTC', () => {
  const dialogCode = readFileSync('src/components/codex/CodexResetCreditsDialog.tsx', 'utf8');
  assert.match(dialogCode, /width:\s*["']320px["']/);
  assert.match(dialogCode, /expires\.local/);
  assert.match(dialogCode, /granted\.local/);
  assert.doesNotMatch(dialogCode, /expires\.utc/);
  assert.doesNotMatch(dialogCode, /granted\.utc/);
  assert.doesNotMatch(dialogCode, /\(UTC\)/);
});

test('dialog-box codex-model-dialog padding is halved and plans are rendered uppercase', () => {
  const poolsCss = readFileSync('src/styles/codex-pools.css', 'utf8');
  const cardsCss = readFileSync('src/styles/codex-cards.css', 'utf8');
  const dialogCode = readFileSync('src/components/codex/CodexResetCreditsDialog.tsx', 'utf8');
  const tabCode = readFileSync('src/components/codex/CodexTab.tsx', 'utf8');

  // Padding reduced by half (8px 10px instead of 16px 20px)
  assert.match(poolsCss, /\.dialog-box\.codex-model-dialog\s*\{[\s\S]*?padding:\s*8px\s+10px;/);

  // Plan uppercase in account cards and modal
  assert.match(cardsCss, /\.codex-card-plan\s*\{[\s\S]*?text-transform:\s*uppercase;/);
  assert.match(tabCode, /planText\s*=\s*\(acc\.lastPlan\s*\|\|\s*["']—["']\)\.toUpperCase\(\)/);
  assert.match(dialogCode, /textTransform:\s*["']uppercase["']/);
  assert.match(dialogCode, /account\.lastPlan\s*\?\?\s*["']Plan unknown["']\)\.toUpperCase\(\)/);

  // Text aligned to left, values aligned to right in reset card, remain placed at Available badge
  assert.match(dialogCode, /remain && remain !== ["']N\/A["'] \? remain : \(item\.status \|\| ["']available["']\)/);
  assert.doesNotMatch(dialogCode, /<span>Expires:<\/span>/);
  assert.match(dialogCode, /justifyContent:\s*["']space-between["'][\s\S]*?Expiry:/);

  // Local session state badge removed in AntigravityTab
  const agCode = readFileSync('src/components/antigravity/AntigravityTab.tsx', 'utf8');
  assert.doesNotMatch(agCode, /local-session-state/);
});
