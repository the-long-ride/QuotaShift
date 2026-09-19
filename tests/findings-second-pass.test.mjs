import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { claudeAdaptivePollIntervalSecs } from "../src/utils/claude/claude-polling.ts";

const read = (path) => fs.readFileSync(path, "utf8");

test("Finding 1: General timer yields scheduled Claude refreshes to dedicated hook", () => {
  const events = read("src/hooks/useAppEventListeners.ts");
  assert.match(
    events,
    /\/\/ Claude scheduled polling is owned by useClaudeAccountMonitor[\s\S]*?if \(savedProvider === "claude"\) return;/,
  );
});

test("Finding 2: Tracked accounts honor poll interval preference while preserving auth suspension", () => {
  const codex = read("src/hooks/useCodexUsageFetcher.ts");
  const antigravity = read("src/utils/antigravity/app-antigravity-ops.ts");

  assert.match(codex, /loadTrackedPollIntervalPreference/);
  assert.match(codex, /!force && isAccountPollingSuspended\("codex", account\.id\)/);
  assert.match(codex, /isTracked[\s\S]*?loadTrackedPollIntervalPreference\(\) \* 1000/);

  assert.match(antigravity, /loadTrackedPollIntervalPreference/);
  assert.match(antigravity, /!force && isAccountPollingSuspended\("antigravity", acc\.id\)/);
  assert.match(antigravity, /isTracked[\s\S]*?loadTrackedPollIntervalPreference\(\) \* 1000/);
});

test("Finding 3: Local Antigravity session sync includes freshness deadline and captured fallback", () => {
  const localSession = read("src/hooks/useLocalSession.ts");

  assert.match(localSession, /target = mergeDiskAntigravitySession\(previous, candidate\)/);
  assert.match(localSession, /if \(diskChanged\) \{[\s\S]*?saveLocalAntigravitySession\(target\)/);
  assert.match(
    localSession,
    /isExpired = !target\.lastSeenAt \|\| Date\.now\(\) - target\.lastSeenAt >= maxAgeMs/,
  );
  assert.match(localSession, /normalizeLocalSessionQuotas\(previous\.quotas\)/);
  assert.match(
    localSession,
    /if \(shouldRefresh && target\.capturedAccount\?\.token\) \{[\s\S]*?await refreshLocalSessionQuota\(target\)/,
  );
});

test("Finding 4: Low-usage saver does not delay polling when near configured guardrails", () => {
  const baseInterval = 30;
  const statuses = [
    {
      account: { id: "test", profileName: "default", configDir: "/test" },
      fiveHour: { usedPercentage: 8, resetsAt: "2026-09-20T12:00:00Z" },
      sevenDay: { usedPercentage: 5, resetsAt: "2026-09-27T12:00:00Z" },
      usageFresh: true,
      error: null,
      suspended: false,
    },
  ];

  // Near 9% threshold (eager margin is 10% -> eagerAt = 0%, 8% >= 0% -> eager)
  const eagerPrefs = {
    pollIntervalSecs: baseInterval,
    reduceLowUsageFrequency: true,
    fiveHour: { enabled: true, thresholdPct: 9 },
    weekly: { enabled: false, thresholdPct: 98 },
  };
  const eagerResult = claudeAdaptivePollIntervalSecs(baseInterval, statuses, eagerPrefs);
  assert.equal(eagerResult, baseInterval); // Must not back off to 300s!

  // Safely far below threshold (threshold 90% -> eagerAt = 80%, 8% << 80%)
  const safePrefs = {
    pollIntervalSecs: baseInterval,
    reduceLowUsageFrequency: true,
    fiveHour: { enabled: true, thresholdPct: 90 },
    weekly: { enabled: false, thresholdPct: 98 },
  };
  const safeResult = claudeAdaptivePollIntervalSecs(baseInterval, statuses, safePrefs);
  assert.ok(safeResult >= 300); // Backs off when safely outside eager margin
});

test("Finding 5: Topology fallback validates full geometry changes and revalidates on visibility", () => {
  const overlayWindow = read("src/components/overlay/useOverlayDataAndWindow.ts");

  assert.match(
    overlayWindow,
    /topologyKey = monitors[\s\S]*?\.map\(\(m\) => `\$\{m\.position\.x\},\$\{m\.position\.y\},\$\{m\.size\.width\},\$\{m\.size\.height\}`\)/,
  );
  assert.match(overlayWindow, /if \(lastTopologyKey && topologyKey === lastTopologyKey\) return;/);
  assert.match(
    overlayWindow,
    /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/,
  );
  assert.match(
    overlayWindow,
    /monitorCheckInterval = window\.setInterval\(checkMonitorTopology, 10000\)/,
  );
});
