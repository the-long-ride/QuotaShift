import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  formatResetExpiry,
  resolveOverlayPlatformName,
  getOverlayTooltipText,
  detectOverlayHoverZone,
  computeOverlayTooltipPlacement,
} from "../../.test-build/common/overlay-tooltip.js";

const overlayAppCode =
  readFileSync("src/components/overlay/OverlayApp.tsx", "utf8") +
  (existsSync("src/components/overlay/OverlayCard.tsx")
    ? readFileSync("src/components/overlay/OverlayCard.tsx", "utf8")
    : "") +
  (existsSync("src/components/overlay/useOverlayDrag.ts")
    ? readFileSync("src/components/overlay/useOverlayDrag.ts", "utf8")
    : "");
const overlayCssCode = readFileSync("src/styles/desktop/overlay.css", "utf8");
const overlayTooltipAppCode = readFileSync("src/components/overlay/OverlayTooltipApp.tsx", "utf8");

test('formatResetExpiry formats dates into "MMM D - HH:mm" local time', () => {
  // Test with explicit Date
  const d = new Date(2026, 5, 14, 22, 0); // June 14, 2026 at 22:00 (10:00 PM)
  assert.equal(formatResetExpiry(d.toISOString()), "Jun 14 - 22:00");

  const morningDate = new Date(2026, 0, 5, 9, 5); // Jan 5, 2026 at 09:05 (9:05 AM)
  assert.equal(formatResetExpiry(morningDate.toISOString()), "Jan 5 - 09:05");

  // Returns empty string for invalid / null dates
  assert.equal(formatResetExpiry(null), "");
  assert.equal(formatResetExpiry(undefined), "");
  assert.equal(formatResetExpiry("invalid-date"), "");
});

test("resolveOverlayPlatformName returns formatted platform names", () => {
  assert.equal(resolveOverlayPlatformName("antigravity"), "Antigravity");
  assert.equal(resolveOverlayPlatformName("codex"), "ChatGPT Codex");
  assert.equal(resolveOverlayPlatformName("claude"), "Claude Code");
});

test('getOverlayTooltipText formats Avatar hover as "name - email"', () => {
  const data = {
    provider: "codex",
    label: "Personal",
    email: "user@example.com",
  };
  assert.equal(getOverlayTooltipText("avatar", data, "PRO"), "Personal - user@example.com");

  const dataNoEmail = {
    provider: "antigravity",
    label: "Primary",
    email: null,
  };
  assert.equal(getOverlayTooltipText("avatar", dataNoEmail, "PRO"), "Primary");
});

test('getOverlayTooltipText formats Tier badge and Platform logo hover as "{platform} - {Tier uppercase}"', () => {
  assert.equal(
    getOverlayTooltipText(
      "tier_platform",
      { provider: "antigravity", label: "A", tier: "PRO" },
      "PRO",
    ),
    "Antigravity - PRO",
  );
  assert.equal(
    getOverlayTooltipText("tier_platform", { provider: "codex", label: "C", tier: "FREE" }, "FREE"),
    "ChatGPT Codex - FREE",
  );
  assert.equal(
    getOverlayTooltipText("tier_platform", { provider: "claude", label: "Cl", tier: "pro" }, "PRO"),
    "Claude Code - PRO",
  );
});

test("getOverlayTooltipText formats Reset times for ChatGPT codex account", () => {
  const d = new Date(2026, 5, 14, 22, 0); // June 14, 2026 at 10:00 PM
  const dataWithExpiry = {
    provider: "codex",
    label: "Codex",
    resetCount: 3,
    resetNearestExpiresAt: d.toISOString(),
  };
  assert.equal(
    getOverlayTooltipText("reset", dataWithExpiry, "PRO"),
    "3 reset(s) remaining - nearest expiry at Jun 14 - 22:00",
  );

  const dataWithoutExpiry = {
    provider: "codex",
    label: "Codex",
    resetCount: 1,
    resetNearestExpiresAt: null,
  };
  assert.equal(getOverlayTooltipText("reset", dataWithoutExpiry, "FREE"), "1 reset(s) remaining");
});

