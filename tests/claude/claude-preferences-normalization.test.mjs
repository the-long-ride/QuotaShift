import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizeClaudePreferences } from "../../.test-build/common/claude-preferences.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Claude preference normalization clamps values before UI state and persistence", () => {
  assert.deepEqual(
    normalizeClaudePreferences({
      pollIntervalSecs: 60,
      enabled: true,
      autoResumeAtReset: false,
      onlyWatchProcessingAccounts: true,
      fiveHour: { enabled: true, thresholdPct: 150 },
      weekly: { enabled: true, thresholdPct: 0 },
    }),
    {
      pollIntervalSecs: 60,
      enabled: true,
      autoResumeAtReset: false,
      onlyWatchProcessingAccounts: true,
      fiveHour: { enabled: true, thresholdPct: 100 },
      weekly: { enabled: true, thresholdPct: 1 },
    },
  );

  const controls = read("src/components/claude/ClaudeControls.tsx");
  assert.match(controls, /normalizeClaudePreferences/);
});
