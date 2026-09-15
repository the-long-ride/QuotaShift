export const SHORTCUT_TOGGLE_OVERLAY_KEY = "quotashift_shortcut_toggle_overlay";
export const SHORTCUT_REFRESH_ACCOUNT_KEY = "quotashift_shortcut_refresh_account";
export const SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY = "quotashift_shortcut_toggle_overlay_enabled";
export const SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY = "quotashift_shortcut_refresh_account_enabled";

export const DEFAULT_SHORTCUT_TOGGLE_OVERLAY = "CommandOrControl+Alt+D";
export const DEFAULT_SHORTCUT_REFRESH_ACCOUNT = "CommandOrControl+Alt+R";
export const DEFAULT_SHORTCUT_TOGGLE_OVERLAY_ENABLED = true;
export const DEFAULT_SHORTCUT_REFRESH_ACCOUNT_ENABLED = true;

export interface ShortcutPreferences {
  toggleOverlay: string;
  toggleOverlayEnabled: boolean;
  refreshAccount: string;
  refreshAccountEnabled: boolean;
}

export function loadShortcutPreferences(storage: Storage = localStorage): ShortcutPreferences {
  const toggleOverlay =
    storage.getItem(SHORTCUT_TOGGLE_OVERLAY_KEY) || DEFAULT_SHORTCUT_TOGGLE_OVERLAY;
  const refreshAccount =
    storage.getItem(SHORTCUT_REFRESH_ACCOUNT_KEY) || DEFAULT_SHORTCUT_REFRESH_ACCOUNT;
  const toggleOverlayEnabled = storage.getItem(SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY) !== "false";
  const refreshAccountEnabled = storage.getItem(SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY) !== "false";
  return { toggleOverlay, toggleOverlayEnabled, refreshAccount, refreshAccountEnabled };
}

export function saveShortcutPreferences(
  prefs: Partial<ShortcutPreferences>,
  storage: Storage = localStorage,
): void {
  if (prefs.toggleOverlay !== undefined) {
    storage.setItem(SHORTCUT_TOGGLE_OVERLAY_KEY, prefs.toggleOverlay);
  }
  if (prefs.toggleOverlayEnabled !== undefined) {
    storage.setItem(SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY, String(prefs.toggleOverlayEnabled));
  }
  if (prefs.refreshAccount !== undefined) {
    storage.setItem(SHORTCUT_REFRESH_ACCOUNT_KEY, prefs.refreshAccount);
  }
  if (prefs.refreshAccountEnabled !== undefined) {
    storage.setItem(SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY, String(prefs.refreshAccountEnabled));
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("quotashift_shortcuts_changed"));
  }
}

export function formatShortcutDisplay(shortcut: string): string {
  if (!shortcut) return "";
  const isMac =
    typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || "");
  return shortcut
    .split("+")
    .map((part) => {
      const p = part.trim();
      if (p === "CommandOrControl" || p === "CmdOrCtrl") return isMac ? "Cmd" : "Ctrl";
      if (p === "Command") return "Cmd";
      if (p === "Control") return "Ctrl";
      return p;
    })
    .join(" + ");
}

export function buildShortcutFromKeyEvent(e: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
  code?: string;
}): string | null {
  const isModifierOnly = ["Control", "Alt", "Shift", "Meta"].includes(e.key);
  if (isModifierOnly) return null;

  const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  if (!hasModifier) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  let keyName = "";
  if (e.code && e.code.startsWith("Key")) {
    keyName = e.code.slice(3).toUpperCase();
  } else if (e.code && e.code.startsWith("Digit")) {
    keyName = e.code.slice(5);
  } else if (/^F\d{1,2}$/i.test(e.key)) {
    keyName = e.key.toUpperCase();
  } else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
    keyName = e.key.toUpperCase();
  } else {
    return null;
  }

  parts.push(keyName);
  return parts.join("+");
}
