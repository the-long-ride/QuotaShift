import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { tierBadgeSlug } from "../../.test-build/tier-badge-slug.js";
import { buildAntigravityTierTooltip } from "../../.test-build/antigravity-tier-tooltip.js";
import { resolvePreservedAntigravityTier } from "../../.test-build/antigravity-tier-summary.js";
import { resolveAntigravityPlanName } from "../../.test-build/app-constants.js";
import { mergeExactResult } from "../../.test-build/antigravity-exact.js";

test("tierBadgeSlug normalizes mixed-case and plus tier names to valid CSS class slugs", () => {
  assert.equal(tierBadgeSlug("FREE"), "free");
  assert.equal(tierBadgeSlug("PRO"), "pro");
  assert.equal(tierBadgeSlug("Pro+"), "pro-plus");
  assert.equal(tierBadgeSlug("PRO+"), "pro-plus");
  assert.equal(tierBadgeSlug("Pro5x"), "pro5x");
  assert.equal(tierBadgeSlug("Pro20x"), "pro20x");
  assert.equal(tierBadgeSlug("Pro50x"), "pro50x");
  assert.equal(tierBadgeSlug("STD"), "std");
  assert.equal(tierBadgeSlug("PRE"), "pre");
  assert.equal(tierBadgeSlug("Max 5x"), "max-5x");
  assert.equal(tierBadgeSlug("Max 20x"), "max-20x");
  assert.equal(tierBadgeSlug(null), "other");
});

test("resolveAntigravityPlanName preserves and normalizes Google AI Pro+ variants", () => {
  assert.equal(resolveAntigravityPlanName("Google AI Pro+"), "Google AI Pro+");
  assert.equal(resolveAntigravityPlanName("pro+"), "Google AI Pro+");
  assert.equal(resolveAntigravityPlanName("pro-plus"), "Google AI Pro+");
  assert.equal(resolveAntigravityPlanName("google_ai_pro_plus"), "Google AI Pro+");
  assert.equal(resolveAntigravityPlanName("Google AI Pro"), "Google AI Pro");
});

test("buildAntigravityTierTooltip covers all 5 tiers and dynamic observed models", () => {
  const freeTip = buildAntigravityTierTooltip("FREE");
  assert.match(freeTip, /Free/i);
  assert.match(freeTip, /weekly/i);

  const plusTip = buildAntigravityTierTooltip("PLUS");
  assert.match(plusTip, /Plus/i);
  assert.match(plusTip, /2× Free/i);

  const proUnchecked = buildAntigravityTierTooltip("PRO", null);
  assert.match(proUnchecked, /1×/);
  assert.match(proUnchecked, /Refresh quota/i);

  const proCheckedNone = buildAntigravityTierTooltip("PRO", []);
  assert.match(proCheckedNone, /No next-gen/i);

  const proPlus = buildAntigravityTierTooltip("PRO+", [
    "Gemini 4 Neon",
    "Gemini 4 Argon",
    "Gemini 4 Carbon",
  ]);
  assert.match(proPlus, /PRO\+/);
  assert.match(proPlus, /Gemini 4 Neon, Gemini 4 Argon, Gemini 4 Carbon/);

  const proPlusCapped = buildAntigravityTierTooltip("PRO+", ["M1", "M2", "M3", "M4", "M5", "M6"]);
  assert.match(proPlusCapped, /M1, M2, M3, M4 \+2 more/);

  const ultraWithModels = buildAntigravityTierTooltip("ULTRA", ["Gemini 4 Carbon"]);
  assert.match(ultraWithModels, /5×–20× Pro/);
  assert.match(ultraWithModels, /Gemini 4 Carbon/);

  const enterpriseTip = buildAntigravityTierTooltip("ENTERPRISE", ["Gemini 4 Neon"]);
  assert.match(enterpriseTip, /Enterprise/i);
  assert.match(enterpriseTip, /Gemini 4 Neon/);
});

