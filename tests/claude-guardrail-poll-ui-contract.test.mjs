import test from "node:test";
import assert from "node:assert/strict";

import { readWithCssImports } from "./css-helper.mjs";
import {
  MIN_CLAUDE_POLL_INTERVAL_SECS,
  MAX_CLAUDE_POLL_INTERVAL_SECS,
  sanitizeClaudePollInterval,
} from "../.test-build/common/claude-preferences.js";
import {
  MIN_POLL_INTERVAL_SECS,
  MAX_POLL_INTERVAL_SECS,
  MIN_TRACKED_POLL_INTERVAL_SECS,
  MAX_TRACKED_POLL_INTERVAL_SECS,
  MIN_IDLE_POLL_INTERVAL_SECS,
  MAX_IDLE_POLL_INTERVAL_SECS,
  sanitizePollInterval,
  sanitizeTrackedPollInterval,
  sanitizeIdlePollInterval,
} from "../.test-build/common/poll-interval.js";

const read = (path) => readWithCssImports(new URL(`../${path}`, import.meta.url));

test("all poll-rate preferences allow 5 seconds through 20 minutes", () => {
  assert.equal(MIN_POLL_INTERVAL_SECS, 5);
  assert.equal(MAX_POLL_INTERVAL_SECS, 1200);
  assert.equal(MIN_TRACKED_POLL_INTERVAL_SECS, 5);
  assert.equal(MAX_TRACKED_POLL_INTERVAL_SECS, 1200);
  assert.equal(MIN_IDLE_POLL_INTERVAL_SECS, 5);
  assert.equal(MAX_IDLE_POLL_INTERVAL_SECS, 1200);
  assert.equal(MIN_CLAUDE_POLL_INTERVAL_SECS, 5);
  assert.equal(MAX_CLAUDE_POLL_INTERVAL_SECS, 1200);

  assert.equal(sanitizePollInterval(1), 5);
  assert.equal(sanitizePollInterval(1201), 1200);
  assert.equal(sanitizeTrackedPollInterval(6), 6);
  assert.equal(sanitizeTrackedPollInterval(1201), 1200);
  assert.equal(sanitizeIdlePollInterval(5), 5);
  assert.equal(sanitizeIdlePollInterval(1201), 1200);
  assert.equal(sanitizeClaudePollInterval(5), 5);
  assert.equal(sanitizeClaudePollInterval(1199), 1199);
});

