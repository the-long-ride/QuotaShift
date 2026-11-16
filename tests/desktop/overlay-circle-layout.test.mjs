import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  CIRCLE_ORIENTATION_KEY,
  buildCircleSvgArcs,
  buildCircleTelemetry,
  loadCircleOrientation,
  normalizeCircleOrientation,
  saveCircleOrientation,
} from "../../.test-build/common/overlay/circle-layout.js";

const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.resolve(rel), "utf8");

function loadTsx(relPath) {
  const fullPath = path.resolve(relPath);
  const src = readFileSync(fullPath, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const fn = new Function("require", "module", "exports", outputText);
  const customRequire = (specifier) => {
    if (specifier === "@tauri-apps/api/event") {
      return { emit: async () => {}, listen: async () => () => {} };
    }
    if (specifier === "@tauri-apps/api/webviewWindow") {
      return { getCurrentWebviewWindow: () => ({}) };
    }
    if (specifier.startsWith(".")) {
      const raw = path.resolve(path.dirname(fullPath), specifier);
      const stem = raw.replace(/\.(jsx?|tsx?)$/, "");
      for (const candidate of [
        raw,
        stem,
        `${stem}.ts`,
        `${stem}.tsx`,
        path.join(raw, "index.ts"),
      ]) {
        if (existsSync(candidate)) return loadTsx(path.relative(process.cwd(), candidate));
      }
    }
    return require(specifier);
  };
  fn(customRequire, mod, mod.exports);
  return mod.exports;
}

const { OverlayCircleNode } = loadTsx("src/components/overlay/OverlayCircleNode.tsx");
const { OverlayCircleStack } = loadTsx("src/components/overlay/OverlayCircleStack.tsx");
const { computeCirclePanelAnchor } = loadTsx("src/components/overlay/useCircleOverlayActions.ts");

const memoryStorage = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};

test("circle orientation normalizes, loads, and persists with safe fallback", () => {
  assert.equal(normalizeCircleOrientation("horizontal"), "horizontal");
  assert.equal(normalizeCircleOrientation("vertical"), "vertical");
  assert.equal(normalizeCircleOrientation("invalid"), "vertical");
  const store = memoryStorage();
  assert.equal(loadCircleOrientation(store), "vertical");
  assert.equal(saveCircleOrientation("horizontal", store), "horizontal");
  assert.equal(store.getItem(CIRCLE_ORIENTATION_KEY), "horizontal");
  assert.equal(loadCircleOrientation(store), "horizontal");
});

