import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SHORTCUT_TOGGLE_OVERLAY,
  DEFAULT_SHORTCUT_REFRESH_ACCOUNT,
  SHORTCUT_TOGGLE_OVERLAY_KEY,
  SHORTCUT_REFRESH_ACCOUNT_KEY,
  SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY,
  SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY,
  loadShortcutPreferences,
  saveShortcutPreferences,
  formatShortcutDisplay,
  buildShortcutFromKeyEvent,
  matchesShortcutEvent,
} from "../.test-build/shortcuts.js";

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) ?? null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

test("loadShortcutPreferences returns defaults when storage is empty", () => {
  const storage = new MockStorage();
  const prefs = loadShortcutPreferences(storage);
  assert.equal(prefs.toggleOverlay, DEFAULT_SHORTCUT_TOGGLE_OVERLAY);
  assert.equal(prefs.refreshAccount, DEFAULT_SHORTCUT_REFRESH_ACCOUNT);
  assert.equal(prefs.toggleOverlayEnabled, true);
  assert.equal(prefs.refreshAccountEnabled, true);
  assert.equal(prefs.addAccount, "CommandOrControl+N");
  assert.equal(prefs.toggleTheme, "CommandOrControl+L");
  assert.equal(prefs.toggleCardView, "CommandOrControl+E");
  assert.equal(prefs.focusSearch, "CommandOrControl+F");
  assert.equal(prefs.refreshAll, "CommandOrControl+R");
  assert.equal(prefs.openSettings, "CommandOrControl+,");
  assert.equal(prefs.quitApp, "CommandOrControl+Shift+Q");
});

test("loadShortcutPreferences loads saved values from storage", () => {
  const storage = new MockStorage();
  storage.setItem(SHORTCUT_TOGGLE_OVERLAY_KEY, "Alt+Shift+D");
  storage.setItem(SHORTCUT_REFRESH_ACCOUNT_KEY, "CommandOrControl+F5");
  storage.setItem(SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY, "false");
  storage.setItem(SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY, "true");

  const prefs = loadShortcutPreferences(storage);
  assert.equal(prefs.toggleOverlay, "Alt+Shift+D");
  assert.equal(prefs.refreshAccount, "CommandOrControl+F5");
  assert.equal(prefs.toggleOverlayEnabled, false);
  assert.equal(prefs.refreshAccountEnabled, true);
});

test("saveShortcutPreferences persists individual fields", () => {
  const storage = new MockStorage();
  saveShortcutPreferences({ toggleOverlay: "Alt+Shift+O" }, storage);
  assert.equal(storage.getItem(SHORTCUT_TOGGLE_OVERLAY_KEY), "Alt+Shift+O");
  assert.equal(storage.getItem(SHORTCUT_REFRESH_ACCOUNT_KEY), null);

  saveShortcutPreferences({ refreshAccount: "CommandOrControl+Shift+R" }, storage);
  assert.equal(storage.getItem(SHORTCUT_REFRESH_ACCOUNT_KEY), "CommandOrControl+Shift+R");

  saveShortcutPreferences({ toggleOverlayEnabled: false }, storage);
  assert.equal(storage.getItem(SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY), "false");

  saveShortcutPreferences({ refreshAccountEnabled: true }, storage);
  assert.equal(storage.getItem(SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY), "true");
});

test("formatShortcutDisplay formats CommandOrControl to readable Ctrl/Cmd", () => {
  assert.equal(formatShortcutDisplay("CommandOrControl+Alt+D"), "Ctrl + Alt + D");
  assert.equal(formatShortcutDisplay("Alt+Shift+R"), "Alt + Shift + R");
  assert.equal(formatShortcutDisplay("Command+Option+T"), "Cmd + Option + T");
});

test("buildShortcutFromKeyEvent builds valid shortcut and rejects invalid ones", () => {
  // Modifier only
  assert.equal(
    buildShortcutFromKeyEvent({
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "Control",
      code: "ControlLeft",
    }),
    null,
  );

  // No modifier
  assert.equal(
    buildShortcutFromKeyEvent({
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "d",
      code: "KeyD",
    }),
    null,
  );

  // Ctrl + Alt + D
  assert.equal(
    buildShortcutFromKeyEvent({
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false,
      key: "d",
      code: "KeyD",
    }),
    "CommandOrControl+Alt+D",
  );

  // Alt + Shift + 1
  assert.equal(
    buildShortcutFromKeyEvent({
      ctrlKey: false,
      altKey: true,
      shiftKey: true,
      metaKey: false,
      key: "1",
      code: "Digit1",
    }),
    "Alt+Shift+1",
  );

  // Ctrl + F5
  assert.equal(
    buildShortcutFromKeyEvent({
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "F5",
      code: "F5",
    }),
    "CommandOrControl+F5",
  );
});


test("in-app shortcut parser supports Ctrl+Comma and exact shortcut matching", () => {
  const commaEvent = {
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    key: ",",
    code: "Comma",
  };
  assert.equal(buildShortcutFromKeyEvent(commaEvent), "CommandOrControl+,");
  assert.equal(matchesShortcutEvent(commaEvent, "CommandOrControl+,"), true);
  assert.equal(matchesShortcutEvent(commaEvent, "CommandOrControl+Shift+,"), false);
});

test("in-app shortcut preferences persist custom bindings", () => {
  const storage = new MockStorage();
  saveShortcutPreferences(
    {
      addAccount: "CommandOrControl+Shift+N",
      openSettings: "CommandOrControl+Alt+S",
      quitApp: "CommandOrControl+Alt+Q",
    },
    storage,
  );
  const prefs = loadShortcutPreferences(storage);
  assert.equal(prefs.addAccount, "CommandOrControl+Shift+N");
  assert.equal(prefs.openSettings, "CommandOrControl+Alt+S");
  assert.equal(prefs.quitApp, "CommandOrControl+Alt+Q");
});
