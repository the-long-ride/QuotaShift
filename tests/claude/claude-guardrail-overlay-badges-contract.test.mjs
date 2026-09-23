import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { readWithCssImports } from "../css-helper.mjs";

const read = (path) => {
  const content = readWithCssImports(new URL(`../../${path}`, import.meta.url));
  if (path === "src/components/overlay/OverlayApp.tsx") {
    const cardPath = new URL("../../src/components/overlay/OverlayCard.tsx", import.meta.url);
    return content + (fs.existsSync(cardPath) ? readWithCssImports(cardPath) : "");
  }
  return content;
};

function inputTagByLabel(source, label) {
  const marker = `aria-label="${label}"`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing input: ${label}`);
  const start = source.lastIndexOf("<input", markerIndex);
  const end = source.indexOf("/>", markerIndex);
  assert.notEqual(start, -1, `missing input start: ${label}`);
  assert.notEqual(end, -1, `missing input end: ${label}`);
  return source.slice(start, end + 2);
}

test("Claude guardrail numeric fields stay editable regardless of switch state", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");

  const pollInput = inputTagByLabel(controls, "Claude Code guardrail poll interval in seconds");
  const fiveHourInput = inputTagByLabel(controls, "Claude Code 5-hour auto-suspend threshold percent");
  const weeklyInput = inputTagByLabel(controls, "Claude Code weekly auto-suspend threshold percent");

  assert.doesNotMatch(pollInput, /\bdisabled\s*=/);
  assert.doesNotMatch(fiveHourInput, /\bdisabled\s*=/);
  assert.doesNotMatch(weeklyInput, /\bdisabled\s*=/);
  assert.match(controls, /onBlur=\{commitPoll\}/);
  assert.match(controls, /commitThreshold\("fiveHour", fiveHourDraft\)/);
  assert.match(controls, /commitThreshold\("weekly", weeklyDraft\)/);
});

test("Claude Code guardrails are active from either window switch without a master switch", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");
  const hook = read("src/hooks/claude/useClaudeMonitor.ts");

  assert.doesNotMatch(controls, /label="Enable Claude Code guardrails"/);
  assert.doesNotMatch(controls, /disabled=\{!preferences\.enabled\}/);
  assert.match(controls, /preferences\.fiveHour\.enabled\s*\|\|\s*preferences\.weekly\.enabled/);
  assert.match(
    hook,
    /claudePreferences\.fiveHour\.enabled\s*\|\|\s*claudePreferences\.weekly\.enabled/,
  );
  assert.doesNotMatch(hook, /if\s*\(!preferences\.enabled\)\s*return/);
  assert.match(hook, /trackedProvider\s*===\s*"claude"[\s\S]*guardrailsActive/);
});

test("Claude overlay payload carries each enabled guardrail threshold without master gating", () => {
  const helper = read("src/utils/common/app-overlay-helpers.ts");
  const preferences = read("src/utils/common/claude-preferences.ts");
  const overlaySync = read("src/utils/common/claude-overlay-sync.ts");
  const types = read("src/utils/common/overlay-types.ts");

  assert.match(types, /claudeGuardrails\?/);
  assert.match(types, /fiveHourThresholdPct/);
  assert.match(types, /weeklyThresholdPct/);
  assert.match(helper, /loadClaudePreferences/);
  assert.match(helper, /const\s+preferences\s*=\s*loadClaudePreferences\(\)/);
  assert.match(helper, /buildClaudeGuardrailOverlayState\(preferences\)/);
  assert.match(overlaySync, /fiveHourEnabled:\s*preferences\.fiveHour\.enabled/);
  assert.match(overlaySync, /weeklyEnabled:\s*preferences\.weekly\.enabled/);
  assert.doesNotMatch(
    overlaySync,
    /preferences\.enabled\s*&&\s*preferences\.(fiveHour|weekly)\.enabled/,
  );
  assert.match(overlaySync, /fiveHourThresholdPct:\s*preferences\.fiveHour\.thresholdPct/);
  assert.match(overlaySync, /weeklyThresholdPct:\s*preferences\.weekly\.thresholdPct/);
  assert.match(overlaySync, /quotashift_overlay_data/);
  assert.match(overlaySync, /claudeGuardrails:\s*buildClaudeGuardrailOverlayState\(preferences\)/);
});

test("Claude overlay uses Claude logo avatar and percentage-only outline guardrails", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const styles = read("src/styles.css");

  assert.match(overlay, /data\.provider\s*===\s*"claude"[\s\S]{0,220}<ClaudeLogo/);
  assert.match(overlay, /claudeGuardrails\?\.fiveHourEnabled/);
  assert.match(overlay, /`\$\{data\.claudeGuardrails\.fiveHourThresholdPct\}%`/);
  assert.match(overlay, /claudeGuardrails\?\.weeklyEnabled/);
  assert.match(overlay, /`\$\{data\.claudeGuardrails\.weeklyThresholdPct\}%`/);
  assert.doesNotMatch(overlay, /`5HR \$\{data\.claudeGuardrails\.fiveHourThresholdPct\}%`/);
  assert.doesNotMatch(overlay, /`WK \$\{data\.claudeGuardrails\.weeklyThresholdPct\}%`/);
  assert.doesNotMatch(overlay, /M12 22\.943C3\.533 18\.32/);
  assert.match(overlay, /data\.provider\s*!==\s*"claude"[\s\S]{0,220}overlay-provider-badge/);
  assert.match(styles, /\.overlay-guardrail-badge\s*\{[\s\S]*border-radius:\s*4px/i);
  assert.match(styles, /\.overlay-guardrail-badge\s*\{[\s\S]*padding:\s*0\s+2px/i);
  assert.match(
    styles,
    /\.overlay-guardrail-badge\s*\{[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.35\)/i,
  );
  assert.match(styles, /\.overlay-guardrail-badge[\s\S]*color:\s*#fff/i);
  assert.doesNotMatch(styles, /\.overlay-guardrail-badge svg\s*\{/);
  assert.match(styles, /\.overlay-guardrail-badge--five-hour\s*\{[\s\S]*top:[\s\S]*right:/);
  assert.match(styles, /\.overlay-guardrail-badge--weekly\s*\{[\s\S]*bottom:[\s\S]*right:/);
});

test("Claude guardrail tooltips describe the configured suspend threshold", () => {
  const tooltip = read("src/utils/common/overlay-tooltip.ts");

  assert.match(tooltip, /guardrail_five_hour/);
  assert.match(tooltip, /guardrail_weekly/);
  assert.match(
    tooltip,
    /Auto-suspend at \$\{data\.claudeGuardrails\.fiveHourThresholdPct\}% \(5-hour limit\)/,
  );
  assert.match(
    tooltip,
    /Auto-suspend at \$\{data\.claudeGuardrails\.weeklyThresholdPct\}% \(weekly limit\)/,
  );
  assert.match(tooltip, /\.overlay-guardrail-badge--five-hour/);
  assert.match(tooltip, /\.overlay-guardrail-badge--weekly/);
});
