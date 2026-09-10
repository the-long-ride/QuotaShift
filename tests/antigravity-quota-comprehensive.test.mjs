import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCloudQuotasIntoPools } from "../.test-build/antigravity-quota.js";

test("aggregateCloudQuotasIntoPools groups quotas into Gemini and Claude/OpenAI pools", () => {
  const quotas = [
    {
      modelId: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      family: "gemini",
      remainingPercent: 75,
      resetAt: "2026-09-10T12:00:00Z",
      weeklyPercent: 85,
      weeklyReset: "2026-09-17T00:00:00Z",
    },
    {
      modelId: "claude-3-7-sonnet",
      displayName: "Claude 3.7 Sonnet",
      family: "claude",
      remainingPercent: 50,
      resetAt: "2026-09-10T11:00:00Z",
      weeklyPercent: 60,
      weeklyReset: "2026-09-17T00:00:00Z",
    },
  ];

  const pools = aggregateCloudQuotasIntoPools(quotas);
  assert.equal(pools.length, 2);

  const gemini = pools.find((p) => p.model === "Gemini Models");
  assert.ok(gemini);
  assert.equal(gemini.fiveHourPercent, 75);
  assert.equal(gemini.weeklyPercent, 85);
  assert.equal(gemini.refreshTime, "2026-09-10T12:00:00Z");

  const claude = pools.find((p) => p.model === "Claude & OpenAI Models");
  assert.ok(claude);
  assert.equal(claude.fiveHourPercent, 50);
  assert.equal(claude.weeklyPercent, 60);
});

test("aggregateCloudQuotasIntoPools handles backend pool items", () => {
  const backendPools = [
    {
      modelId: "gemini_pool",
      displayName: "Gemini Models",
      fiveHourPercent: 90,
      fiveHourReset: "2026-09-10T15:00:00Z",
      weeklyPercent: 95,
      weeklyReset: "2026-09-17T12:00:00Z",
    },
    {
      modelId: "claude_and_gpt_pool",
      displayName: "Claude & OpenAI Models",
      fiveHourPercent: 40,
      fiveHourReset: "2026-09-10T14:00:00Z",
      weeklyPercent: 50,
      weeklyReset: "2026-09-17T12:00:00Z",
    },
  ];

  const result = aggregateCloudQuotasIntoPools(backendPools);
  assert.equal(result.length, 2);
  assert.equal(result[0].fiveHourPercent, 90);
  assert.equal(result[1].fiveHourPercent, 40);
});

test("aggregateCloudQuotasIntoPools handles disabled states and unknown models", () => {
  const quotas = [
    {
      modelId: "unknown-custom-model",
      displayName: "Custom Model",
      remainingPercent: 100,
    },
    {
      modelId: "gemini-flash",
      displayName: "Gemini Flash",
      fiveHourDisabled: true,
      fiveHourPercent: 0,
    },
  ];

  const result = aggregateCloudQuotasIntoPools(quotas);
  // Unknown model ignored, Gemini included
  assert.equal(result.length, 1);
  assert.equal(result[0].model, "Gemini Models");
  assert.equal(result[0].fiveHourDisabled, true);
  assert.equal(result[0].refreshTime, "Disabled");
});