test("buildCircleTelemetry builds top Argon + parallel 5H/WK arcs for Antigravity pools", () => {
  const agData = {
    provider: "antigravity",
    quotaRows: [
      { label: "Gemini Models", fiveHourPercent: 97, weeklyPercent: 99 },
      { label: "Claude / OpenAI", fiveHourPercent: 18, weeklyPercent: 100 },
      { label: "Gemini 4 Argon", fiveHourPercent: null, weeklyPercent: 85 },
    ],
  };

  const rem = buildCircleTelemetry(agData, false);
  assert.deepEqual(
    rem.segments.map((s) => ({
      id: s.id,
      rem: s.remainingPercent,
      tone: s.tone,
      slot: s.placement?.slot,
      band: s.placement?.band,
      rev: Boolean(s.placement?.reverseFill),
    })),
    [
      {
        id: "pool:argon:wk",
        rem: 85,
        tone: "normal",
        slot: "top-left-exhausted",
        band: "single",
        rev: false,
      },
      { id: "pool:left:5h", rem: 97, tone: "normal", slot: "left", band: "outer", rev: false },
      { id: "pool:left:wk", rem: 99, tone: "normal", slot: "left", band: "inner", rev: false },
      { id: "pool:right:5h", rem: 18, tone: "warning", slot: "right", band: "outer", rev: false },
      { id: "pool:right:wk", rem: 100, tone: "normal", slot: "right", band: "inner", rev: false },
    ],
  );
  assert.equal(rem.summaryPercent, 18);
  assert.equal(rem.summaryTone, "warning");
  assert.deepEqual(
    rem.badgeMetrics.map((m) => ({ id: m.id, pct: m.displayPercent, tone: m.tone })),
    [
      { id: "five", pct: 18, tone: "warning" },
      { id: "weekly", pct: 85, tone: "normal" },
    ],
  );

  const used = buildCircleTelemetry(agData, true);
  assert.deepEqual(
    used.segments.map((s) => s.displayPercent),
    [15, 3, 1, 82, 0],
  );
  assert.equal(used.segments[0].placement?.reverseFill, true);
  assert.equal(used.summaryPercent, 82);
  assert.equal(used.summaryTone, "warning");
  assert.deepEqual(
    used.badgeMetrics.map((m) => m.displayPercent),
    [82, 15],
  );

  const remArcs = buildCircleSvgArcs(rem.segments, 32, 32, 28);
  const usedArcs = buildCircleSvgArcs(used.segments, 32, 32, 28);
  assert.equal(remArcs[0].parallel, false);
  assert.equal(remArcs[1].parallel, true);
  assert.equal(remArcs[2].parallel, true);
  assert.match(remArcs[0].fillPath, /^M .* A 27\.5 27\.5 0 0 1 /);
  assert.match(usedArcs[0].fillPath, /^M .* A 27\.5 27\.5 0 0 0 /);
  assert.match(remArcs[1].trackPath, / A 29\.2 29\.2 0 0 1 /);
  assert.match(remArcs[2].trackPath, / A 25\.5 25\.5 0 0 1 /);
  assert.match(remArcs[3].trackPath, / A 29\.2 29\.2 0 0 0 /);
  assert.match(remArcs[4].trackPath, / A 25\.5 25\.5 0 0 0 /);
});

test("buildCircleTelemetry supports Gemini-only Antigravity, Codex singleBars, monthly-only, and empty fallbacks", () => {
  const geminiOnly = buildCircleTelemetry(
    {
      provider: "antigravity",
      quotaRows: [{ label: "Gemini Models", fiveHourPercent: 60, weeklyPercent: 8 }],
    },
    false,
  );
  assert.equal(geminiOnly.segments.length, 2);
  assert.equal(geminiOnly.summaryPercent, 8);
  assert.equal(geminiOnly.summaryTone, "critical");
  assert.deepEqual(
    geminiOnly.badgeMetrics.map((m) => ({ id: m.id, pct: m.displayPercent, tone: m.tone })),
    [
      { id: "five", pct: 60, tone: "normal" },
      { id: "weekly", pct: 8, tone: "critical" },
    ],
  );

  const codex = buildCircleTelemetry(
    {
      provider: "codex",
      singleBars: [
        { label: "5H", percent: 70 },
        { label: "WK", percent: 45 },
      ],
    },
    false,
  );
  assert.equal(codex.segments.length, 2);
  assert.equal(codex.summaryPercent, 45);
  assert.deepEqual(
    codex.badgeMetrics.map((m) => ({ id: m.id, pct: m.displayPercent })),
    [
      { id: "five", pct: 70 },
      { id: "weekly", pct: 45 },
    ],
  );

  const monthlyCodex = buildCircleTelemetry(
    {
      provider: "codex",
      singleBars: [{ label: "Monthly", percent: 62 }],
    },
    false,
  );
  assert.deepEqual(
    monthlyCodex.badgeMetrics.map((m) => ({ id: m.id, pct: m.displayPercent })),
    [{ id: "mo", pct: 62 }],
  );

  const empty = buildCircleTelemetry({ provider: "claude" }, false);
  assert.equal(empty.segments.length, 1);
  assert.equal(empty.summaryPercent, null);
  assert.deepEqual(empty.badgeMetrics, []);
});

