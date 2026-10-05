import test from "node:test";
import assert from "node:assert/strict";
import {
  DISPLAY_MODE_KEY,
  DISPLAY_MODE_LAST_KEY,
  currentPlatform,
  effectiveDisplayMode,
  isDisplayMode,
  isTaskbarSupported,
  loadDisplayMode,
  nextQuickToggleMode,
  saveDisplayMode,
} from "../../.test-build/common/display-mode.js";

const LEGACY = "quotashift_overlay_enabled";
const memory = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};
const broken = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

test("defaults to overlay and migrates the legacy disabled flag to none", () => {
  assert.equal(loadDisplayMode(memory()), "overlay");
  assert.equal(loadDisplayMode(memory({ [LEGACY]: "true" })), "overlay");
  assert.equal(loadDisplayMode(memory({ [LEGACY]: "false" })), "none");
  assert.equal(
    loadDisplayMode(memory({ [DISPLAY_MODE_KEY]: "taskbar", [LEGACY]: "false" })),
    "taskbar",
  );
  assert.equal(loadDisplayMode(memory({ [DISPLAY_MODE_KEY]: "bogus" })), "overlay");
  assert.equal(loadDisplayMode(broken), "overlay");
  assert.equal(loadDisplayMode(null), "overlay");
});

test("save keeps the legacy flag and remembers the last visible mode", () => {
  const s = memory();
  saveDisplayMode("taskbar", s);
  assert.equal(s.map.get(DISPLAY_MODE_KEY), "taskbar");
  assert.equal(s.map.get(DISPLAY_MODE_LAST_KEY), "taskbar");
  assert.equal(s.map.get(LEGACY), "true");
  saveDisplayMode("none", s);
  assert.equal(s.map.get(DISPLAY_MODE_KEY), "none");
  assert.equal(s.map.get(DISPLAY_MODE_LAST_KEY), "taskbar");
  assert.equal(s.map.get(LEGACY), "false");
  assert.doesNotThrow(() => saveDisplayMode("overlay", broken));
});

test("quick toggle cycles none, overlay, taskbar (taskbar skipped off Windows)", () => {
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Darwin";
  assert.equal(nextQuickToggleMode("none", win), "overlay");
  assert.equal(nextQuickToggleMode("overlay", win), "taskbar");
  assert.equal(nextQuickToggleMode("taskbar", win), "none");
  assert.equal(nextQuickToggleMode("none", mac), "overlay");
  assert.equal(nextQuickToggleMode("overlay", mac), "none");
  assert.equal(nextQuickToggleMode("taskbar", mac), "none");
  assert.equal(nextQuickToggleMode("none"), "overlay");
});

test("taskbar mode is Windows-only; other platforms fall back to overlay", () => {
  assert.equal(isTaskbarSupported("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), true);
  assert.equal(isTaskbarSupported("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Darwin"), false);
  assert.equal(isTaskbarSupported("Mozilla/5.0 (X11; Linux x86_64)"), false);
  assert.equal(effectiveDisplayMode("taskbar", "Linux"), "overlay");
  assert.equal(effectiveDisplayMode("taskbar", "Windows NT"), "taskbar");
  assert.equal(effectiveDisplayMode("none", "Linux"), "none");
  assert.equal(isDisplayMode("overlay"), true);
  assert.equal(isDisplayMode(3), false);
  assert.equal(typeof currentPlatform(), "string");
});
