import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => {
  const content = fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf-8");
  if (path === "src/components/overlay/OverlayApp.tsx") {
    const menuPath = new URL("../../src/components/overlay/OverlayContextMenu.tsx", import.meta.url);
    return content + (fs.existsSync(menuPath) ? fs.readFileSync(menuPath, "utf-8") : "");
  }
  return content;
};

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
  assert.match(hookTs, /isRegistered/, "Hook must reclaim shortcuts left by a WebView reload");
  assert.match(hookTs, /quotashift_shortcuts_changed/, "Hook must listen for shortcut changes");
});

test("OverlayApp.tsx keeps the context menu icon-only with action tooltips", () => {
  const overlayTsx = read("src/components/overlay/OverlayApp.tsx");
  for (const label of ["Refresh usage", "Open dashboard", "Hide overlay"]) {
    assert.match(overlayTsx, new RegExp(`data-tooltip="${label}"`));
    assert.match(overlayTsx, new RegExp(`aria-label="${label}"`));
  }
  assert.doesNotMatch(overlayTsx, /<span>Refresh usage<\/span>/);
  assert.doesNotMatch(overlayTsx, /<span>Open dashboard<\/span>/);
  assert.doesNotMatch(overlayTsx, /<span>Hide overlay<\/span>/);
  assert.match(overlayTsx, /Switch to light mode/);
  assert.match(overlayTsx, /Switch to dark mode/);
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
  assert.match(shortcutComp, /Global shortcuts/, "ShortcutSettings must separate global bindings");
  assert.match(shortcutComp, /In app shortcuts/, "ShortcutSettings must separate in-app bindings");
  for (const label of [
    "Add account",
    "Toggle theme",
    "Toggle card view",
    "Focus search",
    "Reload full usage",
    "Open settings",
    "Quit app",
  ]) {
    assert.match(shortcutComp, new RegExp(label));
  }
  assert.match(shortcutComp, /saveShortcutPreferences/, "ShortcutSettings must persist rebindings");
  assert.match(
    shortcutComp,
    /role="switch"/,
    "ShortcutSettings must include switch buttons for enable status",
  );
  assert.match(shortcutComp, /aria-label={`\${label} shortcut enabled`}/);
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
