import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { classifyCodexTier } from "../.test-build/codex/codex-tier-summary.js";
import { classifyClaudeTier } from "../.test-build/claude/claude-tier-summary.js";
import { classifyAntigravityTier } from "../.test-build/antigravity/antigravity-tier-summary.js";

const read = (path) => fs.readFileSync(path, "utf8");

test("current provider tier catalog keeps official plan families distinct", () => {
  for (const [raw, expected] of [
    ["Free", "FREE"],
    ["ChatGPT Go", "GO"],
    ["ChatGPT Plus", "PLUS"],
    ["ChatGPT Pro", "PRO"],
    ["ChatGPT Business", "BUSINESS"],
    ["ChatGPT Team", "BUSINESS"],
    ["ChatGPT Enterprise", "ENTERPRISE"],
    ["ChatGPT Edu", "EDU"],
  ]) {
    assert.equal(classifyCodexTier(raw, true), expected);
  }
  assert.equal(classifyCodexTier("Pay-as-you-go", false), "API");

  for (const [raw, expected] of [
    ["free", "FREE"],
    ["pro", "PRO"],
    ["max", "MAX"],
    ["max_5x", "MAX"],
    ["max_20x", "MAX"],
    ["team", "TEAM"],
    ["enterprise", "ENTERPRISE"],
  ]) {
    assert.equal(classifyClaudeTier(raw), expected);
  }

  for (const [raw, expected] of [
    ["Free", "FREE"],
    ["Google AI Plus", "PLUS"],
    ["Google AI Pro", "PRO"],
    ["Google AI Ultra", "ULTRA"],
  ]) {
    assert.equal(classifyAntigravityTier(raw), expected);
  }
});

test("legacy ChatGPT Team is normalized to current Business naming", () => {
  assert.equal(classifyCodexTier("team", true), "BUSINESS");
  assert.equal(classifyCodexTier("chatgpt team", true), "BUSINESS");
  assert.equal(classifyCodexTier("business", true), "BUSINESS");
});

test("Codex overlay uses the same fresh cached tier source as the account card", () => {
  const card = read("src/components/codex/CodexAccountCard.tsx");
  const overlayHelpers = read("src/utils/common/app-overlay-helpers.ts");

  assert.match(card, /cache\?\.planName \?\? acc\.lastPlan/);
  assert.match(card, /classifyCodexTier/);
  assert.doesNotMatch(card, /const planText = \(acc\.lastPlan/);

  assert.match(overlayHelpers, /cache\?\.planName \?\? acc\?\.lastPlan \?\? "Free"/);
  assert.match(overlayHelpers, /const tier = classifyCodexTier\(rawTier,/);
});

test("overlay badge and tooltip use the same provider-aware canonical tier", () => {
  const overlay = read("src/components/overlay/OverlayCard.tsx");
  const tooltip = read("src/utils/common/overlay-tooltip.ts");

  assert.match(
    overlay,
    /resolveTierBadgeText\(\s*provider: OverlayAccountData\["provider"\],[\s\S]*?tier:/,
  );
  assert.match(overlay, /if \(provider === "codex"\) return classifyCodexTier/);
  assert.match(overlay, /if \(provider === "claude"\)/);
  assert.match(overlay, /return classifyAntigravityTier\(tier\)/);
  assert.match(overlay, /resolveTierBadgeText\(data\.provider, data\.tier\)/);
  assert.match(tooltip, /tierText \|\| data\.tier \|\| "FREE"/);
});

test("Claude and Antigravity account/overlay paths share their provider classifiers", () => {
  const claudeCard = read("src/components/claude/ClaudeAccountCards.tsx");
  const overlayHelpers = read("src/utils/common/app-overlay-helpers.ts");
  const overlayBuilder = read("src/utils/common/overlay-builder.ts");

  assert.match(claudeCard, /classifyClaudeTier\(account\.subscriptionType \|\| account\.rateLimitTier\)/);
  assert.match(overlayHelpers, /tier: classifyClaudeTier\(account\.subscriptionType \|\| account\.rateLimitTier\)/);
  assert.match(overlayHelpers, /tier: classifyAntigravityTier\(plan\)/);
  assert.match(
    overlayBuilder,
    /acc \? antigravityUsageCache\[acc\.id\]\?\.planTier : localAntigravitySession\?\.planTier/,
  );

  for (const path of [
    "src/components/antigravity/AntigravityCardHeader.tsx",
    "src/components/antigravity/AntigravityCardPlan.tsx",
    "src/components/antigravity/AntigravityLocalSessionCard.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /classifyAntigravityTier/);
    assert.doesNotMatch(source, /formatCompactTierName/);
  }
});

test("tier summary styling includes current OpenAI Go Business and Edu tiers", () => {
  const css = read("src/styles/antigravity.css");
  assert.match(css, /\.account-tier-badge--go,/);
  assert.match(css, /\.account-tier-badge--business,/);
  assert.match(css, /\.account-tier-badge--edu,/);
});
