import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Source contracts keep the account card response-driven at the App/UI boundary.
const read = (path) => fs.readFileSync(path, 'utf8');

const slice = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  const tail = source.slice(from);
  const to = tail.indexOf(end);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return tail.slice(0, to);
};

test('Codex account cards render normalized response windows instead of plan heuristics', () => {
  const tab = read('src/components/codex/CodexTab.tsx');

  assert.match(tab, /normalizeCodexUsageWindows/);
  assert.match(tab, /normalizeCodexUsageWindows\(cache\.rate_limit\)/);
  assert.doesNotMatch(tab, /getLimitLabel/);
  assert.doesNotMatch(tab, /reset_at\s*&&\s*cache\.primary\.reset_at\s*-\s*Date\.now/);
});

test('Codex OAuth cache preserves explicit response windows without plan-based remapping', () => {
  const app = read('src/App.tsx');
  const usage = slice(app, 'const fetchAccountUsage = async', 'const maybeAutoFailoverActiveCodexPool');

  assert.match(usage, /const primary = limits\.primary_window \|\| null/);
  assert.match(usage, /const secondary = limits\.secondary_window \|\| limits\.weekly_window \|\| null/);
  assert.match(usage, /const monthly = limits\.monthly_window \|\| limits\.month_window \|\| null/);
  assert.doesNotMatch(usage, /isPlusOrAbove/);
  assert.doesNotMatch(usage, /isPlusOrAbove \? rawMonthly : null/);
});