test("Claude reset badge tooltip shows only remaining resets", () => {
  const claude = {
    provider: "claude",
    label: "Claude",
    resetCount: 1,
    resetNearestExpiresAt: "2026-10-22T23:00:00Z",
  };
  assert.equal(getOverlayTooltipText("reset", claude, "PRO"), "1 reset(s) remaining");
});

test('getOverlayTooltipText formats Other zone as "Drag to move - Double click to open dashboard."', () => {
  const data = { provider: "antigravity", label: "Main" };
  assert.equal(
    getOverlayTooltipText("other", data, "PRO"),
    "Drag to move - Double click to open dashboard.",
  );
  assert.equal(getOverlayTooltipText(null, data, "PRO"), null);
});

test("detectOverlayHoverZone accurately identifies zones from closest elements", () => {
  const makeEl = (classes) => ({
    closest: (selector) => {
      const cls = selector.replace(/^\./, "");
      return classes.includes(cls) ? {} : null;
    },
  });

  // Nested in overlay-avatar-wrap:
  assert.equal(
    detectOverlayHoverZone(makeEl(["overlay-reset-badge", "overlay-avatar-wrap", "glass-card"])),
    "reset",
  );
  assert.equal(
    detectOverlayHoverZone(makeEl(["overlay-tier-badge", "overlay-avatar-wrap", "glass-card"])),
    "tier_platform",
  );
  assert.equal(
    detectOverlayHoverZone(makeEl(["overlay-provider-badge", "overlay-avatar-wrap", "glass-card"])),
    "tier_platform",
  );
  assert.equal(detectOverlayHoverZone(makeEl(["overlay-avatar-wrap", "glass-card"])), "avatar");

  // Other card elements
  assert.equal(detectOverlayHoverZone(makeEl(["glass-card"])), "other");
  assert.equal(detectOverlayHoverZone(makeEl(["overlay-metrics", "glass-card"])), "other");
  assert.equal(detectOverlayHoverZone(null), null);
});

