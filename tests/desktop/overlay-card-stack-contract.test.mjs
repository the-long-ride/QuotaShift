import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("overlay renders tracked accounts in viewport with mapped indices", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  assert.match(app, /listOverlayAccounts\(data\)/);
  assert.match(app, /<OverlayCardStack[\s\S]*cards=\{cards\}/);
  assert.match(app, /additionalAccounts\?: OverlayAccountData\[\]/);
  assert.match(stack, /visibleCards\.map\(/);
  assert.match(stack, /data-overlay-card-index/);
  assert.match(stack, /showTooltip=\{showTooltip && actualIndex === activeIndex\}/);
});

test("tooltip follows the hovered card, not always the primary", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  assert.match(app, /resolveHoveredCardIndex\(event\.target as HTMLElement, cards\.length\)/);
  assert.match(app, /getOverlayTooltipText\(activeTooltipZone, tooltipData, tierText\)/);
});

test("sizing bridge measures the whole card stack", () => {
  const bridge = read("src/components/overlay/OverlayWindowSizingBridge.tsx");
  const css = read("src/styles/desktop/ui-adjustment.css");
  assert.match(bridge, /\.overlay-container \.overlay-cards/);
  assert.match(
    css,
    /\.overlay-cards\s*\{[^}]*flex-direction:\s*column[^}]*width:\s*max-content[^}]*height:\s*max-content/,
  );
});

test("overlay paginates viewport with arrow buttons and wheel scrolling while suppressing scrollbars", () => {
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  const css = read("src/styles/desktop/ui-adjustment.css");
  assert.match(stack, /<OverlayNavArrow[\s\S]*direction="up"/);
  assert.match(stack, /<OverlayNavArrow[\s\S]*direction="down"/);
  assert.match(stack, /onWheel=\{handleWheel\}/);
  assert.match(css, /\.overlay-cards\s*\{[\s\S]*scrollbar-width:\s*none;/);
  assert.match(css, /\.overlay-cards::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
  assert.match(css, /\.overlay-nav-arrow/);
});

test("overlay cards align left and stretch across cross-axis to match widest card", () => {
  const overlayCss = read("src/styles/desktop/overlay.css");
  const uiAdjustCss = read("src/styles/desktop/ui-adjustment.css");
  const tooltipApp = read("src/components/overlay/overlay-tooltip-placement.ts");

  assert.match(overlayCss, /\.overlay-container\s*\{[\s\S]*?align-items:\s*flex-start;/);
  assert.match(uiAdjustCss, /\.overlay-cards\s*\{[\s\S]*?align-items:\s*stretch;/);
  assert.match(uiAdjustCss, /\.overlay-card-slot\s*\{[\s\S]*?width:\s*100%;/);
  assert.match(
    uiAdjustCss,
    /\.overlay-card-slot \.glass-card\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*max-content;/,
  );
  assert.match(
    uiAdjustCss,
    /\.overlay-card-slot \.overlay-parallel-bars \.overlay-progress-track\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?max-width:\s*none;/,
  );
  assert.match(tooltipApp, /payload\.maxWidth \?\? TEXT_TOOLTIP_WIDTH \* uiScale \* scale/);
});

test("overlay pagination arrows sit in a right rail so they never cover or move the cards", () => {
  const css = read("src/styles/desktop/ui-adjustment.css");
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  assert.match(css, /\.overlay-cards\[data-paged="true"\] \{\s*padding-right: 32px;/);
  assert.match(css, /\.overlay-nav-arrow \{\s*position: absolute;\s*right: 0;/);
  assert.match(css, /\.overlay-nav-arrow--up \{\s*top: 0;/);
  assert.match(css, /\.overlay-nav-arrow--down \{\s*bottom: 0;/);
  assert.match(stack, /\{hasPrev && \(\s*<OverlayNavArrow\s+direction="up"/);
  assert.match(stack, /\{hasNext && \(\s*<OverlayNavArrow\s+direction="down"/);
  assert.doesNotMatch(stack, /disabled=\{!has(Prev|Next)\}/);
  assert.match(stack, /data-paged=\{hasMultiple \? "true" : undefined\}/);
});
