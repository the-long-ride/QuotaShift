import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyClaudeTier,
  computeClaudeTierSummary,
} from "../../.test-build/claude-tier-summary.js";
import { readWithCssImports } from "../css-helper.mjs";

function status(id, subscriptionType, rateLimitTier = null) {
  return {
    account: {
      id,
      configDir: `C:/profiles/${id}`,
      profileName: id,
      subscriptionType,
      rateLimitTier,
      expiresAt: null,
      expired: false,
      email: `${id}@example.com`,
      organizationName: null,
      source: "test",
    },
    fiveHour: null,
    sevenDay: null,
    usageFresh: true,
    usageFetchedAt: null,
    suspended: false,
    suspendedProcessCount: 0,
    error: null,
  };
}

test("classifyClaudeTier normalizes Claude subscription tiers", () => {
  assert.equal(classifyClaudeTier("free"), "FREE");
  assert.equal(classifyClaudeTier("pro"), "PRO");
  assert.equal(classifyClaudeTier("max"), "MAX");
  assert.equal(classifyClaudeTier("max_20x"), "MAX");
  assert.equal(classifyClaudeTier("team"), "TEAM");
  assert.equal(classifyClaudeTier("business"), "TEAM");
  assert.equal(classifyClaudeTier("enterprise"), "ENTERPRISE");
  assert.equal(classifyClaudeTier("education"), "ENTERPRISE");
  assert.equal(classifyClaudeTier("tier_1"), "OTHER");
  assert.equal(classifyClaudeTier(null), "OTHER");
});

test("computeClaudeTierSummary returns total and non-zero per-tier subtotals", () => {
  const result = computeClaudeTierSummary([
    status("a", "pro"),
    status("b", "max"),
    status("c", "max_20x"),
    status("d", "team"),
    status("e", null, "tier_1"),
  ]);

  assert.equal(result.total, 5);
  assert.deepEqual(result.badges, [
    { tier: "PRO", count: 1 },
    { tier: "MAX", count: 2 },
    { tier: "TEAM", count: 1 },
    { tier: "OTHER", count: 1 },
  ]);
  assert.equal(
    result.badges.reduce((total, badge) => total + badge.count, 0),
    result.total,
  );
});

test("ClaudeTab account bar matches Codex summary layout while omitting Best", () => {
  const tab = fs.readFileSync("src/components/claude/ClaudeTab.tsx", "utf8");
  const summary = fs.readFileSync("src/components/common/AccountTierSummary.tsx", "utf8");
  const css = readWithCssImports("src/styles.css");

  assert.match(tab, /computeClaudeTierSummary/);
  assert.match(tab, /<AccountTierSummary/);
  assert.match(tab, /totalTooltip="Total Claude Code accounts"/);
  assert.match(tab, /account-bar-actions/);
  assert.match(summary, /account-bar-summary/);
  assert.match(summary, /account-bar-total/);
  assert.match(summary, /badges\.length > 0/);
  assert.match(summary, /account-tier-badge/);
  assert.match(summary, /account-tier-badge-sep/);
  assert.doesNotMatch(tab, />\s*Best\s*</);
  assert.match(css, /\.account-tier-badge--max/);
  assert.match(css, /\.account-tier-badge--other/);
});
