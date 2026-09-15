/** Preferences for Claude local monitoring and usage guardrails. */

export const CLAUDE_POLL_INTERVAL_KEY = "quotashift_claude_poll_interval_secs";
export const CLAUDE_STOP_THRESHOLD_KEY = "quotashift_claude_stop_threshold_pct";
export const CLAUDE_GUARDRAILS_ENABLED_KEY = "quotashift_claude_guardrails_enabled";
export const CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY =
  "quotashift_claude_guardrails_window_driven_v1";
export const CLAUDE_PREFERENCES_CHANGED_EVENT = "quotashift:claude-preferences-changed";
export const CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY = "quotashift_claude_five_hour_stop_enabled";
export const CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY =
  "quotashift_claude_five_hour_stop_threshold_pct";
export const CLAUDE_WEEKLY_STOP_ENABLED_KEY = "quotashift_claude_weekly_stop_enabled";
export const CLAUDE_WEEKLY_STOP_THRESHOLD_KEY = "quotashift_claude_weekly_stop_threshold_pct";

const CLAUDE_OVERLAY_DATA_KEY = "quotashift_overlay_data";

export const DEFAULT_CLAUDE_POLL_INTERVAL_SECS = 20;
export const MIN_CLAUDE_POLL_INTERVAL_SECS = 5;
export const MAX_CLAUDE_POLL_INTERVAL_SECS = 1200;
export const DEFAULT_CLAUDE_STOP_THRESHOLD_PCT = 98;
export const MIN_CLAUDE_STOP_THRESHOLD_PCT = 1;
export const MAX_CLAUDE_STOP_THRESHOLD_PCT = 100;

export interface ClaudeGuardrailWindowPreference {
  enabled: boolean;
  thresholdPct: number;
}

export interface ClaudePreferences {
  pollIntervalSecs: number;
  /** Backward-compatible derived flag. Window switches are the source of truth. */
  enabled: boolean;
  fiveHour: ClaudeGuardrailWindowPreference;
  weekly: ClaudeGuardrailWindowPreference;
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
type StorageLike = StorageReader & StorageWriter;

const parseStoredBoolean = (value: string | null, fallback: boolean): boolean => {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
};

export function sanitizeClaudePollInterval(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(
      MAX_CLAUDE_POLL_INTERVAL_SECS,
      Math.max(MIN_CLAUDE_POLL_INTERVAL_SECS, Math.round(value)),
    );
  }
  if (typeof value === "string") {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return sanitizeClaudePollInterval(parsed);
  }
  return DEFAULT_CLAUDE_POLL_INTERVAL_SECS;
}

export function sanitizeClaudeStopThreshold(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(
      MAX_CLAUDE_STOP_THRESHOLD_PCT,
      Math.max(MIN_CLAUDE_STOP_THRESHOLD_PCT, Math.round(value)),
    );
  }
  if (typeof value === "string") {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return sanitizeClaudeStopThreshold(parsed);
  }
  return DEFAULT_CLAUDE_STOP_THRESHOLD_PCT;
}

export function normalizeClaudePreferences(preferences: ClaudePreferences): ClaudePreferences {
  const fiveHour = {
    enabled: Boolean(preferences.fiveHour.enabled),
    thresholdPct: sanitizeClaudeStopThreshold(preferences.fiveHour.thresholdPct),
  };
  const weekly = {
    enabled: Boolean(preferences.weekly.enabled),
    thresholdPct: sanitizeClaudeStopThreshold(preferences.weekly.thresholdPct),
  };
  return {
    pollIntervalSecs: sanitizeClaudePollInterval(preferences.pollIntervalSecs),
    enabled: fiveHour.enabled || weekly.enabled,
    fiveHour,
    weekly,
  };
}

function loadPollInterval(storage: StorageReader): number {
  const raw = storage.getItem(CLAUDE_POLL_INTERVAL_KEY);
  if (raw === null || raw === undefined || raw === "") return DEFAULT_CLAUDE_POLL_INTERVAL_SECS;
  return sanitizeClaudePollInterval(raw);
}

