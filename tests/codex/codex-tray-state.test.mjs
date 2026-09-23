import test from "node:test";
import assert from "node:assert/strict";
import { buildMonitoredCodexInfo, shouldSyncTrackedCodex } from "../../.test-build/codex/codex-tray-state.js";

test("only the tracked Codex account may update tray state", () => {
  assert.equal(shouldSyncTrackedCodex("codex", "a", "a"), true);
  assert.equal(shouldSyncTrackedCodex("codex", "a", "b"), false);
  assert.equal(shouldSyncTrackedCodex("antigravity", "a", "a"), false);
});

test("builds remaining percentages from Codex used-percent windows", () => {
  const info = buildMonitoredCodexInfo(
    { id: "a", label: "tr.gmail.0001", apiKey: "x" },
    { rate_limit: { primary_window: { used_percent: 50 }, secondary_window: { used_percent: 46 } } },
  );
  assert.equal(info.primaryPercent, 50);
  assert.equal(info.secondaryPercent, 54);
  assert.equal(info.label, "tr.gmail.0001");
});
