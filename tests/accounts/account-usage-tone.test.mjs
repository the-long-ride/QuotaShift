import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("account-card usage tone helper maps remaining quota to normal, warning, and critical", async () => {
  const { getUsageTone } = await import("../../.test-build/common/usage-tone.js");
  assert.equal(getUsageTone(100), "normal");
  assert.equal(getUsageTone(20), "normal");
  assert.equal(getUsageTone(19.9), "warning");
  assert.equal(getUsageTone(10), "warning");
  assert.equal(getUsageTone(9.9), "critical");
  assert.equal(getUsageTone(0), "critical");
  assert.equal(getUsageTone(null), "normal");
});

test("all account and pool usage views attach the global usage tone to remaining percentages", () => {
  const antigravity = read("src/components/antigravity/AntigravityQuotaRows.tsx");
  const codex = read("src/components/codex/CodexCardUsageLimits.tsx");
  const claudeCards = read("src/components/claude/ClaudeAccountCards.tsx");
  const poolUsage = read("src/components/codex/CodexPoolUsageModal.tsx");

  assert.match(
    antigravity,
    /data-usage-tone=\{getUsageTone\(lane\.known \? lane\.percent : null\)\}/,
  );
  assert.match(codex, /data-usage-tone=\{getUsageTone\(pct\)\}/);
  assert.match(claudeCards, /data-usage-tone=\{getUsageTone\(remaining\)\}/);
  assert.match(poolUsage, /data-usage-tone=\{getUsageTone\(limit\.remainingPercent\)\}/);
});

test("warning and critical tones color both account-card bars and percentage values", () => {
  const panel = read("src/styles/shared/panel.css");
  const claude = read("src/styles/claude/claude.css") + read("src/styles/claude/claude-accounts.css");

  assert.match(panel, /data-usage-tone="warning"[\s\S]*\.progress-bar[\s\S]*background:\s*#f97316/);
  assert.match(panel, /data-usage-tone="warning"[\s\S]*\.quota-value[\s\S]*color:\s*#f97316/);
  assert.match(
    panel,
    /data-usage-tone="critical"[\s\S]*\.progress-bar[\s\S]*background:\s*#b91c1c/,
  );
  assert.match(panel, /data-usage-tone="critical"[\s\S]*\.quota-value[\s\S]*color:\s*#b91c1c/);

  assert.match(claude, /claude-account-card[\s\S]*data-usage-tone="warning"[\s\S]*progress-bar/);
  assert.match(claude, /claude-account-card[\s\S]*data-usage-tone="critical"[\s\S]*quota-value/);
});

test("compact account cards preserve warning and critical percentage colors", () => {
  const compact = read("src/styles/desktop/compact-mode.css");
  assert.match(
    compact,
    /\[data-card-mode="compact"\][\s\S]*data-usage-tone="warning"[\s\S]*\.quota-value[\s\S]*#f97316/,
  );
  assert.match(
    compact,
    /\[data-card-mode="compact"\][\s\S]*data-usage-tone="critical"[\s\S]*\.quota-value[\s\S]*#b91c1c/,
  );
});

test("pool modal percentage values use the same global warning and critical colors", () => {
  const flow = read("src/styles/accounts/account-card-flow.css");
  assert.match(
    flow,
    /\.codex-pool-member-usage-percent\[data-usage-tone="warning"\][\s\S]*color:\s*#f97316/,
  );
  assert.match(
    flow,
    /\.codex-pool-member-usage-percent\[data-usage-tone="critical"\][\s\S]*color:\s*#b91c1c/,
  );
});
