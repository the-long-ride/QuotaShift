import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const bridge = read("src/components/overlay/OverlayWindowSizingBridge.tsx");
const uiAdjustmentSource = read("src/utils/common/ui-adjustment.ts");
const css = read("src/styles/desktop/ui-adjustment.css");
const overlayCss = read("src/styles/desktop/overlay.css");

test("overlay keeps one fixed base viewport multiplied by UI scale as its sizing fallback", () => {
  assert.match(uiAdjustmentSource, /OVERLAY_BASE_WIDTH\s*=\s*340/);
  assert.match(uiAdjustmentSource, /OVERLAY_BASE_HEIGHT\s*=\s*80/);
  assert.match(bridge, /getOverlayWindowWidth/);
  assert.match(bridge, /getOverlayWindowHeight/);
  assert.match(bridge, /requestAnimationFrame/);
  assert.match(bridge, /lastApplied/);
  assert.doesNotMatch(bridge, /overlayWidth|overlayHeight|overlay-ui-scale-inverse/);
  assert.match(bridge, /setSize\(new LogicalSize/);
  assert.match(css, /--overlay-ui-scale/);
  assert.doesNotMatch(css, /--overlay-card-width|--overlay-card-height|--overlay-ui-scale-inverse|@media/);
  assert.doesNotMatch(overlayCss, /max-width:\s*238px/);
});

test("overlay records a native size only after setSize succeeds so failed resizes can retry", () => {
  const setSizeIndex = bridge.indexOf("await win.setSize(new LogicalSize(next.width, next.height))");
  const lastAppliedIndex = bridge.indexOf("lastApplied = next");
  assert.ok(setSizeIndex >= 0, "native setSize call must exist");
  assert.ok(lastAppliedIndex > setSizeIndex, "lastApplied must be committed after successful setSize");
});

test("main window manager no longer positions the dashboard against the tray", () => {
  const source = read("src-tauri/src/window/window_manager.rs");
  assert.doesNotMatch(source, /position_window/);
  assert.match(source, /open_main_window/);
});
