export const SHORTCUTS_CHANGED_EVENT = "quotashift_shortcuts_changed";

export const SHORTCUT_TOGGLE_OVERLAY_KEY = "quotashift_shortcut_toggle_overlay";
export const SHORTCUT_REFRESH_ACCOUNT_KEY = "quotashift_shortcut_refresh_account";
export const SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY = "quotashift_shortcut_toggle_overlay_enabled";
export const SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY = "quotashift_shortcut_refresh_account_enabled";

export const IN_APP_SHORTCUT_ADD_ACCOUNT_KEY = "quotashift_in_app_shortcut_add_account";
export const IN_APP_SHORTCUT_TOGGLE_THEME_KEY = "quotashift_in_app_shortcut_toggle_theme";
export const IN_APP_SHORTCUT_TOGGLE_CARD_VIEW_KEY = "quotashift_in_app_shortcut_toggle_card_view";
export const IN_APP_SHORTCUT_FOCUS_SEARCH_KEY = "quotashift_in_app_shortcut_focus_search";
export const IN_APP_SHORTCUT_REFRESH_ALL_KEY = "quotashift_in_app_shortcut_refresh_all";
export const IN_APP_SHORTCUT_OPEN_SETTINGS_KEY = "quotashift_in_app_shortcut_open_settings";
export const IN_APP_SHORTCUT_QUIT_APP_KEY = "quotashift_in_app_shortcut_quit_app";

export const DEFAULT_SHORTCUT_TOGGLE_OVERLAY = "CommandOrControl+Alt+D";
export const DEFAULT_SHORTCUT_REFRESH_ACCOUNT = "CommandOrControl+Alt+R";
export const DEFAULT_SHORTCUT_TOGGLE_OVERLAY_ENABLED = true;
export const DEFAULT_SHORTCUT_REFRESH_ACCOUNT_ENABLED = true;

export const DEFAULT_IN_APP_SHORTCUT_ADD_ACCOUNT = "CommandOrControl+N";
export const DEFAULT_IN_APP_SHORTCUT_TOGGLE_THEME = "CommandOrControl+L";
export const DEFAULT_IN_APP_SHORTCUT_TOGGLE_CARD_VIEW = "CommandOrControl+E";
export const DEFAULT_IN_APP_SHORTCUT_FOCUS_SEARCH = "CommandOrControl+F";
export const DEFAULT_IN_APP_SHORTCUT_REFRESH_ALL = "CommandOrControl+R";
export const DEFAULT_IN_APP_SHORTCUT_OPEN_SETTINGS = "CommandOrControl+,";
export const DEFAULT_IN_APP_SHORTCUT_QUIT_APP = "CommandOrControl+Shift+Q";

export type ShortcutBindingKey =
  | "toggleOverlay"
  | "refreshAccount"
  | "addAccount"
  | "toggleTheme"
  | "toggleCardView"
  | "focusSearch"
  | "refreshAll"
  | "openSettings"
  | "quitApp";

export type InAppShortcutKey =
  | "addAccount"
  | "toggleTheme"
  | "toggleCardView"
  | "focusSearch"
  | "refreshAll"
  | "openSettings"
  | "quitApp";

export interface ShortcutPreferences {
  toggleOverlay: string;
  toggleOverlayEnabled: boolean;
  refreshAccount: string;
  refreshAccountEnabled: boolean;
  addAccount: string;
  toggleTheme: string;
  toggleCardView: string;
  focusSearch: string;
  refreshAll: string;
  openSettings: string;
  quitApp: string;
}

export const IN_APP_SHORTCUT_DEFAULTS: Record<InAppShortcutKey, string> = {
  addAccount: DEFAULT_IN_APP_SHORTCUT_ADD_ACCOUNT,
  toggleTheme: DEFAULT_IN_APP_SHORTCUT_TOGGLE_THEME,
  toggleCardView: DEFAULT_IN_APP_SHORTCUT_TOGGLE_CARD_VIEW,
  focusSearch: DEFAULT_IN_APP_SHORTCUT_FOCUS_SEARCH,
  refreshAll: DEFAULT_IN_APP_SHORTCUT_REFRESH_ALL,
  openSettings: DEFAULT_IN_APP_SHORTCUT_OPEN_SETTINGS,
  quitApp: DEFAULT_IN_APP_SHORTCUT_QUIT_APP,
};

