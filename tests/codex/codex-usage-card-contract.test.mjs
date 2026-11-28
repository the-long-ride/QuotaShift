import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readWithCssImports } from "../css-helper.mjs";

// Source contracts keep the account card response-driven at the App/UI boundary.
const read = (path) => readWithCssImports(path);

const slice = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  const tail = source.slice(from);
  const to = tail.indexOf(end);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return tail.slice(0, to);
};

test("Codex account cards render normalized response windows instead of plan heuristics", () => {
  const tab =
    read("src/components/codex/CodexTab.tsx") +
    (fs.existsSync("src/components/codex/cards/CodexAccountCard.tsx")
      ? read("src/components/codex/cards/CodexAccountCard.tsx")
      : "");

  assert.match(tab, /normalizeCodexUsageWindows/);
  assert.match(tab, /normalizeCodexUsageWindows\(\s*cache\.rate_limit,?\s*\)/);
  assert.doesNotMatch(tab, /getLimitLabel/);
  assert.doesNotMatch(tab, /reset_at\s*&&\s*cache\.primary\.reset_at\s*-\s*Date\.now/);
});

test("Codex OAuth cache preserves explicit response windows without plan-based remapping", () => {
  const fetcher = read("src/hooks/codex/useCodexUsageFetcher.ts");
  const merge = read("src/utils/codex/codex-usage-merge.ts");
  const usage = slice(fetcher, "const fetchAccountUsage = async", "return {");

  assert.match(usage, /buildMergedCodexUsageEntry\(/);
  assert.match(merge, /const primary = mergedLimits\.primary_window \|\| null/);
  assert.match(
    merge,
    /const secondary = mergedLimits\.secondary_window \|\| mergedLimits\.weekly_window \|\| null/,
  );
  assert.match(
    merge,
    /const monthly = mergedLimits\.monthly_window \|\| mergedLimits\.month_window \|\| null/,
  );
  assert.doesNotMatch(usage + merge, /isPlusOrAbove/);
  assert.doesNotMatch(usage + merge, /isPlusOrAbove \? rawMonthly : null/);
});
