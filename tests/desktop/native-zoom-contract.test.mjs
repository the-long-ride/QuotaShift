import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zoomCompensation } from "../../.test-build/common/webview-zoom.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("no leaked zoom leaves the content untouched", () => {
  assert.equal(zoomCompensation(1, 1), 1);
  assert.equal(zoomCompensation(1.5, 1.5), 1);
  assert.equal(zoomCompensation(1.0004, 1), 1);
});

test("leaked page zoom is scaled back to the monitor scale", () => {
  assert.ok(Math.abs(zoomCompensation(1.35, 1) - 1 / 1.35) < 1e-9);
  assert.ok(Math.abs(zoomCompensation(1.5 * 0.8, 1.5) - 1.25) < 1e-9);
});

test("unusable inputs fall back to no compensation", () => {
  assert.equal(zoomCompensation(0, 1), 1);
  assert.equal(zoomCompensation(1.35, 0), 1);
  assert.equal(zoomCompensation(Number.NaN, 1), 1);
  assert.equal(zoomCompensation(1.35, Number.POSITIVE_INFINITY), 1);
});

test("taskbar strip and hover card undo leaked zoom and size from layout px", () => {
  const app = read("src/components/taskbar/TaskbarApp.tsx");
  const card = read("src/components/taskbar/TaskbarTooltipCard.tsx");
  const tooltip = read("src/components/overlay/OverlayTooltipApp.tsx");
  const css = read("src/styles/desktop/native-zoom.css");
  assert.match(app, /useNativeZoomCompensation\(\)/);
  assert.match(tooltip, /useNativeZoomCompensation\(\)/);
  assert.match(app, /strip\.offsetWidth/, "report layout px, which a transform does not change");
  assert.doesNotMatch(app, /getBoundingClientRect\(\);\s*invoke/);
  assert.match(card, /getNativeScale\(\)/);
  assert.doesNotMatch(card, /window\.devicePixelRatio/, "devicePixelRatio carries the leaked zoom");
  assert.match(css, /transform:\s*scale\(var\(--native-zoom/);
  assert.match(read("src/styles.css"), /native-zoom\.css/);
});

test("hover card fades in without the shared -50% x shift", () => {
  const css = read("src/styles/desktop/taskbar-tooltip.css");
  assert.match(css, /animation:\s*taskbar-tooltip-fade-in/);
  assert.match(css, /@keyframes taskbar-tooltip-fade-in/);
  assert.doesNotMatch(css, /overlay-tooltip-fade-in/);
});
