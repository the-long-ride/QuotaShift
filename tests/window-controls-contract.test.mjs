import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const controlsPath = "src/components/common/WindowControls.tsx";
const resizePath = "src/components/common/WindowResizeHandles.tsx";
const quitPath = "src/components/common/QuitButton.tsx";
const controls = existsSync(controlsPath) ? readFileSync(controlsPath, "utf8") : "";
const resizeHandles = existsSync(resizePath) ? readFileSync(resizePath, "utf8") : "";
const quitButton = existsSync(quitPath) ? readFileSync(quitPath, "utf8") : "";
const header = readFileSync("src/components/common/Header.tsx", "utf8");
const windowActionsPath = "src/components/common/useHeaderWindowActions.ts";
const windowActions = existsSync(windowActionsPath) ? readFileSync(windowActionsPath, "utf8") : "";
const headerWithActions = header + "\n" + windowActions;
const settings = readFileSync("src/components/common/SettingsModal.tsx", "utf8");
const css = readFileSync("src/styles/window-controls.css", "utf8");
const capabilities = readFileSync("src-tauri/capabilities/default.json", "utf8");
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));

test("custom titlebar exposes dedicated quit and standard window controls", () => {
  assert.match(quitButton, /quit_app/);
  assert.match(quitButton, /CustomDialog/);
  assert.match(quitButton, /Quit QuotaShift/);
  assert.doesNotMatch(controls, /quit_app|Quit QuotaShift/);
  assert.match(controls, /minimize\(/);
  assert.match(controls, /toggleMaximize\(/);
  assert.match(controls, /hide\(/);
});

test("header composes Quit before status and one divider before Windows controls", () => {
  assert.match(header, /<WindowControls/);
  assert.match(header, /<QuitButton/);
  assert.ok(header.indexOf("<QuitButton") < header.indexOf("status-indicator"));
  assert.equal((header.match(/window-controls-divider/g) || []).length, 1);
  assert.doesNotMatch(controls, /window-controls-divider/);
  assert.match(css, /window-controls-divider/);
  assert.match(css, /window-control-btn/);
  assert.match(headerWithActions, /startDragging/);
});

test("main window starts wider than its 912px minimum", () => {
  const main = tauriConfig.app.windows.find((window) => window.label === "main");
  assert.equal(main.minWidth, 912);
  assert.equal(main.width, 960);
});

test("borderless main window exposes native resize handles in all eight directions", () => {
  for (const dir of [
    "East",
    "North",
    "NorthEast",
    "NorthWest",
    "South",
    "SouthEast",
    "SouthWest",
    "West",
  ]) {
    assert.match(resizeHandles, new RegExp(dir));
  }
  assert.match(resizeHandles, /startResizeDragging/);
  assert.match(capabilities, /core:window:allow-start-resize-dragging/);
});

test("all non-interactive header space including status can drag the window", () => {
  assert.match(headerWithActions, /button,input,select,textarea,a,\[data-no-window-drag\]/);
  assert.doesNotMatch(header, /target !== event\.currentTarget/);
  assert.doesNotMatch(header, /className="header-right" data-no-window-drag/);
  assert.doesNotMatch(header, /id="status-indicator" data-no-window-drag/);
  assert.doesNotMatch(header, /className="header-search" data-no-window-drag/);
  assert.match(settings, /settings-modal-overlay"[\s\S]*?data-no-window-drag/);
  assert.match(resizeHandles, /event\.stopPropagation\(\)/);
  assert.match(resizeHandles, /data-no-window-drag/);
});

test("double clicking header titlebar toggles window maximize and restore", () => {
  assert.match(header, /onDoubleClick=\{handleHeaderDoubleClick\}/);
  assert.match(header, /useHeaderWindowActions/);
  assert.match(headerWithActions, /win\.toggleMaximize\(\)/);
  assert.match(headerWithActions, /event\.detail === 2/);
  assert.match(headerWithActions, /handleToggleMaximize/);
});
