import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { classifyCodexTier } from "../../.test-build/codex/codex-tier-summary.js";
import {
  classifyClaudeTier,
  resolveClaudeDisplayTier,
} from "../../.test-build/claude/claude-tier-summary.js";
import { classifyAntigravityTier } from "../../.test-build/antigravity/quota/antigravity-tier-summary.js";

import {
  buildAntigravityOverlayPayload,
  buildCodexOverlayPayload,
} from "../../.test-build/common/overlay/app-overlay-quota-builders.js";

const read = (path) => fs.readFileSync(path, "utf8");

test("current provider tier catalog keeps official plan families distinct", () => {
  for (const [raw, expected] of [
    ["Free", "FREE"],
    ["ChatGPT Go", "GO"],
    ["ChatGPT Plus", "PLUS"],
    ["prolite", "Pro5x"],
    ["ChatGPT Pro", "Pro20x"],
    ["promax", "Pro50x"],
    ["ChatGPT Business", "STD"],
    ["ChatGPT Team", "STD"],
    ["self_serve_business_usage_based", "STD"],
    ["self_serve_business_prolite", "PRE"],
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
    ["Google AI Pro+", "PRO+"],
    ["Google AI Ultra", "ULTRA"],
  ]) {
    assert.equal(classifyAntigravityTier(raw), expected);
  }
});

test("Claude display tiers keep their exact labels after overlay payload normalization", () => {
  for (const [subscription, rateLimit, expected] of [
    ["team", "default_raven", "STD"],
    ["team", "default_raven_5x", "PRE"],
    ["max", "default_claude_max_5x", "Max 5x"],
    ["max", "default_claude_max_20x", "Max 20x"],
    ["pro", null, "PRO"],
    ["enterprise", null, "ENTERPRISE"],
  ]) {
    const payloadTier = resolveClaudeDisplayTier(subscription, rateLimit);
    assert.equal(payloadTier, expected);
    assert.equal(resolveClaudeDisplayTier(payloadTier), expected);
  }
});

test("legacy ChatGPT Team and self-serve Business map to STD / PRE", () => {
  assert.equal(classifyCodexTier("team", true), "STD");
  assert.equal(classifyCodexTier("chatgpt team", true), "STD");
  assert.equal(classifyCodexTier("business", true), "STD");
  assert.equal(classifyCodexTier("self_serve_business_usage_based", true), "STD");
  assert.equal(classifyCodexTier("self_serve_business_prolite", true), "PRE");
});

