import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readWithCssImports } from "../css-helper.mjs";

const read = (path) => {
  const content = readWithCssImports(path);
  if (path === "src/components/overlay/OverlayApp.tsx") {
    const cardPath = new URL("../../src/components/overlay/OverlayCard.tsx", import.meta.url);
    return content + (fs.existsSync(cardPath) ? fs.readFileSync(cardPath, "utf8") : "");
  }
  return content;
};

test("runtime omits high-frequency window movement and routine open-hide success logs", () => {
  const lib = read("src-tauri/src/lib.rs");
  const windowManager = read("src-tauri/src/window/window_manager.rs");

  assert.doesNotMatch(lib, /WindowEvent::Moved/);
  assert.doesNotMatch(lib, /WindowEvent::Resized/);
  assert.doesNotMatch(windowManager, /open_main_window requested/);
  assert.doesNotMatch(windowManager, /hide_main_window requested/);
  assert.match(windowManager, /open_main_window: WebviewWindow 'main' not found/);
  assert.match(windowManager, /hide_main_window: WebviewWindow 'main' not found/);
});

test("Antigravity remote logs are concise and use masked account identity", () => {
  const remote = read("src-tauri/src/antigravity/remote.rs");
  const usage = read("src-tauri/src/antigravity/usage.rs");
  const frontend = read("src/utils/antigravity/app-antigravity-ops.ts");

  assert.match(remote, /fn mask_email/);
  assert.match(remote, /endpoint_name/);
  assert.doesNotMatch(remote, /SUCCESS Response JSON/);
  assert.doesNotMatch(remote, /---> POST/);
  assert.doesNotMatch(remote, /HTTP \{\} from/);
  assert.match(usage, /email:\s*Option<String>/);
  assert.match(frontend, /email:\s*acc\.email\s*\?\?\s*null/);
});

test("Windows main window requests native rounded corners", () => {
  const dwm = read("src-tauri/src/window/dwm.rs");
  const setup = read("src-tauri/src/app/setup.rs");

  assert.match(dwm, /DWMWA_WINDOW_CORNER_PREFERENCE/);
  assert.match(dwm, /DWMWCP_ROUND/);
  assert.match(dwm, /prefer_rounded_corners/);
  assert.match(setup, /prefer_rounded_corners/);
});

test("overlay CSS uses one content-sized surface and uniform visual scale", () => {
  const adjustment = read("src/styles/desktop/ui-adjustment.css");
  const css = adjustment + read("src/styles/desktop/overlay.css");
  const containerRule = adjustment.match(/\.overlay-container\s*\{[\s\S]*?\}/)?.[0] ?? "";
  const cardRule = adjustment.match(/\.glass-card\s*\{[\s\S]*?\}/)?.[0] ?? "";

  assert.match(containerRule, /width:\s*max-content/);
  assert.match(containerRule, /height:\s*max-content/);
  assert.match(containerRule, /zoom:\s*var\(--overlay-ui-scale\)/);
  assert.match(containerRule, /overflow:\s*hidden/);
  assert.match(cardRule, /width:\s*max-content/);
  assert.match(cardRule, /max-width:\s*none/);
  assert.match(cardRule, /min-width:\s*0/);
  assert.match(cardRule, /height:\s*max-content/);
  assert.match(cardRule, /flex:\s*0 0 auto/);
  assert.match(cardRule, /overflow:\s*hidden/);
  assert.doesNotMatch(
    adjustment,
    /--overlay-card-width|--overlay-card-height|--overlay-ui-scale-inverse/,
  );
  assert.match(css, /\.overlay-family-col[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.overlay-progress-track[\s\S]*?min-width:\s*0/);
});

test("Tauri overlay bootstrap uses the safe 340x80 baseline", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const overlay = conf.app.windows.find((window) => window.label === "overlay");
  const setup = read("src-tauri/src/app/setup.rs");

  assert.equal(overlay.width, 340);
  assert.equal(overlay.height, 80);
  assert.match(setup, /340\.0 \* scale/);
  assert.match(setup, /80\.0 \* scale/);
});

test("Codex usage refresh restores reset credits without making normal usage fragile", () => {
  const commands = read("src-tauri/src/app/commands/oauth.rs");
  const app = read("src/App.tsx");
  const overlay = read("src/components/overlay/OverlayApp.tsx");

  assert.match(commands, /fetch_chatgpt_usage[\s\S]*fetch_chatgpt_rate_limit_reset_credits/);
  assert.match(commands, /if let Ok\(reset_credits\)/);
  assert.match(commands, /["']reset_credits["']/);
  assert.match(app, /resetCount:\s*cache\?\.rate_limit\?\.reset_credits\?\.available_count/);
  assert.match(
    overlay,
    /typeof data\.resetCount === ["']number["']\s*&&\s*data\.resetCount\s*>\s*0/,
  );
});