export function loadClaudePreferences(storage: StorageReader = localStorage): ClaudePreferences {
  try {
    const legacyRaw = storage.getItem(CLAUDE_STOP_THRESHOLD_KEY);
    const legacyValue = legacyRaw == null || legacyRaw === "" ? 0 : Number(legacyRaw);
    const hasLegacyThreshold = Number.isFinite(legacyValue) && legacyValue > 0;
    const legacyThreshold = hasLegacyThreshold
      ? sanitizeClaudeStopThreshold(legacyValue)
      : DEFAULT_CLAUDE_STOP_THRESHOLD_PCT;

    const fiveHourThresholdRaw = storage.getItem(CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY);
    const weeklyThresholdRaw = storage.getItem(CLAUDE_WEEKLY_STOP_THRESHOLD_KEY);
    const fiveHourEnabledRaw = storage.getItem(CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY);
    const weeklyEnabledRaw = storage.getItem(CLAUDE_WEEKLY_STOP_ENABLED_KEY);
    const masterEnabledRaw = storage.getItem(CLAUDE_GUARDRAILS_ENABLED_KEY);
    const windowDriven = storage.getItem(CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY) === "true";

    let fiveHourEnabled = parseStoredBoolean(fiveHourEnabledRaw, hasLegacyThreshold);
    let weeklyEnabled = parseStoredBoolean(weeklyEnabledRaw, hasLegacyThreshold);
    if (!windowDriven && masterEnabledRaw === "false") {
      fiveHourEnabled = false;
      weeklyEnabled = false;
    }

    return normalizeClaudePreferences({
      pollIntervalSecs: loadPollInterval(storage),
      enabled: fiveHourEnabled || weeklyEnabled,
      fiveHour: {
        enabled: fiveHourEnabled,
        thresholdPct:
          fiveHourThresholdRaw == null || fiveHourThresholdRaw === ""
            ? legacyThreshold
            : sanitizeClaudeStopThreshold(fiveHourThresholdRaw),
      },
      weekly: {
        enabled: weeklyEnabled,
        thresholdPct:
          weeklyThresholdRaw == null || weeklyThresholdRaw === ""
            ? legacyThreshold
            : sanitizeClaudeStopThreshold(weeklyThresholdRaw),
      },
    });
  } catch {
    return {
      pollIntervalSecs: DEFAULT_CLAUDE_POLL_INTERVAL_SECS,
      enabled: false,
      fiveHour: { enabled: false, thresholdPct: DEFAULT_CLAUDE_STOP_THRESHOLD_PCT },
      weekly: { enabled: false, thresholdPct: DEFAULT_CLAUDE_STOP_THRESHOLD_PCT },
    };
  }
}

function syncClaudeGuardrailsOverlaySnapshot(preferences: ClaudePreferences): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(CLAUDE_OVERLAY_DATA_KEY);
    if (!raw) return;
    const current = JSON.parse(raw);
    if (current?.provider !== "claude") return;
    localStorage.setItem(
      CLAUDE_OVERLAY_DATA_KEY,
      JSON.stringify({
        ...current,
        claudeGuardrails: {
          fiveHourEnabled: preferences.fiveHour.enabled,
          fiveHourThresholdPct: preferences.fiveHour.thresholdPct,
          weeklyEnabled: preferences.weekly.enabled,
          weeklyThresholdPct: preferences.weekly.thresholdPct,
        },
      }),
    );
  } catch {}
}

export function saveClaudePreferences(
  preferences: ClaudePreferences,
  storage: StorageWriter = localStorage,
): void {
  try {
    const normalized = normalizeClaudePreferences(preferences);
    storage.setItem(CLAUDE_POLL_INTERVAL_KEY, String(normalized.pollIntervalSecs));
    storage.setItem(CLAUDE_GUARDRAILS_ENABLED_KEY, String(normalized.enabled));
    storage.setItem(CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY, "true");
    storage.setItem(CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY, String(normalized.fiveHour.enabled));
    storage.setItem(CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY, String(normalized.fiveHour.thresholdPct));
    storage.setItem(CLAUDE_WEEKLY_STOP_ENABLED_KEY, String(normalized.weekly.enabled));
    storage.setItem(CLAUDE_WEEKLY_STOP_THRESHOLD_KEY, String(normalized.weekly.thresholdPct));
    if (typeof window !== "undefined") {
      if (typeof localStorage !== "undefined" && storage === localStorage) {
        syncClaudeGuardrailsOverlaySnapshot(normalized);
      }
      window.dispatchEvent(new CustomEvent(CLAUDE_PREFERENCES_CHANGED_EVENT, { detail: normalized }));
    }
  } catch {}
}

/** Backward-compatible helpers for older callers. */
export function loadClaudePollIntervalPreference(storage: StorageReader = localStorage): number {
  return loadClaudePreferences(storage).pollIntervalSecs;
}

export function saveClaudePollIntervalPreference(
  interval: number,
  storage: StorageLike = localStorage,
): void {
  saveClaudePreferences({ ...loadClaudePreferences(storage), pollIntervalSecs: interval }, storage);
}

export function loadClaudeStopThresholdPreference(storage: StorageReader = localStorage): number {
  const preferences = loadClaudePreferences(storage);
  return preferences.fiveHour.thresholdPct;
}

export function saveClaudeStopThresholdPreference(
  threshold: number,
  storage: StorageLike = localStorage,
): void {
  const sanitized = sanitizeClaudeStopThreshold(threshold);
  saveClaudePreferences(
    {
      ...loadClaudePreferences(storage),
      enabled: true,
      fiveHour: { enabled: true, thresholdPct: sanitized },
      weekly: { enabled: true, thresholdPct: sanitized },
    },
    storage,
  );
}