test("Codex overlay uses the same fresh cached tier source as the account card", () => {
  const card = read("src/components/codex/cards/CodexAccountCard.tsx");
  const overlayHelpers =
    read("src/utils/common/overlay/app-overlay-helpers.ts") +
    read("src/utils/common/overlay/app-overlay-quota-builders.ts");

  assert.match(card, /cache\?\.planName \?\? acc\.lastPlan/);
  assert.match(card, /classifyCodexTier/);
  assert.doesNotMatch(card, /const planText = \(acc\.lastPlan/);

  assert.match(overlayHelpers, /const rawTier = cache\?\.planName \?\? acc\?\.lastPlan;/);
  assert.match(overlayHelpers, /const tier = classifyCodexTier\(rawTier,/);
});

test("overlay payloads keep API and saved provider plan labels", () => {
  const codex = { id: "api", email: "api@example.test" };
  assert.equal(buildCodexOverlayPayload(codex, { isOAuth: false }, null).tier, "API");

  const antigravity = { id: "saved", lastPlan: "Google AI Pro+" };
  const local = { planTier: "Google AI Ultra" };
  assert.equal(
    buildAntigravityOverlayPayload(
      antigravity,
      [],
      null,
      local,
      "GCP Project Quota: Google AI Ultra",
    ).tier,
    "PRO+",
  );
  assert.equal(buildAntigravityOverlayPayload(undefined, [], null, local).tier, "ULTRA");
});

test("overlay badge and tooltip use the same provider-aware canonical tier", () => {
  const overlay = read("src/components/overlay/OverlayCard.tsx");
  const tooltip = read("src/utils/common/overlay/overlay-tooltip.ts");

  assert.match(
    overlay,
    /resolveTierBadgeText\(\s*provider: OverlayAccountData\["provider"\],[\s\S]*?tier:/,
  );
  assert.match(overlay, /if \(provider === "codex"\) return classifyCodexTier/);
  assert.match(overlay, /if \(provider === "claude"\)[\s\S]*?resolveClaudeDisplayTier\(tier\)/);
  assert.match(overlay, /return classifyAntigravityTier\(tier\)/);
  assert.match(overlay, /resolveTierBadgeText\(data\.provider, data\.tier\)/);
  assert.match(tooltip, /const tier = tierText \|\|/);
  for (const [path, call] of [
    ["src/components/overlay/OverlayCircleNode.tsx", "data.provider, data.tier"],
    ["src/components/taskbar/TaskbarColumn.tsx", "column.provider, column.tier"],
    ["src/components/taskbar/TaskbarTooltipCard.tsx", "details.provider, details.tier"],
  ]) {
    assert.ok(read(path).includes(`resolveTierBadgeText(${call})`), path);
  }
});

test("Claude and Antigravity account/overlay paths share their provider classifiers", () => {
  const claudeCard = read("src/components/claude/ClaudeAccountCards.tsx");
  const overlayHelpers =
    read("src/utils/common/overlay/app-overlay-helpers.ts") +
    read("src/utils/common/overlay/app-overlay-quota-builders.ts");
  const overlayBuilder = read("src/utils/common/overlay/overlay-builder.ts");

  assert.match(
    claudeCard,
    /(?:classifyClaudeTier|resolveClaudeDisplayTier)\(account\.subscriptionType/,
  );
  assert.match(
    overlayHelpers,
    /tier:\s*(?:classifyClaudeTier|resolveClaudeDisplayTier)\(account\.subscriptionType/,
  );
  assert.match(overlayHelpers, /tier: classifyAntigravityTier\(plan\)/);
  assert.match(
    overlayBuilder,
    /acc \? antigravityUsageCache\[acc\.id\]\?\.planTier : localAntigravitySession\?\.planTier/,
  );

  for (const path of [
    "src/components/antigravity/AntigravityCardHeader.tsx",
    "src/components/antigravity/AntigravityCardPlan.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /classifyAntigravityTier/);
    assert.doesNotMatch(source, /formatCompactTierName/);
  }
});

test("tier summary styling includes current OpenAI Go Business Edu and v1.3.3 sub-tiers", () => {
  const css = read("src/styles/antigravity/antigravity.css");
  const badgeCss = read("src/styles/accounts/account-tier-badges.css");
  assert.match(css, /\.account-tier-badge--go,/);
  assert.match(css, /\.account-tier-badge--business,/);
  assert.match(css, /\.account-tier-badge--edu,/);
  for (const mod of ["pro-plus", "pro5x", "pro20x", "pro50x", "std", "pre", "max-5x", "max-20x"]) {
    assert.match(badgeCss, new RegExp(`\\.account-tier-badge--${mod}\\b`));
  }
});

test("card badge styling decorates all provider tiers and scopes Claude PRO separately", () => {
  const badgeCss = read("src/styles/accounts/account-tier-badges.css");
  for (const slug of [
    "go",
    "plus",
    "pro",
    "pro-plus",
    "ultra",
    "pro5x",
    "pro20x",
    "pro50x",
    "max",
    "max-5x",
    "max-20x",
    "std",
    "pre",
    "enterprise",
  ]) {
    assert.match(badgeCss, new RegExp(`\\.account-card-plan-badge\\[data-tier="${slug}"\\]`));
    assert.match(badgeCss, new RegExp(`\\.codex-card-tier-badge\\[data-tier="${slug}"\\]`));
  }

  assert.match(badgeCss, /\.tab-panel--claude\s+\.account-card-plan-badge\[data-tier="pro"\]/);
  assert.match(badgeCss, /\.account-tier-badge--pro\[data-provider="claude"\]/);
  assert.match(badgeCss, /linear-gradient\(/);

  assert.match(read("src/components/claude/ClaudeTab.tsx"), /tab-panel--claude/);
  assert.match(read("src/components/codex/CodexTab.tsx"), /tab-panel--codex/);
  assert.match(
    read("src/components/common/monitored/MonitoredAccountsModal.tsx"),
    /data-provider=\{item\.platform\}/,
  );
  assert.match(
    read("src/components/codex/pools/CodexPoolUsageModal.tsx"),
    /data-tier=\{tierBadgeSlug\(row\.tier\)\}/,
  );
});
