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

test("card overlay hovers show rich detail panel and support horizontal/vertical orientation", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  const css = read("src/styles/desktop/ui-adjustment.css");
  assert.match(app, /orientation=\{circleOrientation\}/);
  assert.match(app, /data-stack-orientation=\{circleOrientation\}/);
  assert.match(app, /onHoverCard=\{handleHoverNode\}/);
  assert.match(app, /onLeaveCard=\{handleLeaveNode\}/);
  assert.match(stack, /onMouseEnter=\{\(event\) => onHoverCard\?\.\(card, event\.currentTarget\)\}/);
  assert.match(stack, /data-orientation=\{orientation\}/);
  assert.match(css, /\.overlay-cards--horizontal\s*\{[\s\S]*?flex-direction:\s*row;/);
  assert.match(
    css,
    /\.overlay-cards--horizontal \.overlay-nav-arrow\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;/,
  );
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
  assert.match(stack, /const prevDir = orientation === "horizontal" \? "left" : "up";/);
  assert.match(stack, /const nextDir = orientation === "horizontal" \? "right" : "down";/);
  assert.match(stack, /<OverlayNavArrow[\s\S]*direction=\{prevDir\}/);
  assert.match(stack, /<OverlayNavArrow[\s\S]*direction=\{nextDir\}/);
  assert.match(stack, /onWheel=\{handleWheel\}/);
  assert.match(css, /\.overlay-cards\s*\{[\s\S]*scrollbar-width:\s*none;/);
  assert.match(css, /\.overlay-cards::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
  assert.match(css, /\.overlay-nav-arrow/);
});

test("overlay cards align left and stretch across cross-axis to match widest card", () => {
  const overlayCss = read("src/styles/desktop/overlay.css");
  const uiAdjustCss = read("src/styles/desktop/ui-adjustment.css");
  const tooltipApp = read("src/components/overlay/tooltip/overlay-tooltip-placement.ts");

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

test("overlay pagination arrows sit centered top/bottom (or left/right in horizontal) without right-rail padding", () => {
  const css = read("src/styles/desktop/ui-adjustment.css");
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  assert.doesNotMatch(css, /padding-right:\s*32px/);
  assert.match(css, /\.overlay-nav-arrow\s*\{\s*position:\s*static;\s*align-self:\s*center;/);
  assert.doesNotMatch(css, /\.overlay-nav-arrow--up\s*\{\s*top:\s*0;/);
  assert.doesNotMatch(css, /\.overlay-nav-arrow--down\s*\{\s*bottom:\s*0;/);
  assert.match(stack, /\{hasPrev && \(\s*<OverlayNavArrow\s+direction=\{prevDir\}/);
  assert.match(stack, /\{hasNext && \(\s*<OverlayNavArrow\s+direction=\{nextDir\}/);
  assert.doesNotMatch(stack, /disabled=\{!has(Prev|Next)\}/);
  assert.match(stack, /data-paged=\{hasMultiple \? "true" : undefined\}/);
});

test("overlay hover, drag, and context menu state reset cleanly without stale closures", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const drag = read("src/components/overlay/useOverlayDrag.ts");
  const actions = read("src/components/overlay/useCircleOverlayActions.ts");
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  const circleNode = read("src/components/overlay/OverlayCircleNode.tsx");

  assert.doesNotMatch(app, /menuOpenState/);
  assert.match(app, /onCloseMenu:\s*\(\) => setMenuState\(\(prev\) => \(\{ \.\.\.prev, isOpen: false \}\)\)/);
  assert.match(app, /cardMenuOpenRef\.current = menuState\.isOpen;/);
  assert.match(app, /isHoverSuppressedRef\.current = \(\) => isDraggingNow\(\) \|\| cardMenuOpenRef\.current;/);

  assert.match(drag, /const isDraggingNow = \(\) => dragStartedRef\.current \|\| pointerDownRef\.current;/);
  assert.match(drag, /isDraggingNow,/);

  assert.match(actions, /isHoverSuppressedRef\.current\(\)/);
  assert.match(actions, /if \(activeHoverKeyRef\.current === cardKey\) return;/);
  assert.match(actions, /activeHoverKeyRef\.current = null;/);

  assert.match(stack, /onMouseMove=\{\(event\) => onHoverCard\?\.\(card, event\.currentTarget\)\}/);
  assert.match(circleNode, /onMouseMove=\{\(event\) => onHover\(data, event\.currentTarget\)\}/);
});

test("card overlay menu includes orientation swap without clipping and pagination arrows are square", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const overlayCss = read("src/styles/desktop/overlay.css");
  const uiAdjustCss = read("src/styles/desktop/ui-adjustment.css");

  assert.match(
    app,
    /<OverlayContextMenu[\s\S]*?circleOrientation=\{circleOrientation\}[\s\S]*?onSwapOrientation=/,
  );
  assert.match(overlayCss, /\.overlay-context-menu\s*\{[\s\S]*?max-width:\s*none;/);
  assert.match(
    uiAdjustCss,
    /\.overlay-nav-arrow\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;[\s\S]*?border-radius:\s*6px;/,
  );
  assert.match(
    uiAdjustCss,
    /\.overlay-cards--horizontal \.overlay-nav-arrow\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;/,
  );
});
