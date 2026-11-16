import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  computeAnchoredPanelPosition,
  computeTaskbarPanelAnchor,
  isVerticalTaskbarEdge,
  normalizeTaskbarEdge,
  placementForTaskbarEdge,
} from "../../.test-build/common/ui/taskbar-panel-placement.js";
import { loadDisplayMode } from "../../.test-build/common/settings/display-mode.js";

test("Monitored Display Visibility defaults to taskbar on first launch", () => {
  const emptyStorage = { getItem: () => null };
  assert.equal(loadDisplayMode(emptyStorage), "taskbar");
});

test("Taskbar edge helpers map all 4 edges to panel placements and orientation", () => {
  assert.equal(normalizeTaskbarEdge("top"), "top");
  assert.equal(normalizeTaskbarEdge("left"), "left");
  assert.equal(normalizeTaskbarEdge("right"), "right");
  assert.equal(normalizeTaskbarEdge("unknown"), "bottom");

  assert.equal(isVerticalTaskbarEdge("bottom"), false);
  assert.equal(isVerticalTaskbarEdge("top"), false);
  assert.equal(isVerticalTaskbarEdge("left"), true);
  assert.equal(isVerticalTaskbarEdge("right"), true);

  assert.equal(placementForTaskbarEdge("bottom"), "above");
  assert.equal(placementForTaskbarEdge("top"), "below");
  assert.equal(placementForTaskbarEdge("left"), "right");
  assert.equal(placementForTaskbarEdge("right"), "left");
});

test("computeTaskbarPanelAnchor and computeAnchoredPanelPosition place panel cleanly on all 4 edges", () => {
  const monitor = { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } };
  const stripRect = { width: 120, height: 36 };
  const itemRect = { left: 10, top: 4, width: 40, height: 28 };

  // Bottom taskbar -> panel above strip
  const bottomAnchor = computeTaskbarPanelAnchor(
    "bottom",
    { x: 1600, y: 1040 },
    stripRect,
    itemRect,
    1,
  );
  assert.equal(bottomAnchor.placement, "above");
  assert.deepEqual(bottomAnchor, { placement: "above", anchorX: 1630, anchorY: 1040 });
  assert.deepEqual(
    computeAnchoredPanelPosition({
      ...bottomAnchor,
      panelWidth: 200,
      panelHeight: 100,
      gapPx: 6,
      monitor,
      scale: 1,
    }),
    { x: 1530, y: 934 },
  );

  // Top taskbar -> panel below strip
  const topAnchor = computeTaskbarPanelAnchor("top", { x: 1600, y: 4 }, stripRect, itemRect, 1);
  assert.deepEqual(topAnchor, { placement: "below", anchorX: 1630, anchorY: 40 });
  assert.deepEqual(
    computeAnchoredPanelPosition({
      ...topAnchor,
      panelWidth: 200,
      panelHeight: 100,
      gapPx: 6,
      monitor,
      scale: 1,
    }),
    { x: 1530, y: 46 },
  );

  // Left taskbar -> panel right of strip
  const leftAnchor = computeTaskbarPanelAnchor(
    "left",
    { x: 2, y: 800 },
    { width: 44, height: 120 },
    itemRect,
    1,
  );
  assert.deepEqual(leftAnchor, { placement: "right", anchorX: 46, anchorY: 818 });
  assert.deepEqual(
    computeAnchoredPanelPosition({
      ...leftAnchor,
      panelWidth: 200,
      panelHeight: 100,
      gapPx: 6,
      monitor,
      scale: 1,
    }),
    { x: 52, y: 768 },
  );

  // Right taskbar -> panel left of strip
  const rightAnchor = computeTaskbarPanelAnchor(
    "right",
    { x: 1874, y: 800 },
    { width: 44, height: 120 },
    itemRect,
    1,
  );
  assert.deepEqual(rightAnchor, { placement: "left", anchorX: 1874, anchorY: 818 });
  assert.deepEqual(
    computeAnchoredPanelPosition({
      ...rightAnchor,
      panelWidth: 200,
      panelHeight: 100,
      gapPx: 6,
      monitor,
      scale: 1,
    }),
    { x: 1668, y: 768 },
  );
});

test("TaskbarApp, taskbar.css, and Rust taskbar_dock wire 4-edge layout and panel placement", () => {
  const app = fs.readFileSync("src/components/taskbar/TaskbarApp.tsx", "utf8");
  const sync = fs.readFileSync("src/components/taskbar/useTaskbarWindowSync.ts", "utf8");
  const css = fs.readFileSync("src/styles/desktop/taskbar.css", "utf8");
  const rust = fs.readFileSync("src-tauri/src/window/taskbar_dock.rs", "utf8");
  const lib = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.match(sync, /get_taskbar_edge/);
  assert.match(sync, /taskbar-edge-changed/);
  assert.match(app, /data-taskbar-edge=\{edge\}/);
  assert.match(app, /computeTaskbarPanelAnchor/);
  assert.match(app, /outerSize/);
  assert.match(app, /vertical=\{vertical\}/);
  assert.match(css, /\.taskbar-root\[data-taskbar-edge="left"\]/);
  assert.match(css, /\.taskbar-root\[data-taskbar-edge="right"\]/);
  assert.match(css, /rgba\(12,\s*15,\s*20,\s*0\.84\)/);
  assert.match(css, /\.taskbar-root\[data-taskbar-edge="left"\]\s+\.taskbar-argon-col/);
  assert.match(rust, /pub fn get_taskbar_edge/);
  assert.match(rust, /taskbar-edge-changed/);
  assert.match(lib, /taskbar_dock::get_taskbar_edge/);
});

test("computeTaskbarPanelAnchor uses outerSize so top and left gaps match bottom/right", () => {
  // Centered 36px strip inside a 48px-tall Shell_TrayWnd host (top padding 6, bottom padding 6).
  const stripRectTop = { left: 0, top: 6, right: 200, bottom: 42, width: 200, height: 36 };
  const itemRectTop = { left: 100, top: 6, right: 196, bottom: 42, width: 96, height: 36 };
  const topWithOuter = computeTaskbarPanelAnchor(
    "top",
    { x: 1600, y: 0 },
    stripRectTop,
    itemRectTop,
    1.5,
    { width: 300, height: 72 },
  );
  // Bottom edge must anchor at outer bottom (0 + 72 = 72) rather than y + 36 * 1.5 (54).
  assert.deepEqual(topWithOuter, {
    placement: "below",
    anchorX: 1600 + 148 * 1.5,
    anchorY: 72,
  });

  // Fallback without outerSize still uses stripRect.bottom (not bare stripRect.height).
  const topWithBottomFallback = computeTaskbarPanelAnchor(
    "top",
    { x: 1600, y: 0 },
    stripRectTop,
    itemRectTop,
    1,
  );
  assert.equal(topWithBottomFallback.anchorY, 42);

  // Left vertical taskbar with outerSize anchors at stripPos.x + stripOuterSize.width.
  const stripRectLeft = { left: 0, top: 8, right: 56, bottom: 208, width: 56, height: 200 };
  const itemRectLeft = { left: 0, top: 108, right: 56, bottom: 204, width: 56, height: 96 };
  const leftWithOuter = computeTaskbarPanelAnchor(
    "left",
    { x: 0, y: 500 },
    stripRectLeft,
    itemRectLeft,
    1.25,
    { width: 75, height: 270 },
  );
  assert.deepEqual(leftWithOuter, {
    placement: "right",
    anchorX: 75,
    anchorY: 500 + 156 * 1.25,
  });
});
