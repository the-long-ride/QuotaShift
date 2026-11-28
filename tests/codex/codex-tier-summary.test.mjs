import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyCodexTier,
  computeCodexTierSummary,
} from "../../.test-build/codex/codex-tier-summary.js";
import { buildCodexTierTooltip } from "../../.test-build/codex/codex-tier-tooltip.js";

test("classifyCodexTier identifies Codex tiers, Pro sub-tiers, and Business Std/Pre correctly", () => {
  assert.equal(classifyCodexTier(null, true), "FREE");
  assert.equal(classifyCodexTier(undefined, true), "FREE");
  assert.equal(classifyCodexTier("", true), "FREE");
  assert.equal(classifyCodexTier("ChatGPT Free", true), "FREE");
  assert.equal(classifyCodexTier("Free", true), "FREE");
  assert.equal(classifyCodexTier("free_workspace", true), "FREE");
  assert.equal(classifyCodexTier("guest", true), "FREE");

  assert.equal(classifyCodexTier("ChatGPT Go", true), "GO");
  assert.equal(classifyCodexTier("Go", true), "GO");

  assert.equal(classifyCodexTier("ChatGPT Plus", true), "PLUS");
  assert.equal(classifyCodexTier("Plus", true), "PLUS");

  assert.equal(classifyCodexTier("prolite", true), "Pro5x");
  assert.equal(classifyCodexTier("pro_lite", true), "Pro5x");
  assert.equal(classifyCodexTier("pro_100", true), "Pro5x");
  assert.equal(classifyCodexTier("pro_5x", true), "Pro5x");
  assert.equal(classifyCodexTier("pro_10x", true), "Pro5x");
  assert.equal(classifyCodexTier("Pro5x", true), "Pro5x");

  assert.equal(classifyCodexTier("ChatGPT Pro", true), "Pro20x");
  assert.equal(classifyCodexTier("Pro", true), "Pro20x");
  assert.equal(classifyCodexTier("pro_200", true), "Pro20x");
  assert.equal(classifyCodexTier("pro_20x", true), "Pro20x");
  assert.equal(classifyCodexTier("Pro20x", true), "Pro20x");

  assert.equal(classifyCodexTier("promax", true), "Pro50x");
  assert.equal(classifyCodexTier("pro_max", true), "Pro50x");
  assert.equal(classifyCodexTier("pro_500", true), "Pro50x");
  assert.equal(classifyCodexTier("pro_50x", true), "Pro50x");
  assert.equal(classifyCodexTier("Pro50x", true), "Pro50x");

  assert.equal(classifyCodexTier("self_serve_business_prolite", true), "PRE");
  assert.equal(classifyCodexTier("Business Premium", true), "PRE");
  assert.equal(classifyCodexTier("Team Premium", true), "PRE");
  assert.equal(classifyCodexTier("PRE", true), "PRE");
  assert.equal(classifyCodexTier("B-Pre", true), "PRE");

  assert.equal(classifyCodexTier("ChatGPT Team", true), "STD");
  assert.equal(classifyCodexTier("Team", true), "STD");
  assert.equal(classifyCodexTier("Business", true), "STD");
  assert.equal(classifyCodexTier("self_serve_business", true), "STD");
  assert.equal(classifyCodexTier("self_serve_business_usage_based", true), "STD");
  assert.equal(classifyCodexTier("STD", true), "STD");
  assert.equal(classifyCodexTier("B-Std", true), "STD");

  assert.equal(classifyCodexTier("ChatGPT Enterprise", true), "ENTERPRISE");
  assert.equal(classifyCodexTier("enterprise_cbp_usage_based", true), "ENTERPRISE");

  assert.equal(classifyCodexTier("ChatGPT Edu", true), "EDU");
  assert.equal(classifyCodexTier("Education", true), "EDU");

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
    { id: "c-3", label: "Acc 3", lastPlan: "prolite" },
    { id: "c-4", label: "Acc 4", lastPlan: "ChatGPT Pro" },
    { id: "c-5", label: "Acc 5", lastPlan: "promax" },
    { id: "c-6", label: "Acc 6", lastPlan: "self_serve_business_usage_based" },
    { id: "c-7", label: "Acc 7", lastPlan: "self_serve_business_prolite" },
    { id: "c-8", label: "Acc 8", lastPlan: "Pay-as-you-go" },
  ];
  const result = computeCodexTierSummary(accounts, {});

  assert.equal(result.total, 8);
  assert.deepEqual(result.badges, [
    { tier: "PLUS", count: 2 },
    { tier: "Pro5x", count: 1 },
    { tier: "Pro20x", count: 1 },
    { tier: "Pro50x", count: 1 },
    { tier: "STD", count: 1 },
    { tier: "PRE", count: 1 },
    { tier: "API", count: 1 },
  ]);
});