test("Claude uses its dedicated poll rate while either usage guardrail is enabled", () => {
  const hook = read("src/hooks/useClaudeMonitor.ts");
  const controls = read("src/components/claude/ClaudeControls.tsx");

  assert.match(hook, /loadTrackedPollIntervalPreference/);
  assert.match(hook, /TRACKED_POLL_INTERVAL_CHANGED_EVENT/);
  assert.match(hook, /CLAUDE_PREFERENCES_CHANGED_EVENT/);
  assert.match(
    hook,
    /const\s+guardrailsActive\s*=\s*claudePreferences\.fiveHour\.enabled\s*\|\|\s*claudePreferences\.weekly\.enabled/,
  );
  assert.match(
    hook,
    /claudeAccountMonitorPollIntervalSecs\(\s*guardrailsActive,\s*isClaudeTracked,\s*claudePreferences\.pollIntervalSecs,\s*globalPollIntervalSecs,\s*idlePollIntervalSecs/,
  );
  assert.match(hook, /quotashift_overlay_tracked_account_id/);
  assert.doesNotMatch(controls, /label="Enable Claude Code guardrails"/);
  assert.match(controls, /Other idle accounts poll rate/i);
  assert.match(controls, /Recommended 15–30s/i);
  assert.doesNotMatch(controls, /default 20s/i);
  assert.doesNotMatch(controls, /allowed 5s–20m/i);
});

test("tracking Claude with either guardrail on overrides the shared tracked-account runtime poll rate", () => {
  const hook = read("src/hooks/useClaudeMonitor.ts");

  assert.match(hook, /quotashift_overlay_tracked_provider/);
  assert.match(
    hook,
    /trackedProvider\s*===\s*["']claude["']\s*&&\s*guardrailsActive\s*\?\s*claudePreferences\.pollIntervalSecs\s*:\s*globalPollIntervalSecs/,
  );
  assert.match(hook, /invoke\(["']set_poll_interval["'][\s\S]*sharedRuntimePollIntervalSecs/);
  assert.match(hook, /setTimeout[\s\S]*set_poll_interval/);
  assert.match(
    hook,
    /\[\s*sharedRuntimePollIntervalSecs\s*\]/,
  );
});

test("Claude guardrail details start collapsed when both windows are off and keep chevron disclosure icons", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");
  const styles = read("src/styles.css");

  assert.match(
    controls,
    /const\s+\[detailsExpanded,\s*setDetailsExpanded\]\s*=\s*useState\([\s\S]*preferences\.fiveHour\.enabled\s*\|\|\s*preferences\.weekly\.enabled/,
  );
  assert.match(controls, /aria-expanded=\{detailsExpanded\}/);
  assert.match(controls, /setDetailsExpanded\(\(expanded\)\s*=>\s*!expanded\)/);
  assert.match(controls, /detailsExpanded\s*&&\s*\(/);
  assert.match(controls, /M8\.29289 4\.29289/);
  assert.match(controls, /M4\.29289 8\.29289/);
  assert.match(styles, /\.claude-controls-card--collapsed\s+\.claude-controls-header/);
});

test("Claude Code guardrails summary displays status and thresholds when collapsed", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");

  assert.match(controls, /getCollapsedGuardrailDescription/);
  assert.match(controls, /!detailsExpanded\s*&&\s*getCollapsedGuardrailDescription\(preferences\)/);
  assert.doesNotMatch(controls, /Status:\s*ON/);
  assert.doesNotMatch(controls, /Status:\s*OFF/);
  assert.match(controls, /Poll rate:\s*\$\{poll\}\s*-\s*Suspend each Claude Code account when usage reaches/);
  assert.match(controls, /\$\{preferences\.fiveHour\.thresholdPct\}%\s*of\s*5\s*hrs/);
  assert.match(controls, /\$\{preferences\.weekly\.thresholdPct\}%\s*of\s*weekly/);
});

test("Claude guardrail switches reuse the Settings modal switch style", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");
  const styles = read("src/styles.css");

  assert.match(controls, /codex-pool-switch/);
  assert.match(controls, /codex-pool-switch-thumb/);
  assert.doesNotMatch(controls, /claude-guardrail-switch/);
  assert.doesNotMatch(styles, /\.claude-guardrail-switch(?:\s|\{|:)/);
});

test("Claude usage bars are neutral and local-activity dot is vertically centered", () => {
  const styles = read("src/styles.css");

  assert.match(styles, /\.claude-progress-fill[\s\S]*?background:\s*var\(--text-secondary\)/);
  assert.doesNotMatch(styles, /\.claude-progress-fill\s*\{[\s\S]*?linear-gradient/);
  assert.match(styles, /\.claude-capture-badge\s+\.claude-state-dot\s*\{[\s\S]*?margin-top:\s*0/);
});

test("Claude local activity cards use the shared section gap without heading labels", () => {
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const styles = read("src/styles.css");

  assert.doesNotMatch(tab, /<span>Local activity<\/span>/);
  assert.doesNotMatch(tab, /Observed on this device/);
  assert.match(styles, /\.claude-monitor\s*\{[^}]*gap:\s*8px/);
  assert.doesNotMatch(styles, /\.claude-controls-card\s*\{[^}]*margin-bottom:\s*8px/);
});

test("Settings poll-rate inputs expose the 5-second to 20-minute allowed range without showing the bounds in helper text", () => {
  const settings = read("src/components/common/SettingsModal.tsx");

  assert.match(settings, /const\s+POLL_MIN\s*=\s*5/);
  assert.match(settings, /const\s+POLL_MAX\s*=\s*1200/);
  assert.match(settings, /id="tracked-poll-rate"[\s\S]*?min=\{POLL_MIN\}[\s\S]*?max=\{POLL_MAX\}/);
  assert.match(settings, /Math\.min\(POLL_MAX/);
  assert.doesNotMatch(settings, /allowed 5s–20m/i);
});