test("buildCircleSvgArcs produces distinct arc paths for 1, 2, and 3 segments", () => {
  const segs3 = [
    {
      id: "a",
      label: "A",
      remainingPercent: 100,
      displayPercent: 100,
      fillRatio: 1,
      tone: "normal",
    },
    { id: "b", label: "B", remainingPercent: 0, displayPercent: 0, fillRatio: 0, tone: "critical" },
    {
      id: "c",
      label: "C",
      remainingPercent: 50,
      displayPercent: 50,
      fillRatio: 0.5,
      tone: "normal",
    },
  ];
  const arcs3 = buildCircleSvgArcs(segs3, 28, 28, 23);
  assert.equal(arcs3.length, 3);
  assert.ok(arcs3[0].fillPath);
  assert.equal(arcs3[1].fillPath, null);
  assert.ok(arcs3[2].fillPath);

  const arcs1 = buildCircleSvgArcs([segs3[0]], 28, 28, 23);
  assert.equal(arcs1.length, 1);
  assert.match(arcs1[0].trackPath, /^M .* A 23 23 0 1 1/);

  const arcs2Full = buildCircleSvgArcs(
    [
      {
        id: "five",
        label: "5H",
        remainingPercent: 100,
        displayPercent: 100,
        fillRatio: 1,
        tone: "normal",
      },
      {
        id: "weekly",
        label: "WK",
        remainingPercent: 100,
        displayPercent: 100,
        fillRatio: 1,
        tone: "normal",
      },
    ],
    32,
    32,
    28,
  );
  assert.equal(arcs2Full.length, 2);
  const parseEndpoints = (svgPath) => {
    const m = /^M ([\d.-]+) ([\d.-]+) A [\d.-]+ [\d.-]+ 0 \d ([01]) ([\d.-]+) ([\d.-]+)$/.exec(
      svgPath,
    );
    return {
      x1: Number(m[1]),
      y1: Number(m[2]),
      sweep: Number(m[3]),
      x2: Number(m[4]),
      y2: Number(m[5]),
    };
  };
  const leftEnd = parseEndpoints(arcs2Full[0].fillPath);
  const rightEnd = parseEndpoints(arcs2Full[1].fillPath);
  assert.equal(leftEnd.sweep, 1);
  assert.equal(rightEnd.sweep, 0);
  assert.ok(leftEnd.x1 < 32 && leftEnd.y1 > 32 && leftEnd.y2 < 32);
  assert.ok(rightEnd.x1 > 32 && rightEnd.y1 > 32 && rightEnd.y2 < 32);
  assert.equal(leftEnd.y1, rightEnd.y1);
  assert.equal(leftEnd.y2, rightEnd.y2);

  const parallel2Pool = buildCircleTelemetry(
    {
      provider: "antigravity",
      quotaRows: [
        { label: "Gemini Models", fiveHourPercent: 100, weeklyPercent: 100 },
        { label: "Claude / OpenAI", fiveHourPercent: 100, weeklyPercent: 100 },
      ],
    },
    false,
  );
  const parallelArcs = buildCircleSvgArcs(parallel2Pool.segments, 29, 29, 25);
  assert.equal(parallelArcs.length, 4);
  const leftOuter = parseEndpoints(parallelArcs[0].trackPath);
  const leftInner = parseEndpoints(parallelArcs[1].trackPath);
  const rightOuter = parseEndpoints(parallelArcs[2].trackPath);
  const rightInner = parseEndpoints(parallelArcs[3].trackPath);
  assert.ok(Math.abs(leftOuter.x2 - leftInner.x2) <= 0.05);
  assert.ok(Math.abs(rightOuter.x2 - rightInner.x2) <= 0.05);
  assert.ok(Math.abs(leftOuter.x1 - leftInner.x1) <= 0.05);
  assert.ok(Math.abs(rightOuter.x1 - rightInner.x1) <= 0.05);
});

