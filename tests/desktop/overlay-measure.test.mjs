import test from "node:test";
import assert from "node:assert/strict";
import {
  OVERLAY_MEASURE_SLACK,
  resolveMeasuredOverlaySize,
  resolveViewportAdjustedOverlaySize,
} from "../../.test-build/common/overlay-measure.js";

const fallback = { width: 220, height: 68 };

test("window fits the card's unzoomed CSS size at 100% scale", () => {
  const size = resolveMeasuredOverlaySize({ card: { width: 158.4, height: 44.2 }, fallback });
  assert.deepEqual(size, {
    width: 159 + OVERLAY_MEASURE_SLACK,
    height: 45 + OVERLAY_MEASURE_SLACK,
  });
});

test("UI scale multiplies the unzoomed card size and the slack", () => {
  // Regression: at 140% the old rect-ratio math mixed zoomed and unzoomed rect spaces and
  // produced a window smaller than the rendered card, clipping it on every side.
  const size = resolveMeasuredOverlaySize({
    card: { width: 271, height: 45 },
    scale: 1.4,
    fallback: { width: 476, height: 112 },
  });
  const slack = Math.ceil(OVERLAY_MEASURE_SLACK * 1.4);
  assert.deepEqual(size, { width: 380 + slack, height: 63 + slack });
  assert.ok(size.width >= 271 * 1.4 && size.height >= 45 * 1.4);
});

test("invalid measurements or scale fall back safely", () => {
  assert.deepEqual(
    resolveMeasuredOverlaySize({ card: { width: 0, height: 40 }, fallback }),
    fallback,
  );
  assert.deepEqual(
    resolveMeasuredOverlaySize({ card: { width: NaN, height: 40 }, fallback }),
    fallback,
  );
  assert.deepEqual(
    resolveMeasuredOverlaySize({ card: { width: 150, height: 40 }, scale: 0, fallback }),
    { width: 150 + OVERLAY_MEASURE_SLACK, height: 40 + OVERLAY_MEASURE_SLACK },
  );
});

test("measured size is clamped to twice the fallback so a layout bug cannot grow the window", () => {
  const size = resolveMeasuredOverlaySize({ card: { width: 2000, height: 900 }, fallback });
  assert.deepEqual(size, { width: 440, height: 136 });
});

test("native window grows when its WebView viewport is smaller than the requested size", () => {
  assert.deepEqual(
    resolveViewportAdjustedOverlaySize({
      measured: { width: 165, height: 50 },
      applied: { width: 165, height: 50 },
      viewport: { width: 158, height: 45 },
    }),
    { width: 173, height: 56 },
  );
});

test("viewport correction stays stable after resizing and permits content to shrink", () => {
  assert.deepEqual(
    resolveViewportAdjustedOverlaySize({
      measured: { width: 165, height: 50 },
      applied: { width: 173, height: 56 },
      viewport: { width: 166, height: 51 },
    }),
    { width: 172, height: 55 },
  );
  assert.deepEqual(
    resolveViewportAdjustedOverlaySize({
      measured: { width: 140, height: 44 },
      applied: { width: 173, height: 56 },
      viewport: { width: 166, height: 51 },
    }),
    { width: 146, height: 49 },
  );
});

test("a stale or unusable viewport cannot shrink or explode the requested window", () => {
  const measured = { width: 165, height: 50 };
  const applied = { width: 165, height: 50 };
  assert.deepEqual(
    resolveViewportAdjustedOverlaySize({
      measured,
      applied,
      viewport: { width: 340, height: 80 },
    }),
    measured,
  );
  assert.deepEqual(
    resolveViewportAdjustedOverlaySize({
      measured,
      applied,
      viewport: { width: 0, height: 0 },
    }),
    measured,
  );
});