test("computeCodexTierSummary prefers usageCache planName over lastPlan", () => {
  const accounts = [{ id: "c-1", label: "Acc 1", lastPlan: "ChatGPT Free" }];
  const usageCache = {
    "c-1": { planName: "ChatGPT Pro" },
  };
  const result = computeCodexTierSummary(accounts, usageCache);

  assert.equal(result.total, 1);
  assert.deepEqual(result.badges, [{ tier: "Pro20x", count: 1 }]);
});

test("buildCodexTierTooltip returns concise multiline comparison text for every Codex tier", () => {
  assert.match(buildCodexTierTooltip("FREE"), /No premium models/i);
  assert.match(buildCodexTierTooltip("FREE"), /1-month/i);
  assert.match(buildCodexTierTooltip("GO"), /No premium models/i);
  assert.match(buildCodexTierTooltip("GO"), /2x Free/i);
  assert.match(buildCodexTierTooltip("GO"), /1-month/i);
  assert.match(buildCodexTierTooltip("PLUS"), /1x baseline/i);
  assert.match(buildCodexTierTooltip("Pro5x"), /5x Plus/i);
  assert.match(buildCodexTierTooltip("Pro20x"), /20x Plus/i);
  assert.match(buildCodexTierTooltip("Pro50x"), /50x Plus/i);
  assert.match(buildCodexTierTooltip("Pro50x"), /Ultrafast/i);
  assert.match(buildCodexTierTooltip("STD"), /1x Plus/i);
  assert.match(buildCodexTierTooltip("PRE"), /5x/i);
  assert.match(buildCodexTierTooltip("PRE"), /No 5h/i);
  assert.match(buildCodexTierTooltip("ENTERPRISE"), /Enterprise/i);
  assert.match(buildCodexTierTooltip("EDU"), /Edu/i);
  assert.match(buildCodexTierTooltip("API"), /Pay-as-you-go/i);
});

test("CodexTab UI contract: renders account-bar-summary with total and badges", () => {
  const codexTabCode = fs.readFileSync("src/components/codex/CodexTab.tsx", "utf8");
  const accountBarCode = fs.readFileSync("src/components/codex/cards/CodexAccountBar.tsx", "utf8");
  const summaryCode = fs.readFileSync(
    "src/components/common/accounts/AccountTierSummary.tsx",
    "utf8",
  );

  assert.match(codexTabCode, /computeCodexTierSummary/);
  assert.match(codexTabCode, /<CodexAccountBar/);
  assert.match(accountBarCode, /<AccountTierSummary/);
  assert.match(accountBarCode, /totalTooltip="Total Codex accounts"/);
  assert.match(summaryCode, /account-bar-summary/);
  assert.match(summaryCode, /account-bar-total/);
  assert.match(summaryCode, /badges\.length > 0/);
  assert.match(summaryCode, /account-tier-badge/);
  assert.match(summaryCode, /account-tier-badge-sep/);
  assert.match(
    summaryCode,
    /<span className="account-tier-badge-label">\{tier\}<\/span>[\s\n]*<span className="account-tier-badge-sep">-<\/span>[\s\n]*<span className="account-tier-badge-count">\{count\}<\/span>/,
  );
  assert.doesNotMatch(accountBarCode, /ChatGPT Codex Accounts/);
});
