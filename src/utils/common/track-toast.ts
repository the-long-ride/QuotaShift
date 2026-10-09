import { currentPlatform, isTaskbarSupported } from "./display-mode.js";
import { formatShortcutDisplay, loadShortcutPreferences } from "./shortcuts.js";

export interface TrackStartedToastOptions {
  platform?: string;
  shortcut?: string;
  shortcutEnabled?: boolean;
}

export function buildTrackStartedToastMessage(options?: TrackStartedToastOptions): string {
  const platform = options?.platform ?? currentPlatform();
  const isWindows = isTaskbarSupported(platform);
  const targets = isWindows ? "Overlay or Taskbar" : "Overlay";

  const prefs = loadShortcutPreferences();
  const enabled = options?.shortcutEnabled ?? prefs.toggleOverlayEnabled;
  const rawShortcut = options?.shortcut !== undefined ? options.shortcut : prefs.toggleOverlay;
  const shortcutDisplay =
    enabled && rawShortcut ? formatShortcutDisplay(rawShortcut, options?.platform) : "";

  if (shortcutDisplay) {
    return `You can show the tracked account in ${targets} in Settings or cycle with ${shortcutDisplay}`;
  }
  return `You can show the tracked account in ${targets} in Settings`;
}

/** Shown when the user turns on the Overlay or Taskbar while no account is tracked. */
export function buildNoTrackedAccountToastMessage(platform: string = currentPlatform()): string {
  const targets = isTaskbarSupported(platform) ? "Overlay or Taskbar" : "Overlay";
  return `No account is tracked yet. Double-click an account card to track it, then show it in the ${targets}.`;
}