test("OverlayApp and styles.css implement liquid glass custom tooltip anchored at center bottom with arrow", () => {
  // OverlayApp mounts tooltip when showTooltip is true
  assert.match(overlayAppCode, /className="overlay-tooltip"/);
  assert.match(overlayAppCode, /className="overlay-tooltip-text"/);
  assert.match(overlayAppCode, /getOverlayTooltipText/);
  assert.match(overlayAppCode, /detectOverlayHoverZone/);

  // CSS defines liquid glass and positioning
  assert.match(overlayCssCode, /\.overlay-tooltip\s*\{/);
  assert.match(overlayCssCode, /top:\s*calc\(100%\s*\+\s*4px\);/);
  assert.match(overlayCssCode, /left:\s*50%;/);
  assert.match(overlayCssCode, /transform:\s*translateX\(-50%\);/);
  assert.match(overlayCssCode, /backdrop-filter:\s*blur\(16px\)\s*saturate\(190%\);/);
  assert.match(overlayCssCode, /\.overlay-tooltip\s*\{[\s\S]*?box-shadow:\s*none;/);

  // CSS defines arrow pointing up to center bottom of overlay
  assert.match(overlayCssCode, /\.overlay-tooltip::after\s*\{/);
  assert.match(overlayCssCode, /transform:\s*translateX\(-50%\)\s*rotate\(45deg\);/);
  assert.match(overlayCssCode, /border-top:\s*1px solid rgba\(255, 255, 255/);
});

test("computeOverlayTooltipPlacement places below by default and flips above when near screen bottom", () => {
  // Ample room below: card at y=100, monitor bottom at y=1080
  const belowResult = computeOverlayTooltipPlacement({
    cardRect: { left: 0, top: 0, width: 238, height: 54 },
    windowPos: { x: 500, y: 100 },
    monitorBounds: { minX: 0, maxX: 1920, minY: 0, maxY: 1080 },
    tooltipWidth: 340,
    tooltipHeight: 38,
    scale: 1,
  });
  assert.equal(belowResult.placement, "below");
  assert.equal(belowResult.y, 100 + 54 - 4); // cardScreenBottom - 4
  assert.equal(belowResult.x, 500 + (238 - 340) / 2); // centered

  // Near screen bottom: card bottom at 1060, monitor maxY at 1080 -> 1060 + 38 > 1080 -> flips above
  const aboveResult = computeOverlayTooltipPlacement({
    cardRect: { left: 0, top: 0, width: 238, height: 54 },
    windowPos: { x: 500, y: 1006 },
    monitorBounds: { minX: 0, maxX: 1920, minY: 0, maxY: 1080 },
    tooltipWidth: 340,
    tooltipHeight: 38,
    scale: 1,
  });
  assert.equal(aboveResult.placement, "above");
  assert.equal(aboveResult.y, 1006 - 38 + 4); // cardScreenY - tooltipHeight + 4
});

test("OverlayTooltipApp renders separate overlay instance with event listener and positioning", () => {
  assert.match(overlayTooltipAppCode, /export const OverlayTooltipApp/);
  assert.match(overlayTooltipAppCode, /overlay-tooltip-data/);
  assert.match(overlayTooltipAppCode, /getCurrentWebviewWindow/);
  assert.match(overlayTooltipAppCode, /win\.setPosition/);
  assert.match(overlayTooltipAppCode, /win\.show/);
  assert.match(overlayTooltipAppCode, /win\.hide/);
  assert.match(overlayTooltipAppCode, /className="overlay-tooltip-root"/);
  assert.match(overlayTooltipAppCode, /overlay-tooltip--\$\{data\.placement\}/);
});

test("OverlayApp implements 500ms hover delay and stays visible until mouse leave", () => {
  // Hover timer set for 500ms
  assert.match(overlayAppCode, /hoverTimerRef/);
  assert.match(overlayAppCode, /window\.setTimeout\([\s\S]+?,\s*500\)/);
  // Clears on mouse leave and drag
  assert.match(overlayAppCode, /onMouseLeave=\{clearHover\}/);
  assert.match(overlayAppCode, /setActiveTooltipZone\(null\)/);
});

test("computeOverlayTooltipPlacement aligns tooltip window center with card center for all platforms and DPI scales", () => {
  for (const scale of [1, 1.25, 1.5, 2]) {
    // Antigravity (340px window, 332px card, left: 4)
    const agRes = computeOverlayTooltipPlacement({
      cardRect: { left: 4, top: 6, width: 332, height: 54 },
      windowPos: { x: 500, y: 300 },
      monitorBounds: { minX: 0, maxX: 3840, minY: 0, maxY: 2160 },
      tooltipWidth: 340,
      scale,
    });
    const agCardCenterPhysical = 500 + (4 + 332 / 2) * scale;
    const agTooltipCenterPhysical = agRes.x + 340 / 2;
    assert.equal(Math.round(agTooltipCenterPhysical), Math.round(agCardCenterPhysical));
    assert.equal(Math.round(agRes.cardCenterX), Math.round(agCardCenterPhysical));

    // Codex / Claude (238px window, 230px card, left: 4)
    const codexRes = computeOverlayTooltipPlacement({
      cardRect: { left: 4, top: 6, width: 230, height: 54 },
      windowPos: { x: 500, y: 300 },
      monitorBounds: { minX: 0, maxX: 3840, minY: 0, maxY: 2160 },
      tooltipWidth: 340,
      scale,
    });
    const codexCardCenterPhysical = 500 + (4 + 230 / 2) * scale;
    const codexTooltipCenterPhysical = codexRes.x + 340 / 2;
    assert.equal(Math.round(codexTooltipCenterPhysical), Math.round(codexCardCenterPhysical));
    assert.equal(Math.round(codexRes.cardCenterX), Math.round(codexCardCenterPhysical));
  }
});

test("computeOverlayTooltipPlacement strictly preserves center alignment even near screen edges", () => {
  const res = computeOverlayTooltipPlacement({
    cardRect: { left: 4, top: 6, width: 332, height: 54 },
    windowPos: { x: 1638, y: 950 },
    monitorBounds: { minX: 0, maxX: 1920, minY: 0, maxY: 1080 },
    tooltipWidth: 340,
    tooltipHeight: 38,
    scale: 1,
  });
  const cardCenter = 1638 + 4 + 332 / 2;
  const tooltipCenter = res.x + 340 / 2;
  assert.equal(tooltipCenter, cardCenter);
});

test("computeOverlayTooltipPlacement dynamically aligns tooltip with actual getBoundingClientRect position (e.g. flex-centered Codex card)", () => {
  const res = computeOverlayTooltipPlacement({
    cardRect: { left: 23, top: 6, width: 228, height: 54 },
    windowPos: { x: 500, y: 300 },
    tooltipWidth: 340,
    tooltipHeight: 38,
    scale: 1,
  });
  const cardCenter = 500 + 23 + 228 / 2;
  const tooltipCenter = res.x + 340 / 2;
  assert.equal(tooltipCenter, cardCenter);
});

test("OverlayTooltipApp centers its actual native window on the requested physical anchor", () => {
  assert.match(overlayTooltipAppCode, /await applyScale\(\)/);
  assert.match(overlayTooltipAppCode, /const outerSize = await win\.outerSize\(\)/);
  assert.match(
    overlayTooltipAppCode,
    /Math\.round\(payload\.cardCenterX - outerSize\.width \/ 2\)/,
  );
  assert.match(
    overlayTooltipAppCode,
    /win\.setPosition\(new PhysicalPosition\(targetX, payload\.y\)\)/,
  );
});

test("computeOverlayTooltipPlacement keeps the tooltip center on the overlay center at UI scaling", () => {
  for (const uiScale of [0.8, 1, 1.25, 1.4, 2]) {
    const dpr = 1.5;
    const tooltipWidth = 340 * uiScale * dpr;
    const result = computeOverlayTooltipPlacement({
      cardRect: { left: 4, top: 6, width: 230 * uiScale, height: 54 * uiScale },
      windowPos: { x: 300, y: 180 },
      tooltipWidth,
      tooltipHeight: 38 * uiScale * dpr,
      scale: dpr,
    });
    assert.equal(Math.round(result.x + tooltipWidth / 2), Math.round(result.cardCenterX));
  }
});

test("OverlayApp centers the standalone tooltip from the actual overlay window bounds", () => {
  const appOnly = readFileSync("src/components/overlay/OverlayApp.tsx", "utf8");

  assert.match(appOnly, /Promise\.all\(\[win\.outerPosition\(\), win\.outerSize\(\)\]\)/);
  assert.match(appOnly, /const overlayCenterX = wPos\.x \+ overlaySize\.width \/ 2/);
  assert.match(appOnly, /x:\s*Math\.round\(overlayCenterX - tooltipWidth \/ 2\)/);
  assert.doesNotMatch(appOnly, /getBoundingClientRect\(\)[\s\S]*overlay-tooltip-data/);
});

test("standalone tooltip scales around its own center instead of zooming the root", () => {
  const guardrailCss = readFileSync("src/styles/desktop/overlay-guardrails.css", "utf8");

  assert.doesNotMatch(
    guardrailCss,
    /\.overlay-tooltip-root\s*\{[\s\S]*?zoom:\s*var\(--overlay-ui-scale/,
  );
  assert.match(
    guardrailCss,
    /\.overlay-tooltip-root \.overlay-tooltip\s*\{[\s\S]*?transform:\s*scale\(var\(--overlay-ui-scale, 1\)\);[\s\S]*?transform-origin:\s*center;/,
  );
});

test("standalone tooltip is non-focusable so menu hover is not interrupted", () => {
  assert.match(overlayTooltipAppCode, /win\.setFocusable\(false\)/);
});

test("menu tooltip payload is marked so Mono can add only its fake border", () => {
  const menuCode = readFileSync("src/components/overlay/OverlayContextMenu.tsx", "utf8");
  const themeCss = readFileSync("src/styles/desktop/overlay-themes.css", "utf8");

  assert.match(menuCode, /source:\s*"menu"/);
  assert.match(overlayTooltipAppCode, /data\.source === "menu"/);
  assert.match(themeCss, /\.overlay-tooltip--menu\s*\{/);
  assert.match(
    themeCss,
    /\.overlay-tooltip--menu\s*\{[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-edge\)/,
  );
});


test("overlay tooltip helpers cover guardrail, fallback identity, numeric reset, and unmatched hover branches", () => {
  const claude = {
    provider: "claude",
    label: "",
    email: "",
    tier: "",
    claudeGuardrails: {
      fiveHourEnabled: true,
      fiveHourThresholdPct: 95,
      weeklyEnabled: true,
      weeklyThresholdPct: 98,
    },
  };
  assert.equal(
    getOverlayTooltipText("guardrail_five_hour", claude, ""),
    "Auto-suspend at 95% (5-hour limit).",
  );
  assert.equal(
    getOverlayTooltipText("guardrail_weekly", claude, ""),
    "Auto-suspend at 98% (weekly limit).",
  );
  assert.equal(
    getOverlayTooltipText("guardrail_five_hour", {
      ...claude,
      claudeGuardrails: { ...claude.claudeGuardrails, fiveHourEnabled: false },
    }, ""),
    null,
  );
  assert.equal(getOverlayTooltipText("avatar", claude, ""), "Account");
  assert.equal(
    getOverlayTooltipText("tier_platform", { provider: "codex", label: "" }, ""),
    "ChatGPT Codex - FREE",
  );
  assert.equal(
    getOverlayTooltipText("reset", { provider: "codex", label: "", resetCount: undefined }, ""),
    "0 reset(s) remaining",
  );

  const seconds = Math.floor(new Date(2026, 0, 2, 3, 4).getTime() / 1000);
  const millis = new Date(2026, 0, 2, 3, 4).getTime();
  assert.equal(formatResetExpiry(seconds), "Jan 2 - 03:04");
  assert.equal(formatResetExpiry(millis), "Jan 2 - 03:04");

  const makeEl = (classes) => ({
    closest: (selector) => classes.includes(selector.replace(/^\./, "")) ? {} : null,
  });
  assert.equal(
    detectOverlayHoverZone(makeEl(["overlay-guardrail-badge--five-hour", "glass-card"])),
    "guardrail_five_hour",
  );
  assert.equal(
    detectOverlayHoverZone(makeEl(["overlay-guardrail-badge--weekly", "glass-card"])),
    "guardrail_weekly",
  );
  assert.equal(detectOverlayHoverZone(makeEl(["unrelated"])), null);
});

test("tooltip placement covers defaults, no-monitor mode, scale fallback, and top clamping", () => {
  const defaults = computeOverlayTooltipPlacement({
    cardRect: { left: 10, top: 20, width: 100, height: 50 },
    windowPos: { x: 5, y: 7 },
  });
  assert.equal(defaults.placement, "below");
  assert.equal(defaults.x, -105);
  assert.equal(defaults.y, 73);

  const zeroScale = computeOverlayTooltipPlacement({
    cardRect: { left: 0, top: 0, width: 100, height: 20 },
    windowPos: { x: 0, y: 0 },
    scale: 0,
    tooltipWidth: 100,
  });
  assert.equal(zeroScale.cardCenterX, 50);

  const clamped = computeOverlayTooltipPlacement({
    cardRect: { left: 0, top: 2, width: 100, height: 20 },
    windowPos: { x: 0, y: 0 },
    monitorBounds: { minX: 0, maxX: 100, minY: 0, maxY: 30 },
    tooltipWidth: 100,
    tooltipHeight: 38,
  });
  assert.equal(clamped.placement, "above");
  assert.equal(clamped.y, 0);
});