const IN_APP_SHORTCUT_STORAGE_KEYS: Record<InAppShortcutKey, string> = {
  addAccount: IN_APP_SHORTCUT_ADD_ACCOUNT_KEY,
  toggleTheme: IN_APP_SHORTCUT_TOGGLE_THEME_KEY,
  toggleCardView: IN_APP_SHORTCUT_TOGGLE_CARD_VIEW_KEY,
  focusSearch: IN_APP_SHORTCUT_FOCUS_SEARCH_KEY,
  refreshAll: IN_APP_SHORTCUT_REFRESH_ALL_KEY,
  openSettings: IN_APP_SHORTCUT_OPEN_SETTINGS_KEY,
  quitApp: IN_APP_SHORTCUT_QUIT_APP_KEY,
};

export function loadShortcutPreferences(storage: Storage = localStorage): ShortcutPreferences {
  const prefs: ShortcutPreferences = {
    toggleOverlay: storage.getItem(SHORTCUT_TOGGLE_OVERLAY_KEY) || DEFAULT_SHORTCUT_TOGGLE_OVERLAY,
    toggleOverlayEnabled: storage.getItem(SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY) !== "false",
    refreshAccount:
      storage.getItem(SHORTCUT_REFRESH_ACCOUNT_KEY) || DEFAULT_SHORTCUT_REFRESH_ACCOUNT,
    refreshAccountEnabled: storage.getItem(SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY) !== "false",
    addAccount: DEFAULT_IN_APP_SHORTCUT_ADD_ACCOUNT,
    toggleTheme: DEFAULT_IN_APP_SHORTCUT_TOGGLE_THEME,
    toggleCardView: DEFAULT_IN_APP_SHORTCUT_TOGGLE_CARD_VIEW,
    focusSearch: DEFAULT_IN_APP_SHORTCUT_FOCUS_SEARCH,
    refreshAll: DEFAULT_IN_APP_SHORTCUT_REFRESH_ALL,
    openSettings: DEFAULT_IN_APP_SHORTCUT_OPEN_SETTINGS,
    quitApp: DEFAULT_IN_APP_SHORTCUT_QUIT_APP,
  };

  for (const key of Object.keys(IN_APP_SHORTCUT_DEFAULTS) as InAppShortcutKey[]) {
    prefs[key] =
      storage.getItem(IN_APP_SHORTCUT_STORAGE_KEYS[key]) || IN_APP_SHORTCUT_DEFAULTS[key];
  }
  return prefs;
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
  for (const key of Object.keys(IN_APP_SHORTCUT_STORAGE_KEYS) as InAppShortcutKey[]) {
    const value = prefs[key];
    if (value !== undefined) storage.setItem(IN_APP_SHORTCUT_STORAGE_KEYS[key], value);
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(SHORTCUTS_CHANGED_EVENT));
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

export function shortcutKeycaps(shortcut: string): string[] {
  const display = formatShortcutDisplay(shortcut);
  return display ? display.split(" + ") : [];
}

function keyNameFromEvent(e: { key: string; code?: string }): string | null {
  if (e.code?.startsWith("Key")) return e.code.slice(3).toUpperCase();
  if (e.code?.startsWith("Digit")) return e.code.slice(5);
  if (/^F\d{1,2}$/i.test(e.key)) return e.key.toUpperCase();
  if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) return e.key.toUpperCase();

  const punctuation: Record<string, string> = {
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    Space: "Space",
  };
  return (e.code && punctuation[e.code]) || null;
}

export function buildShortcutFromKeyEvent(e: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
  code?: string;
}): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  if (!(e.ctrlKey || e.altKey || e.shiftKey || e.metaKey)) return null;

  const keyName = keyNameFromEvent(e);
  if (!keyName) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(keyName);
  return parts.join("+");
}

export function matchesShortcutEvent(
  e: {
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    key: string;
    code?: string;
  },
  shortcut: string,
): boolean {
  if (!shortcut) return false;
  const parts = shortcut.split("+").map((part) => part.trim());
  const expectsPrimary = parts.includes("CommandOrControl") || parts.includes("CmdOrCtrl");
  const expectsControl = parts.includes("Control");
  const expectsCommand = parts.includes("Command");
  const expectsAlt = parts.includes("Alt") || parts.includes("Option");
  const expectsShift = parts.includes("Shift");

  if (expectsPrimary ? !(e.ctrlKey || e.metaKey) : expectsControl ? !e.ctrlKey : e.ctrlKey)
    return false;
  if (expectsCommand ? !e.metaKey : !expectsPrimary && e.metaKey) return false;
  if (e.altKey !== expectsAlt || e.shiftKey !== expectsShift) return false;

  const modifierNames = new Set([
    "CommandOrControl",
    "CmdOrCtrl",
    "Control",
    "Command",
    "Alt",
    "Option",
    "Shift",
  ]);
  const expectedKey = parts.find((part) => !modifierNames.has(part));
  const eventKey = keyNameFromEvent(e);
  if (!expectedKey || !eventKey) return false;
  return expectedKey.toUpperCase() === eventKey.toUpperCase();
}
