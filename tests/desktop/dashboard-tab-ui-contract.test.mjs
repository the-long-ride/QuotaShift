import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("overlay double-click and menu open the dashboard on the clicked card's tab", () => {
  const stack = read("src/components/overlay/OverlayCardStack.tsx");
  assert.match(stack, /export function dashboardTabForTarget\(target: EventTarget \| null\)/);
  assert.match(stack, /\[OVERLAY_CARD_PROVIDER_ATTR\]: card\.provider/);
  const menu = read("src/components/overlay/useOverlayContextMenu.ts");
  assert.match(menu, /menuTabRef\.current = dashboardTabForTarget\(e\.target\);/);
  assert.match(
    menu,
    /const tab = menuTabRef\.current \?\? data\.provider;\s*await invoke\("show_dashboard", \{ tab \}\);/,
  );
});

test("show_dashboard forwards a validated tab through window-shown", () => {
  const commands = read("src-tauri/src/app/commands.rs");
  assert.match(
    commands,
    /pub fn show_dashboard\(app_handle: tauri::AppHandle, tab: Option<String>\)/,
  );
  assert.match(
    commands,
    /open_main_window_on_tab\(&app_handle, "overlay_click", tab\.as_deref\(\)\)/,
  );
  const wm = read("src-tauri/src/window/window_manager.rs");
  assert.match(wm, /match tab\.and_then\(dashboard_tab\)/);
  assert.match(wm, /Some\(tab\) => window\.emit\("window-shown", tab\)/);
  assert.match(wm, /None => window\.emit\("window-shown", true\)/);
});

test("avatar placeholders center their initial", () => {
  const overlay = read("src/styles/desktop/overlay.css");
  assert.match(
    overlay,
    /\.overlay-avatar-fallback \{\s*display: flex;\s*align-items: center;\s*justify-content: center;\s*width: 100%;\s*height: 100%;/,
  );
  const codex = read("src/styles/codex/codex-cards.css");
  assert.match(
    codex,
    /div\.codex-card-avatar \{\s*display: flex;\s*align-items: center;\s*justify-content: center;/,
  );
});

test("single-bar overlay cards use the same track width as two-bar cards", () => {
  const overlay = read("src/styles/desktop/overlay.css");
  assert.doesNotMatch(overlay, /:only-child \.overlay-progress-track/);
  assert.match(overlay, /\.overlay-parallel-bars \.overlay-progress-track \{\s*width: 44px;/);
});

test("multi-track and restart-on-switch are marked experimental", () => {
  const multi = read("src/components/common/MultiTrackSettings.tsx");
  assert.match(multi, /Track multiple accounts <ExperimentalTag \/>/);
  assert.match(multi, /loadMultiTrackEnabled\(\)/);
  assert.doesNotMatch(multi, /PROVIDER_LABELS/);
  const restart = read("src/components/common/RestartOnSwitchSetting.tsx");
  assert.match(restart, /Restart running app on switch <ExperimentalTag \/>/);
  assert.match(
    read("src/styles/settings/settings-experimental.css"),
    /\.settings-experimental-tag \{/,
  );
});
