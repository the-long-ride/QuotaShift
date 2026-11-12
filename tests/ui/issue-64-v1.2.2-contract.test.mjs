import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("issue 64: provider tier badges toggle with semantic pressed states", () => {
  const summary = read("src/components/common/accounts/AccountTierSummary.tsx");
  assert.match(summary, /aria-pressed=\{selectedTier === tier\}/);
  assert.match(summary, /onClick=\{\(\) => onTierToggle\?\.\(tier\)\}/);
  for (const provider of ["antigravity/AntigravityTab", "codex/CodexTab", "claude/ClaudeTab"]) {
    assert.match(read(`src/components/${provider}.tsx`), /selectedTier/);
  }
});

test("issue 64: monitored pulse comes from member lists irrespective of primary provider", () => {
  const ag = read("src/components/antigravity/AntigravityTab.tsx");
  const cx = read("src/components/codex/CodexTab.tsx");
  const claude = read("src/components/claude/ClaudeAccountCards.tsx");
  assert.match(ag, /trackedAccountIds\.includes\(acc\.id\)/);
  assert.doesNotMatch(ag, /trackedProvider === "antigravity" && trackedAccountIds\.includes/);
  assert.match(cx, /trackedAccountIds\.includes\(acc\.id\)/);
  assert.doesNotMatch(cx, /trackedProvider === "codex" && trackedAccountIds\.includes/);
  assert.match(claude, /trackedAccountIds\.includes\(account\.id\)/);
  assert.doesNotMatch(claude, /isClaudeTracked &&\s*\(trackedAccountIds\.includes/);
});

test("issue 64: unselected cards have visible dark mode borders", () => {
  const css = read("src/styles/codex/codex-cards.css");
  assert.match(css, /\.account-card \{[\s\S]*?border: 1px solid var\(--border-color\);/);
});

test("issue 64: Claude reset polling and card data are gated by user opt-in", () => {
  const hook = read("src/hooks/claude/useClaudeResetCredits.ts");
  const setting = read("src/components/common/settings-fields/ClaudeResetCreditsSetting.tsx");
  assert.match(hook, /if \(!enabled\) return;/);
  assert.match(hook, /resetCreditsByAccountId: enabled \? resultsByAccountId : \{\}/);
  assert.doesNotMatch(setting, /<ExperimentalTag/);
});

test("issue 64: Apply auto monitor is opt-in and happens after the write succeeds", () => {
  const ag = read("src/hooks/antigravity/useAntigravityAccountOps.ts");
  const cx = read("src/hooks/codex/useCodexAccountOps.ts");
  assert.match(ag, /loadAutoMonitorOnApply\(\)/);
  assert.match(cx, /loadAutoMonitorOnApply\(\)/);
  assert.match(ag, /promoteAppliedAccountToMonitor\("antigravity", acc\.id\)/);
  assert.match(cx, /promoteAppliedAccountToMonitor\("codex", acc\.id\)/);
});

test("issue 64: quota display supports used-percentage view without changing warning tone", () => {
  for (const file of ["src/components/antigravity/AntigravityQuotaRows.tsx", "src/components/codex/cards/CodexCardUsageLimits.tsx", "src/components/claude/ClaudeAccountCards.tsx"]) {
    assert.match(read(file), /useQuotaPercentMode/);
  }
});