test("computeCirclePanelAnchor flips edges symmetrically on both vertical and horizontal orientations", () => {
  const rect = { left: 4, top: 4, right: 60, bottom: 60, width: 56, height: 56 };
  const rightAnchor = computeCirclePanelAnchor(
    "vertical",
    { x: 100, y: 100 },
    { width: 64, height: 180 },
    rect,
    64,
    1920,
    1080,
    1,
  );
  assert.equal(rightAnchor.placement, "right");
  assert.equal(rightAnchor.anchorX, 160);

  const leftAnchor = computeCirclePanelAnchor(
    "vertical",
    { x: 1850, y: 100 },
    { width: 64, height: 180 },
    rect,
    64,
    1920,
    1080,
    1,
  );
  assert.equal(leftAnchor.placement, "left");
  assert.equal(leftAnchor.anchorX, 1854);

  const belowAnchor = computeCirclePanelAnchor(
    "horizontal",
    { x: 200, y: 20 },
    { width: 180, height: 70 },
    rect,
    180,
    1920,
    1080,
    1,
  );
  assert.equal(belowAnchor.placement, "below");
  assert.equal(belowAnchor.anchorY, 80);

  const aboveAnchor = computeCirclePanelAnchor(
    "horizontal",
    { x: 200, y: 980 },
    { width: 180, height: 70 },
    rect,
    180,
    1920,
    1080,
    1,
  );
  assert.equal(aboveAnchor.placement, "above");
  assert.equal(aboveAnchor.anchorY, 984);
});

test("OverlayCircleNode and OverlayCircleStack render Antigravity 3-pool arcs, avatar zone badges, and horizontal arrows", () => {
  const agCard = {
    provider: "antigravity",
    accountId: "ag-1",
    label: "Antigravity Pro",
    tier: "PRO",
    resetCount: 2,
    quotaRows: [
      { label: "Gemini Models", fiveHourPercent: 97, weeklyPercent: 99 },
      { label: "Claude / OpenAI", fiveHourPercent: 100, weeklyPercent: 100 },
      { label: "Gemini 4 Argon", fiveHourPercent: null, weeklyPercent: 100 },
    ],
  };
  const claudeCard = {
    provider: "claude",
    accountId: "cl-1",
    label: "WorkClaude",
    tier: "MAX",
    resetCount: 3,
    claudeGuardrails: {
      fiveHourEnabled: true,
      fiveHourThresholdPct: 80,
      weeklyEnabled: true,
      weeklyThresholdPct: 90,
    },
    singleBars: [
      { label: "5H", percent: 75 },
      { label: "WK", percent: 50 },
    ],
  };

  const stackMarkup = renderToStaticMarkup(
    React.createElement(OverlayCircleStack, {
      cards: [agCard, claudeCard, agCard, claudeCard],
      orientation: "horizontal",
      avatarError: false,
      setAvatarError: () => {},
      onHoverNode: () => {},
      onLeaveNode: () => {},
      onContextMenuNode: () => {},
    }),
  );
  assert.ok(stackMarkup.includes('data-orientation="horizontal"'));
  assert.ok(stackMarkup.includes("overlay-nav-arrow--right"));
  assert.ok(stackMarkup.includes("overlay-circle-arc-fill"));
  assert.ok(stackMarkup.includes("overlay-circle-avatar-zone"));
  assert.ok(stackMarkup.includes("overlay-circle-bottom-badges"));
  assert.ok(stackMarkup.includes("overlay-circle-tier-badge"));
  assert.ok(stackMarkup.includes("overlay-circle-provider-badge"));
  assert.ok(stackMarkup.includes("overlay-circle-reset-badge"));
  assert.ok(stackMarkup.includes("overlay-circle-guardrail-badge--five-hour"));
  assert.ok(stackMarkup.includes("overlay-circle-guardrail-badge--weekly"));
  assert.ok(stackMarkup.includes(">80%<"));
  assert.ok(stackMarkup.includes(">90%<"));
  assert.ok(stackMarkup.includes("overlay-claude-bg-logo"));
  assert.ok(stackMarkup.includes(">W<"));
});

test("AppearanceSettingsSection shows CircleOrientationRow when displayMode is overlay or circle", () => {
  const section = read("src/components/common/settings/AppearanceSettingsSection.tsx");
  const orientationRow = read("src/components/common/accounts/CircleOrientationRow.tsx");
  assert.match(
    section,
    /\(displayMode === "overlay" \|\| displayMode === "circle"\) && <CircleOrientationRow \/>/,
  );
  assert.match(orientationRow, /Overlay stack layout/);
  assert.match(orientationRow, /Vertical/);
  assert.match(orientationRow, /Horizontal/);
  assert.match(orientationRow, /data-segments="2"/);
});

