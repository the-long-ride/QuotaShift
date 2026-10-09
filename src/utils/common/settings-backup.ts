import {
  CLAUDE_ALIASES_KEY,
  CODEX_ACTIVE_POOL_ID_KEY,
  CODEX_POOL_ROUTING_KEY,
  KEEP_ALIVE_KEY,
  OVERLAY_ENABLED_KEY,
  THEME_KEY,
} from "./app-constants.js";
import { PERSISTENT_WORKER_KEY } from "../antigravity/antigravity-exact.js";
import { CARD_LAYOUT_MODE_KEY } from "./card-layout-mode.js";
import {
  CLAUDE_AUTO_RESUME_AT_RESET_KEY,
  CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY,
  CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY,
  CLAUDE_GUARDRAILS_ENABLED_KEY,
  CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY,
  CLAUDE_ONLY_WATCH_PROCESSING_ACCOUNTS_KEY,
  CLAUDE_POLL_INTERVAL_KEY,
  CLAUDE_REDUCE_LOW_USAGE_KEY,
  CLAUDE_STOP_THRESHOLD_KEY,
  CLAUDE_WEEKLY_STOP_ENABLED_KEY,
  CLAUDE_WEEKLY_STOP_THRESHOLD_KEY,
} from "./claude-preference-types.js";
import { CLAUDE_RESET_CREDITS_ENABLED_KEY } from "../claude/claude-reset-credits.js";
import { DISPLAY_MODE_KEY, DISPLAY_MODE_LAST_KEY } from "./display-mode.js";
import { MAIN_WINDOW_ZOOM_STORAGE_KEY } from "./main-window-zoom.js";
import { PLATFORM_VISIBILITY_KEY } from "./platform-visibility.js";
import {
  IDLE_POLL_INTERVAL_KEY,
  POLL_INTERVAL_KEY,
  TRACKED_POLL_INTERVAL_KEY,
} from "./poll-interval.js";
import { RESTART_ON_SWITCH_KEY } from "./restart-on-switch.js";
import {
  IN_APP_SHORTCUT_ADD_ACCOUNT_KEY,
  IN_APP_SHORTCUT_FOCUS_SEARCH_KEY,
  IN_APP_SHORTCUT_OPEN_SETTINGS_KEY,
  IN_APP_SHORTCUT_QUIT_APP_KEY,
  IN_APP_SHORTCUT_REFRESH_ALL_KEY,
  IN_APP_SHORTCUT_TOGGLE_CARD_VIEW_KEY,
  IN_APP_SHORTCUT_TOGGLE_THEME_KEY,
  SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY,
  SHORTCUT_REFRESH_ACCOUNT_KEY,
  SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY,
  SHORTCUT_TOGGLE_OVERLAY_KEY,
} from "./shortcuts.js";
import { MULTI_TRACK_KEY } from "./tracked-accounts.js";
import { UI_ADJUSTMENT_STORAGE_KEY } from "./ui-adjustment.js";

/**
 * Every user preference that travels in a backup. Accounts and pools have their own sections;
 * what is deliberately left out (tracked accounts, window positions, caches, per-machine paths)
 * is listed in `tests/shared/settings-backup-coverage.test.mjs`, which fails when a new storage
 * key is added without being classified here or there.
 */
