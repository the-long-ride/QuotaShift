import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
const manager = readFileSync("src-tauri/src/window/window_manager.rs", "utf8");

const main = config.app.windows.find((w) => w.label === "main");

test("main window is a normal desktop window", () => {
  assert.equal(main.visible, true);
  assert.equal(main.resizable, true);
  assert.equal(main.skipTaskbar, false);
  assert.equal(main.alwaysOnTop, false);
  assert.equal(main.width, 960);
  assert.equal(main.height, 700);
  assert.equal(main.minWidth, 912);
  assert.equal(main.minHeight, 520);
});

test("main lifecycle no longer uses tray-edge panel positioning or blur-hide", () => {
  assert.doesNotMatch(manager, /position_window/);
  assert.doesNotMatch(lib, /Focused\(false\).*hiding window/s);
  assert.match(lib, /Open QuotaShift window/);
  assert.match(manager, /pub fn open_main_window/);
  assert.match(manager, /unminimize/);
  assert.match(manager, /set_focus/);
});

test("close hides to tray and explicit quit has a shared native path", () => {
  assert.match(lib, /CloseRequested/);
  assert.match(lib, /hide_main_window/);
  assert.match(manager, /pub fn quit_application/);
  assert.match(lib, /quit_application\(app, "tray_menu_quit"\)/);
});
