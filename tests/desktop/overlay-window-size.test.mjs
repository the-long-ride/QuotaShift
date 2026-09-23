import test from "node:test";
import assert from "node:assert/strict";
import { calculateOverlayNativeSize } from "../../.test-build/common/overlay-window-size.js";

test("overlay native size uniformly scales one fixed base viewport", () => {
  assert.deepEqual(calculateOverlayNativeSize({
    baseWidth: 400,
    baseHeight: 80,
    scale: 1,
  }), { width: 400, height: 80 });

  assert.deepEqual(calculateOverlayNativeSize({
    baseWidth: 400,
    baseHeight: 80,
    scale: 1.2,
  }), { width: 480, height: 96 });
});

test("overlay native sizing falls back to 100 percent for an invalid scale", () => {
  assert.deepEqual(calculateOverlayNativeSize({
    baseWidth: 400,
    baseHeight: 80,
    scale: 0,
  }), { width: 400, height: 80 });
});
