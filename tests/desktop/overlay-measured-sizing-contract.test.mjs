import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const bridge = read("src/components/overlay/OverlayWindowSizingBridge.tsx");
const css = read("src/styles/desktop/ui-adjustment.css");

test("overlay window follows the measured card with the fixed base size as fallback", () => {
  assert.match(bridge, /resolveMeasuredOverlaySize/);
  assert.match(bridge, /ResizeObserver/);
  assert.match(bridge, /getOverlayWindowWidth/);
  assert.match(bridge, /getOverlayWindowHeight/);
  assert.match(bridge, /lastApplied/);
  assert.match(bridge, /setSize\(new LogicalSize/);
  assert.match(bridge, /resolveViewportAdjustedOverlaySize/);
  assert.match(bridge, /window\.addEventListener\("resize", scheduleResize\)/);
});

test("glass card sizes to its content in both axes", () => {
  const block = css.match(/\.glass-card\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(block, /width:\s*max-content;/);
  assert.match(block, /height:\s*max-content;/);
  assert.doesNotMatch(block, /height:\s*100%;/);
});

test("zoomed overlay container sizes to its card instead of the window viewport", () => {
  const block = css.match(/\.overlay-container\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(block, /width:\s*max-content;/);
  assert.match(block, /height:\s*max-content;/);
  assert.doesNotMatch(block, /(?:width|height):\s*100%;/);
});

test("overlay metrics retain their intrinsic width for content-based window sizing", () => {
  const block = css.match(/\.overlay-metrics\s*\{[^}]*\}/)?.[0] ?? "";

  assert.match(block, /flex:\s*0\s+0\s+auto;/);
  assert.match(block, /min-width:\s*max-content;/);
  assert.match(block, /min-height:\s*max-content;/);
});

test("overlay measures the card in unzoomed CSS px, never with mixed client rects", () => {
  assert.match(bridge, /getComputedStyle\(card\)/);
  assert.doesNotMatch(bridge, /getBoundingClientRect/);
  assert.match(bridge, /scale: preferences\.overlayScale \/ 100/);
});
