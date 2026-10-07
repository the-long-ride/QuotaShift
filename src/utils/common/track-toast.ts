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
  const shortcutDisplay = enabled && rawShortcut ? formatShortcutDisplay(rawShortcut) : "";

  if (shortcutDisplay) {
    return `You can show the tracked account in ${targets} in Settings or cycle with ${shortcutDisplay}`;
  }
  return `You can show the tracked account in ${targets} in Settings`;
}