test("resolvePreservedAntigravityTier prevents Pro+ flicker on transient null catalog and clears on authoritative empty", () => {
  const transient = resolvePreservedAntigravityTier({
    incomingPlan: "Google AI Pro",
    incomingPremiumModels: null,
    previousPlan: "Google AI Pro+",
    previousPremiumModels: ["Gemini 4 Neon"],
  });
  assert.equal(transient.planTier, "Google AI Pro+");
  assert.deepEqual(transient.premiumModels, ["Gemini 4 Neon"]);

  const downgraded = resolvePreservedAntigravityTier({
    incomingPlan: "Google AI Pro",
    incomingPremiumModels: [],
    previousPlan: "Google AI Pro+",
    previousPremiumModels: ["Gemini 4 Neon"],
  });
  assert.equal(downgraded.planTier, "Google AI Pro");
  assert.deepEqual(downgraded.premiumModels, []);

  const upgraded = resolvePreservedAntigravityTier({
    incomingPlan: "Google AI Pro+",
    incomingPremiumModels: ["Gemini 4 Carbon"],
    previousPlan: "Google AI Pro",
    previousPremiumModels: [],
  });
  assert.equal(upgraded.planTier, "Google AI Pro+");
  assert.deepEqual(upgraded.premiumModels, ["Gemini 4 Carbon"]);
});

test("mergeExactResult preserves cloud-verified Pro+ when local IDE omits CLI-gated models", () => {
  const prev = {
    planTier: "Google AI Pro+",
    premiumModels: ["Gemini 4 Argon"],
    source: "cloud",
  };
  const next = mergeExactResult(
    prev,
    {
      accountId: "ag-1",
      state: "exact",
      error: null,
      fetchedAt: "2026-11-27T00:00:00Z",
      status: {
        online: true,
        email: "pro@example.com",
        planTier: "Google AI Pro",
        premiumModels: [],
        credits: null,
        quotas: [],
        recentlyUsedModel: null,
        monitoredCodex: null,
      },
    },
    1000,
  );
  assert.equal(next.planTier, "Google AI Pro+");
  assert.deepEqual(next.premiumModels, ["Gemini 4 Argon"]);

  const dayMs = 24 * 60 * 60 * 1000;
  const expiredPreserve = resolvePreservedAntigravityTier({
    incomingPlan: "Google AI Pro",
    incomingPremiumModels: [],
    previousPlan: "Google AI Pro+",
    previousPremiumModels: ["Gemini 4 Argon"],
    preserveOnEmpty: true,
    previousObservedAt: 10_000,
    now: 10_000 + dayMs + 1,
  });
  assert.equal(expiredPreserve.planTier, "Google AI Pro");
  assert.deepEqual(expiredPreserve.premiumModels, []);
});

test("AntigravityCardPlan and shared Tooltip CSS contracts hold", () => {
  const cardPlan = fs.readFileSync(
    path.resolve("src/components/antigravity/AntigravityCardPlan.tsx"),
    "utf8",
  );
  const cardsCss = fs.readFileSync(path.resolve("src/styles/codex/codex-cards.css"), "utf8");
  const tooltipTsx = fs.readFileSync(path.resolve("src/components/common/Tooltip.tsx"), "utf8");
  const badgeCss = fs.readFileSync(
    path.resolve("src/styles/accounts/account-tier-badges.css"),
    "utf8",
  );

  assert.match(cardPlan, /className="account-card-plan-badge"/);
  assert.match(cardPlan, /data-tier=\{tierBadgeSlug\(tier\)\}/);
  assert.match(cardPlan, /data-tooltip=\{tooltip\}/);
  assert.match(cardsCss, /\.app-tooltip\s*\{[\s\S]*white-space:\s*pre-line;/);
  assert.match(cardsCss, /\.app-tooltip\s*\{[\s\S]*max-width:\s*min\(280px/);
  assert.match(tooltipTsx, /window\.innerHeight\s*-\s*6/);
  assert.match(badgeCss, /\.account-tier-badge--pro-plus/);
  assert.match(badgeCss, /\.account-card-plan-badge\[data-tier="pro-plus"\]/);
});