export const BACKUP_SETTING_KEYS: readonly string[] = [
  THEME_KEY,
  CARD_LAYOUT_MODE_KEY,
  PLATFORM_VISIBILITY_KEY,
  MAIN_WINDOW_ZOOM_STORAGE_KEY,
  UI_ADJUSTMENT_STORAGE_KEY,
  DISPLAY_MODE_KEY,
  DISPLAY_MODE_LAST_KEY,
  OVERLAY_ENABLED_KEY,
  MULTI_TRACK_KEY,
  POLL_INTERVAL_KEY,
  TRACKED_POLL_INTERVAL_KEY,
  IDLE_POLL_INTERVAL_KEY,
  KEEP_ALIVE_KEY,
  PERSISTENT_WORKER_KEY,
  RESTART_ON_SWITCH_KEY,
  CODEX_POOL_ROUTING_KEY,
  CODEX_ACTIVE_POOL_ID_KEY,
  CLAUDE_POLL_INTERVAL_KEY,
  CLAUDE_STOP_THRESHOLD_KEY,
  CLAUDE_GUARDRAILS_ENABLED_KEY,
  CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY,
  CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY,
  CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY,
  CLAUDE_WEEKLY_STOP_ENABLED_KEY,
  CLAUDE_WEEKLY_STOP_THRESHOLD_KEY,
  CLAUDE_AUTO_RESUME_AT_RESET_KEY,
  CLAUDE_REDUCE_LOW_USAGE_KEY,
  CLAUDE_ONLY_WATCH_PROCESSING_ACCOUNTS_KEY,
  CLAUDE_RESET_CREDITS_ENABLED_KEY,
  CLAUDE_ALIASES_KEY,
  SHORTCUT_TOGGLE_OVERLAY_KEY,
  SHORTCUT_TOGGLE_OVERLAY_ENABLED_KEY,
  SHORTCUT_REFRESH_ACCOUNT_KEY,
  SHORTCUT_REFRESH_ACCOUNT_ENABLED_KEY,
  IN_APP_SHORTCUT_ADD_ACCOUNT_KEY,
  IN_APP_SHORTCUT_TOGGLE_THEME_KEY,
  IN_APP_SHORTCUT_TOGGLE_CARD_VIEW_KEY,
  IN_APP_SHORTCUT_FOCUS_SEARCH_KEY,
  IN_APP_SHORTCUT_REFRESH_ALL_KEY,
  IN_APP_SHORTCUT_OPEN_SETTINGS_KEY,
  IN_APP_SHORTCUT_QUIT_APP_KEY,
];

/** A preference is a short string; anything bigger is not something QuotaShift wrote. */
const MAX_SETTING_VALUE_LENGTH = 64 * 1024;

type SettingsReader = Pick<Storage, "getItem">;
type SettingsWriter = Pick<Storage, "setItem">;

/** The stored preferences, by key. Keys that were never set are left out. */
export function collectSettings(
  storage: SettingsReader | null = typeof localStorage === "undefined" ? null : localStorage,
): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const key of BACKUP_SETTING_KEYS) {
    try {
      const value = storage?.getItem(key);
      if (typeof value === "string") settings[key] = value;
    } catch {
      // Unreadable key: it is simply not part of this backup.
    }
  }
  return settings;
}

/**
 * Preferences in a backup. Only known keys with string values survive, so a tampered or newer
 * backup cannot write arbitrary storage keys. A v2 backup only carried the theme.
 */
export function extractBackupSettings(data: unknown): Record<string, string> {
  const settings: Record<string, string> = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return settings;
  const source = (data as Record<string, unknown>).settings;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const key of BACKUP_SETTING_KEYS) {
      const value = (source as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length <= MAX_SETTING_VALUE_LENGTH) {
        settings[key] = value;
      }
    }
  }
  const legacyTheme = (data as Record<string, unknown>).theme;
  if (!(THEME_KEY in settings) && (legacyTheme === "dark" || legacyTheme === "light")) {
    settings[THEME_KEY] = legacyTheme;
  }
  return settings;
}

export interface ApplySettingsOptions {
  /** Pool ids that exist after the restore; an active pool that is not among them is not applied. */
  knownPoolIds?: readonly string[];
}

/** Writes the preferences into storage and returns how many were applied. */
export function applyBackupSettings(
  settings: Record<string, string>,
  storage: SettingsWriter | null = typeof localStorage === "undefined" ? null : localStorage,
  options: ApplySettingsOptions = {},
): number {
  if (!storage) return 0;
  let applied = 0;
  for (const [key, value] of Object.entries(settings)) {
    if (key === CODEX_ACTIVE_POOL_ID_KEY && options.knownPoolIds) {
      if (!options.knownPoolIds.includes(value)) continue;
    }
    try {
      storage.setItem(key, value);
      applied += 1;
    } catch {
      // Storage refused this key; the others are still restored.
    }
  }
  return applied;
}
