import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("Windows taskbar watcher checks actual HWND geometry on every tick", () => {
  const dock = read("src-tauri/src/window/taskbar_dock.rs");
  const native = read("src-tauri/src/window/taskbar_dock/windows_impl.rs");
  assert.doesNotMatch(dock, /LAST_STRIP_RECT/);
  assert.match(dock, /windows_impl::position_strip\(strip_hwnd, rect\)/);
  assert.match(native, /should_reposition_strip\(window_rect\(hwnd\), desired\)/);
  assert.match(native, /SetWindowPos\(/);
  assert.match(native, /SWP_NOZORDER\s*\|\s*SWP_NOACTIVATE/);
});

test("dock owner is resolved before moving; strip only shows after successful placement", () => {
  const dock = read("src-tauri/src/window/taskbar_dock.rs");
  const place = dock.slice(dock.indexOf('fn place_strip(app_handle: &tauri::AppHandle) {'));
  const owner = place.indexOf("windows_impl::dock_to_taskbar");
  const position = place.indexOf("windows_impl::position_strip");
  const show = place.indexOf("strip.show()");
  const topmost = place.indexOf("windows_impl::assert_topmost");
  assert.ok(owner >= 0 && owner < position, "own the strip before setting its bounds");
  assert.ok(position < show && show < topmost, "avoid displaying an undocked window");
  assert.match(place, /if !windows_impl::position_strip[\s\S]*?strip.hide\(\)/);
});

test("reposition correction preserves taskbar Z-order to avoid interfering with tray menus", () => {
  const ffi = read("src-tauri/src/window/taskbar_dock/win32_ffi.rs");
  const native = read("src-tauri/src/window/taskbar_dock/windows_impl.rs");
  assert.match(ffi, /pub const SWP_NOZORDER: u32 = 0x0004/);
  assert.match(native, /SWP_NOZORDER\s*\|\s*SWP_NOACTIVATE/);
  assert.match(native, /pub fn assert_topmost/);
});
