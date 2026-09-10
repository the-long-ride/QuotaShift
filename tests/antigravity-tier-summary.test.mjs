import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAntigravityTier,
  computeAntigravityTierSummary,
} from "../.test-build/antigravity-tier-summary.js";

test("classifyAntigravityTier identifies all 4 tiers correctly", () => {
  assert.equal(classifyAntigravityTier(null), "FREE");
  assert.equal(classifyAntigravityTier(undefined), "FREE");
  assert.equal(classifyAntigravityTier(""), "FREE");
  assert.equal(classifyAntigravityTier("Free"), "FREE");
  assert.equal(classifyAntigravityTier("free-tier"), "FREE");

  assert.equal(classifyAntigravityTier("Paid"), "PLUS");
  assert.equal(classifyAntigravityTier("standard-tier"), "PLUS");
  assert.equal(classifyAntigravityTier("standard"), "PLUS");
  assert.equal(classifyAntigravityTier("plus"), "PLUS");
  assert.equal(classifyAntigravityTier("legacy-tier"), "PLUS");

  assert.equal(classifyAntigravityTier("Google AI Pro"), "PRO");
  assert.equal(classifyAntigravityTier("advanced-tier"), "PRO");
  assert.equal(classifyAntigravityTier("advanced"), "PRO");
  assert.equal(classifyAntigravityTier("google_ai_pro"), "PRO");
  assert.equal(classifyAntigravityTier("ai-pro"), "PRO");

  assert.equal(classifyAntigravityTier("Google AI Ultra"), "ULTRA");
  assert.equal(classifyAntigravityTier("ultra-tier"), "ULTRA");
  assert.equal(classifyAntigravityTier("ultra"), "ULTRA");
});

test("computeAntigravityTierSummary returns total 0 and empty badges when empty", () => {
  const result = computeAntigravityTierSummary([], {});
  assert.equal(result.total, 0);
  assert.deepEqual(result.badges, []);
});

test("computeAntigravityTierSummary only includes badges that have accounts corresponding", () => {
  const accounts = [
    { id: "ag-1", label: "Acc 1", lastPlan: "Free" },
    { id: "ag-2", label: "Acc 2", lastPlan: "Google AI Pro" },
    { id: "ag-3", label: "Acc 3", lastPlan: "advanced-tier" },
  ];
  const result = computeAntigravityTierSummary(accounts, {});

  assert.equal(result.total, 3);
  // Only FREE and PRO should be in badges, PLUS and ULTRA omitted
  assert.deepEqual(result.badges, [
    { tier: "FREE", count: 1 },
    { tier: "PRO", count: 2 },
  ]);
});

test("computeAntigravityTierSummary prefers usageCache planTier over lastPlan", () => {
  const accounts = [
    { id: "ag-1", label: "Acc 1", lastPlan: "Free" },
  ];
  const usageCache = {
    "ag-1": { planTier: "Google AI Ultra" },
  };
  const result = computeAntigravityTierSummary(accounts, usageCache);

  assert.equal(result.total, 1);
  assert.deepEqual(result.badges, [
    { tier: "ULTRA", count: 1 },
  ]);
});

test("computeAntigravityTierSummary accounts for all 4 tiers without double-counting", () => {
  const accounts = [
    { id: "1", label: "A1", lastPlan: "Free" },
    { id: "2", label: "A2", lastPlan: "Paid" },
    { id: "3", label: "A3", lastPlan: "Google AI Pro" },
    { id: "4", label: "A4", lastPlan: "Google AI Ultra" },
  ];
  const result = computeAntigravityTierSummary(accounts, {});

  assert.equal(result.total, 4);
  assert.deepEqual(result.badges, [
    { tier: "FREE", count: 1 },
    { tier: "PLUS", count: 1 },
    { tier: "PRO", count: 1 },
    { tier: "ULTRA", count: 1 },
  ]);
  const sumOfBadges = result.badges.reduce((acc, b) => acc + b.count, 0);
  assert.equal(sumOfBadges, result.total);
});

test("AntigravityTab and CSS contracts: account-bar header renders compact Antigravity tier summary badges", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { readWithCssImports } = await import("./css-helper.mjs");
  const tabSrc = fs.readFileSync(path.resolve("src/components/AntigravityTab.tsx"), "utf-8");
  const cssSrc = readWithCssImports(path.resolve("src/styles.css"));

  assert.match(tabSrc, /computeAntigravityTierSummary/);
  assert.match(tabSrc, /account-bar-summary/);
  assert.match(tabSrc, /account-bar-total/);
  assert.match(tabSrc, /account-tier-badge/);
  assert.match(tabSrc, /account-tier-badge-sep/);
  assert.match(tabSrc, /<span className="account-tier-badge-label">\{tier\}<\/span>[\s\n]*<span className="account-tier-badge-sep">-<\/span>[\s\n]*<span className="account-tier-badge-count">\{count\}<\/span>/);

  assert.match(cssSrc, /\.account-bar-summary/);
  assert.match(cssSrc, /\.account-tier-badge-sep/);
  assert.match(cssSrc, /\.account-tier-badge--free/);
  assert.match(cssSrc, /\.account-tier-badge--plus/);
  assert.match(cssSrc, /\.account-tier-badge--pro/);
  assert.match(cssSrc, /\.account-tier-badge--ultra/);
});