test("horizontal circle slot overrides overlay-card-slot full width and inset avatar ring geometry", () => {
  const circleCss = read("src/styles/desktop/overlay-circle.css");
  const bridge = read("src/components/overlay/OverlayWindowSizingBridge.tsx");
  const circleNode = read("src/components/overlay/OverlayCircleNode.tsx");

  assert.match(circleCss, /\.overlay-circle-slot\s*\{[\s\S]*?width:\s*auto;/);
  assert.match(circleCss, /\.overlay-circle-slot\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;/);
  assert.match(
    circleCss,
    /\.overlay-circle-cards \.overlay-nav-arrow\s*\{[\s\S]*?width:\s*22px;[\s\S]*?height:\s*22px;[\s\S]*?border-radius:\s*6px;/,
  );
  assert.match(
    circleCss,
    /\.overlay-circle-node\s*\{[\s\S]*?width:\s*58px;[\s\S]*?height:\s*58px;/,
  );
  assert.match(circleCss, /\.overlay-circle-avatar-zone\s*\{[\s\S]*?width:\s*40px;/);
  assert.match(
    circleCss,
    /\.overlay-circle-badge\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?min-width:\s*13px;[\s\S]*?height:\s*13px;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?line-height:\s*1;/,
  );
  assert.match(
    circleCss,
    /\.overlay-circle-bottom-badges\s*\{[\s\S]*?bottom:\s*2px;[\s\S]*?display:\s*inline-flex;[\s\S]*?gap:\s*2px;/,
  );
  assert.match(circleCss, /\.overlay-circle-tier-badge\s*\{[\s\S]*?position:\s*static;/);
  assert.match(
    circleCss,
    /\.overlay-circle-reset-badge\s*\{[\s\S]*?top:\s*1px;[\s\S]*?right:\s*1px;/,
  );
  assert.match(
    circleCss,
    /\.overlay-circle-node\[data-provider="claude"\] \.overlay-circle-reset-badge\s*\{[\s\S]*?left:\s*1px;/,
  );
  assert.match(
    circleCss,
    /\.overlay-circle-guardrail-badge--five-hour\s*\{[\s\S]*?top:\s*1px;[\s\S]*?right:\s*1px;/,
  );
  assert.match(
    circleCss,
    /\.overlay-circle-guardrail-badge--weekly\s*\{[\s\S]*?position:\s*static;/,
  );
  assert.match(
    circleCss,
    /\.overlay-circle-provider-badge\s*\{[\s\S]*?position:\s*static;[\s\S]*?width:\s*13px;[\s\S]*?height:\s*13px;/,
  );
  assert.match(circleCss, /\.overlay-circle-arc-track--parallel[\s\S]*?stroke-width:\s*2\.2;/);
  const twoPoolTelemetry = buildCircleTelemetry(
    {
      provider: "antigravity",
      quotaRows: [
        { label: "Gemini Models", fiveHourPercent: 80, weeklyPercent: 90 },
        { label: "Claude / OpenAI", fiveHourPercent: 40, weeklyPercent: 70 },
      ],
    },
    false,
  );
  assert.equal(twoPoolTelemetry.segments.length, 4);
  assert.equal(
    twoPoolTelemetry.segments.every((s) => !s.placement?.hasTopPool),
    true,
  );
  assert.match(bridge, /attributeFilter:\s*\[\s*"data-orientation"/);
  assert.match(circleNode, /const RING_BOX_SIZE = 58;/);
  assert.match(circleNode, /const RING_RADIUS = 25;/);
  assert.match(circleNode, /<OpenAILogo size=\{8\} \/>/);
  assert.match(circleNode, /<AntigravityLogo size=\{8\} \/>/);
});

test("QuotaDisplayRow and settings motion CSS expose the 4 display modes including Circle", () => {
  const row = read("src/components/common/accounts/QuotaDisplayRow.tsx");
  const motion = read("src/styles/settings/settings-segment-motion.css");
  assert.match(row, /data-segments="4"/);
  assert.match(row, /mode:\s*"circle"/);
  assert.match(row, /label:\s*"Circle"/);
  assert.match(row, /label:\s*"Card"/);
  assert.match(motion, /\[data-segments="4"\]/);
});

test("circle context menu stays open across mouseleave and removes below-placement gap", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const menuView = read("src/components/taskbar/TaskbarContextMenuView.tsx");
  const menu = read("src/components/overlay/tooltip/OverlayContextMenu.tsx");
  const css = read("src/styles/desktop/taskbar-tooltip.css");

  assert.match(app, /if\s*\(circleMenuOpenRef\.current\)\s*return;/);
  assert.match(app, /useCircleOverlayActions\(circleMenuOpenRef\)/);
  assert.match(menuView, /data-placement=\{placement\}/);
  assert.match(menuView, /tooltipPlacement=\{placement === "below" \? "below" : "above"\}/);
  assert.match(menuView, /menuPlacement=\{placement\}/);
  assert.match(menu, /overlay-tooltip--below/);
  assert.match(
    css,
    /\.taskbar-menu-root\[data-placement="below"\]\s*\{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?padding-top:\s*3px;[\s\S]*?padding-bottom:\s*28px;/,
  );
  assert.match(
    css,
    /\.taskbar-menu-root\[data-placement="left"\]\s*\{[\s\S]*?align-items:\s*flex-end;[\s\S]*?padding:\s*28px 4px 28px 72px;/,
  );
  assert.match(
    css,
    /\.taskbar-menu-root\[data-placement="right"\]\s*\{[\s\S]*?align-items:\s*flex-start;[\s\S]*?padding:\s*28px 72px 28px 4px;/,
  );
  assert.match(
    css,
    /\.taskbar-menu-root\[data-placement="left"\] \.overlay-context-menu\s*\{[\s\S]*?margin-right:\s*0\s*!important;/,
  );
});

test("circle percent badge renders 5h/wk pair or single monthly % with glass/mono theme styling", () => {
  const circleCss = read("src/styles/desktop/overlay-circle.css");
  const pairMarkup = renderToStaticMarkup(
    React.createElement(OverlayCircleNode, {
      data: {
        provider: "claude",
        accountId: "c1",
        label: "Dev",
        fiveHourPercent: 77,
        weeklyPercent: 13,
      },
      avatarError: false,
      setAvatarError: () => {},
      onHover: () => {},
      onLeave: () => {},
    }),
  );
  assert.ok(pairMarkup.includes("overlay-circle-pct-val--normal"));
  assert.ok(pairMarkup.includes(">23%<"));
  assert.ok(pairMarkup.includes("overlay-circle-pct-sep"));
  assert.ok(pairMarkup.includes("overlay-circle-pct-val--warning"));
  assert.ok(pairMarkup.includes(">87%<"));

  const monthlyMarkup = renderToStaticMarkup(
    React.createElement(OverlayCircleNode, {
      data: {
        provider: "codex",
        accountId: "x1",
        label: "Free",
        singleBars: [{ label: "MO", percent: 44 }],
      },
      avatarError: false,
      setAvatarError: () => {},
      onHover: () => {},
      onLeave: () => {},
    }),
  );
  assert.ok(monthlyMarkup.includes(">56%<"));
  assert.ok(!monthlyMarkup.includes("overlay-circle-pct-sep"));

  assert.match(
    circleCss,
    /\.overlay-circle-pct-badge\s*\{[\s\S]*?bottom:\s*-4px;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?border-radius:\s*4px;/,
  );
  assert.match(circleCss, /\.overlay-circle-pct-badge\s*\{[\s\S]*?backdrop-filter:\s*blur\(14px\)/);
  assert.match(circleCss, /\.overlay-circle-pct-badge\s*\{[\s\S]*?line-height:\s*1;/);
  assert.doesNotMatch(circleCss, /\.overlay-circle-pct-badge--warning/);
  assert.doesNotMatch(circleCss, /\.overlay-circle-pct-badge--critical/);
  assert.match(
    circleCss,
    /\[data-overlay-theme="mono"\] \.overlay-circle-pct-badge\s*\{[\s\S]*?background:\s*var\(--overlay-mono-bg\);/,
  );
});
