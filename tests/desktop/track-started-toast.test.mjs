import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildNoTrackedAccountToastMessage,
  buildTrackStartedToastMessage,
} from "../../.test-build/common/track-toast.js";

test("track started toast includes Taskbar on Windows and formats cycle shortcut", () => {
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  const msg = buildTrackStartedToastMessage({
    platform: win,
    shortcut: "CommandOrControl+Alt+D",
    shortcutEnabled: true,
  });
  assert.match(msg, /Overlay or Taskbar/);
  assert.match(msg, /in Settings/);
  assert.match(msg, /cycle with Ctrl \+ Alt \+ D/);
  assert.equal(
    msg,
    "You can show the tracked account in Overlay or Taskbar in Settings or cycle with Ctrl + Alt + D",
  );
});

test("track started toast omits Taskbar on non-Windows platforms (macOS and Linux)", () => {
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Darwin";
  const linux = "Mozilla/5.0 (X11; Linux x86_64)";

  const macMsg = buildTrackStartedToastMessage({
    platform: mac,
    shortcut: "CommandOrControl+Alt+D",
    shortcutEnabled: true,
  });
  assert.match(macMsg, /Overlay/);
  assert.doesNotMatch(macMsg, /Taskbar/i);
  assert.match(macMsg, /in Settings/);
  assert.match(macMsg, /cycle with Cmd \+ Alt \+ D/);

  const linuxMsg = buildTrackStartedToastMessage({
    platform: linux,
    shortcut: "CommandOrControl+Alt+D",
    shortcutEnabled: true,
  });
  assert.match(linuxMsg, /Overlay/);
  assert.doesNotMatch(linuxMsg, /Taskbar/i);
  assert.match(linuxMsg, /cycle with Ctrl \+ Alt \+ D/);
});

test("track started toast omits shortcut text when shortcut is disabled or empty", () => {
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  const disabledMsg = buildTrackStartedToastMessage({
    platform: win,
    shortcut: "CommandOrControl+Alt+D",
    shortcutEnabled: false,
  });
  assert.equal(disabledMsg, "You can show the tracked account in Overlay or Taskbar in Settings");
  assert.doesNotMatch(disabledMsg, /cycle with/i);

  const emptyMsg = buildTrackStartedToastMessage({
    platform: win,
    shortcut: "",
    shortcutEnabled: true,
  });
  assert.equal(emptyMsg, "You can show the tracked account in Overlay or Taskbar in Settings");
});

test("useTrackedAccountIds fires onTrackStarted only on transition from empty to non-empty", () => {
  const trackedHook = fs.readFileSync("src/hooks/app/useTrackedAccountIds.ts", "utf8");
  assert.match(trackedHook, /onTrackStarted\?: \(\) => void/);
  assert.match(trackedHook, /const wasEmpty = trackedListRef\.current\.length === 0/);
  assert.match(trackedHook, /if \(wasEmpty && next\.length > 0\)/);
  assert.match(trackedHook, /onTrackStartedRef\.current\?\.\(\)/);
});

test("useAppCoordinator and useAppUsageAndOverlay wire notifyTrackStarted to showToast", () => {
  const coordinator = fs.readFileSync("src/hooks/app/useAppCoordinator.ts", "utf8");
  const usageTypes = fs.readFileSync("src/hooks/app/useAppUsageAndOverlay.types.ts", "utf8");
  const usageOverlay = fs.readFileSync("src/hooks/app/useAppUsageAndOverlay.ts", "utf8");

  assert.match(usageTypes, /notifyTrackStarted\?: \(\) => void/);
  assert.match(usageOverlay, /notifyTrackStarted/);
  assert.match(usageOverlay, /useTrackedAccountIds\(notifyTrackStarted\)/);
  assert.match(coordinator, /buildTrackStartedToastMessage/);
  assert.match(
    coordinator,
    /notifyTrackStarted:\s*\(\)\s*=>\s*showToast\(buildTrackStartedToastMessage\(\),\s*["']info["']\)/,
  );
});

test("turning on a display mode with no tracked account explains how to track one", () => {
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
  assert.match(
    buildNoTrackedAccountToastMessage(win),
    /Double-click an account card.*Overlay or Taskbar/,
  );
  assert.match(buildNoTrackedAccountToastMessage(mac), /in the Overlay\.$/);

  const hook = fs.readFileSync("src/hooks/app/useAppThemeAndOverlay.ts", "utf8");
  assert.match(hook, /useAppThemeAndOverlay = \(onNoTrackedAccounts\?: \(\) => void\)/);
  assert.match(
    hook,
    /if \(!hasTracked && requested !== "none"\) onNoTrackedAccountsRef\.current\?\.\(\)/,
  );
  assert.match(
    hook,
    /if \(!hasTracked && displayModeRef\.current === "none"\) \{\s*onNoTrackedAccountsRef\.current\?\.\(\);/,
  );
  const coordinator = fs.readFileSync("src/hooks/app/useAppCoordinator.ts", "utf8");
  assert.match(coordinator, /showToast\(buildNoTrackedAccountToastMessage\(\), "info"\)/);
});
