import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  MAIN_WINDOW_ZOOM_STORAGE_KEY,
  normalizeMainWindowZoomPercent,
  nextMainWindowZoomPercent,
  loadMainWindowZoomPercent,
  saveMainWindowZoomPercent,
} from "../../.test-build/common/main-window-zoom.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("main window zoom clamps, steps, resets, and persists", () => {
  assert.equal(MAIN_WINDOW_ZOOM_STORAGE_KEY, "quotashift_main_webview_zoom_v1");
  assert.equal(normalizeMainWindowZoomPercent(undefined), 100);
  assert.equal(normalizeMainWindowZoomPercent(20), 70);
  assert.equal(normalizeMainWindowZoomPercent(250), 190);
  assert.equal(nextMainWindowZoomPercent(180, 1), 190);
  assert.equal(nextMainWindowZoomPercent(190, 1), 190);
  assert.equal(nextMainWindowZoomPercent(100, -1), 90);
  assert.equal(nextMainWindowZoomPercent(70, -1), 70);
  assert.equal(nextMainWindowZoomPercent(70, 0), 100);

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(loadMainWindowZoomPercent(storage), 100);
  saveMainWindowZoomPercent(195, storage);
  assert.equal(loadMainWindowZoomPercent(storage), 190);
});

test("main-only zoom hook uses native webview zoom and Ctrl keyboard/wheel input", () => {
  const hook = read("src/hooks/desktop/useMainWindowZoom.ts");
  const header = read("src/components/common/Header.tsx");
  const main = read("src/main.tsx");
  const capabilities = read("src-tauri/capabilities/default.json");

  assert.match(hook, /getCurrentWebview/);
  assert.match(hook, /\.setZoom\(/);
  assert.match(hook, /addEventListener\("keydown"/);
  assert.match(hook, /addEventListener\("wheel"/);
  assert.match(hook, /requestAnimationFrame/);
  assert.match(hook, /ctrlKey/);
  assert.match(header, /useMainWindowZoom\(\)/);
  assert.doesNotMatch(main.slice(0, main.indexOf("let store")), /useMainWindowZoom/);
  assert.match(capabilities, /core:webview:allow-set-webview-zoom/);
});
