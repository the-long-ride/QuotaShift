import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../../src/utils/antigravity/antigravity-quota-carry.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const { carryForwardQuotaLanes } = await import(
  `data:text/javascript,${encodeURIComponent(outputText)}`
);

const NOW = Date.parse("2026-10-25T11:30:00Z");
const pool = (modelId, lanes) => ({
  modelId,
  displayName: modelId,
  family: "gemini",
  remainingFraction: 1,
  remainingPercent: 100,
  resetAt: null,
  ...lanes,
});

test("a refresh missing a lane keeps the previous value until that lane resets", () => {
  const previous = [
    pool("gemini_pool", {
      fiveHourPercent: 98,
      fiveHourReset: "2026-10-25T13:55:36Z",
      weeklyPercent: 92,
      weeklyReset: "2026-11-01T02:56:53Z",
    }),
    pool("claude_gpt_pool", {
      fiveHourPercent: 100,
      fiveHourReset: "2026-10-25T10:00:00Z",
      weeklyPercent: 50,
      weeklyReset: "2026-11-01T02:59:52Z",
    }),
  ];
  const next = [
    pool("gemini_pool", { fiveHourPercent: 97, fiveHourReset: "2026-10-25T13:55:36Z" }),
    pool("claude_gpt_pool", { weeklyPercent: 43, weeklyReset: "2026-11-01T02:59:52Z" }),
  ];
  const merged = carryForwardQuotaLanes(previous, next, NOW);
  assert.deepEqual(
    merged.map((p) => [p.modelId, p.fiveHourPercent ?? null, p.weeklyPercent ?? null]),
    [
      ["gemini_pool", 97, 92],
      ["claude_gpt_pool", null, 43],
    ],
  );
});

test("no previous data leaves the refresh untouched", () => {
  const next = [pool("gemini_pool", { fiveHourPercent: 97 })];
  assert.equal(carryForwardQuotaLanes(undefined, next, NOW), next);
});
