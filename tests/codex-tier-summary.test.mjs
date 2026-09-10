import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyCodexTier,
  computeCodexTierSummary,
} from "../.test-build/codex-tier-summary.js";

test("classifyCodexTier identifies Codex tiers correctly", () => {
  assert.equal(classifyCodexTier(null, true), "FREE");
  assert.equal(classifyCodexTier(undefined, true), "FREE");
  assert.equal(classifyCodexTier("", true), "FREE");
  assert.equal(classifyCodexTier("ChatGPT Free", true), "FREE");
  assert.equal(classifyCodexTier("Free", true), "FREE");

  assert.equal(classifyCodexTier("ChatGPT Plus", true), "PLUS");
  assert.equal(classifyCodexTier("Plus", true), "PLUS");

  assert.equal(classifyCodexTier("ChatGPT Pro", true), "PRO");
  assert.equal(classifyCodexTier("Pro", true), "PRO");

  assert.equal(classifyCodexTier("ChatGPT Team", true), "TEAM");
  assert.equal(classifyCodexTier("Team", true), "TEAM");
  assert.equal(classifyCodexTier("Business", true), "TEAM");

  assert.equal(classifyCodexTier("ChatGPT Enterprise", true), "ENTERPRISE");
  assert.equal(classifyCodexTier("ChatGPT Edu", true), "ENTERPRISE");
  assert.equal(classifyCodexTier("Education", true), "ENTERPRISE");

  assert.equal(classifyCodexTier("Pay-as-you-go", false), "API");
  assert.equal(classifyCodexTier("Usage-based", false), "API");
  assert.equal(classifyCodexTier("Tier 1", false), "API");
  assert.equal(classifyCodexTier(null, false), "API");
});

test("computeCodexTierSummary returns total 0 and empty badges when empty", () => {
  const result = computeCodexTierSummary([], {});
  assert.equal(result.total, 0);
  assert.deepEqual(result.badges, []);
});

test("computeCodexTierSummary only includes badges with accounts corresponding", () => {
  const accounts = [
    { id: "c-1", label: "Acc 1", lastPlan: "ChatGPT Plus" },
    { id: "c-2", label: "Acc 2", lastPlan: "ChatGPT Plus" },
    { id: "c-3", label: "Acc 3", lastPlan: "ChatGPT Pro" },
    { id: "c-4", label: "Acc 4", lastPlan: "Pay-as-you-go" },
  ];
  const result = computeCodexTierSummary(accounts, {});

  assert.equal(result.total, 4);
  assert.deepEqual(result.badges, [
    { tier: "PLUS", count: 2 },
    { tier: "PRO", count: 1 },
    { tier: "API", count: 1 },
  ]);
});

test("computeCodexTierSummary prefers usageCache planName over lastPlan", () => {
  const accounts = [
    { id: "c-1", label: "Acc 1", lastPlan: "ChatGPT Free" },
  ];
  const usageCache = {
    "c-1": { planName: "ChatGPT Pro" },
  };
  const result = computeCodexTierSummary(accounts, usageCache);

  assert.equal(result.total, 1);
  assert.deepEqual(result.badges, [
    { tier: "PRO", count: 1 },
  ]);
});

test("CodexTab UI contract: renders account-bar-summary with total and badges", () => {
  const codexTabCode = fs.readFileSync("src/components/codex/CodexTab.tsx", "utf8");

  assert.match(codexTabCode, /computeCodexTierSummary/);
  assert.match(codexTabCode, /account-bar-summary/);
  assert.match(codexTabCode, /account-bar-total/);
  assert.match(codexTabCode, /Total Codex accounts/);
  assert.match(codexTabCode, /tierSummary\.badges\.length > 0/);
  assert.match(codexTabCode, /account-tier-badge/);
  assert.match(codexTabCode, /account-tier-badge-sep/);
  assert.match(codexTabCode, /<span className="account-tier-badge-label">\{tier\}<\/span>[\s\n]*<span className="account-tier-badge-sep">-<\/span>[\s\n]*<span className="account-tier-badge-count">\{count\}<\/span>/);
  assert.doesNotMatch(codexTabCode, /ChatGPT Codex Accounts/);
});
