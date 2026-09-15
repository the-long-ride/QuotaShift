import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf-8");

test("App.tsx uses useGlobalShortcuts hook to manage dynamic shortcuts", () => {
  const appTsx = read("src/App.tsx");
  assert.match(
    appTsx,
    /useGlobalShortcuts\(handleToggleOverlay/,
    "Must use useGlobalShortcuts hook",
  );

  const hookTs = read("src/utils/common/use-global-shortcuts.ts");
  assert.match(
    hookTs,
    /import.*register.*@tauri-apps\/plugin-global-shortcut/,
    "Hook must import register from global-shortcut plugin",
  );
  assert.match(hookTs, /quotashift_shortcuts_changed/, "Hook must listen for shortcut changes");
});

test("OverlayApp.tsx keeps clean context menu without text clutter", () => {
  const overlayTsx = read("src/components/overlay/OverlayApp.tsx");
  assert.match(
    overlayTsx,
    /<span>Hide overlay<\/span>/,
    "Context menu must have clean Hide overlay label",
  );
  assert.match(
    overlayTsx,
    /<span>Refresh usage<\/span>/,
    "Context menu must have clean Refresh usage label",
  );
});

test("SettingsModal.tsx includes ShortcutSettings section for rebinding", () => {
  const settingsTsx = read("src/components/common/SettingsModal.tsx");
  assert.match(
    settingsTsx,
    /<ShortcutSettings\s*\/>/,
    "Settings modal must include ShortcutSettings component",
  );

  const shortcutComp = read("src/components/common/ShortcutSettings.tsx");
  assert.match(shortcutComp, /Keyboard Shortcuts/, "ShortcutSettings must display section title");
  assert.match(
    shortcutComp,
    /Toggle Overlay/,
    "ShortcutSettings must support rebinding Toggle Overlay",
  );
  assert.match(
    shortcutComp,
    /Refresh Usage/,
    "ShortcutSettings must support rebinding Refresh Usage",
  );
  assert.match(shortcutComp, /saveShortcutPreferences/, "ShortcutSettings must persist rebindings");
  assert.match(
    shortcutComp,
    /role="switch"/,
    "ShortcutSettings must include switch buttons for enable status",
  );
  assert.match(
    shortcutComp,
    /Toggle Overlay shortcut enabled/,
    "ShortcutSettings must include switch for Toggle Overlay",
  );
  assert.match(
    shortcutComp,
    /Refresh Usage shortcut enabled/,
    "ShortcutSettings must include switch for Refresh Usage",
  );
});

test("tauri capabilities include global-shortcut plugin and allow commands", () => {
  const cap = JSON.parse(read("src-tauri/capabilities/desktop.json"));
  assert.ok(
    cap.permissions.includes("global-shortcut:default"),
    "desktop capabilities must include global-shortcut:default permission",
  );
  assert.ok(
    cap.permissions.includes("global-shortcut:allow-register"),
    "desktop capabilities must include global-shortcut:allow-register",
  );
  assert.ok(
    cap.permissions.includes("global-shortcut:allow-unregister"),
    "desktop capabilities must include global-shortcut:allow-unregister",
  );
  const defaultCap = JSON.parse(read("src-tauri/capabilities/default.json"));
  assert.ok(
    defaultCap.permissions.includes("global-shortcut:default"),
    "default capabilities must include global-shortcut:default permission",
  );
  assert.ok(
    defaultCap.permissions.includes("global-shortcut:allow-register"),
    "default capabilities must include global-shortcut:allow-register",
  );
  assert.ok(
    defaultCap.permissions.includes("global-shortcut:allow-unregister"),
    "default capabilities must include global-shortcut:allow-unregister",
  );
});
