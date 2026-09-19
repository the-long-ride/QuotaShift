import { syncClaudeGuardrailsToOverlay } from "./claude-overlay-sync.js";
import {
  CLAUDE_POLL_INTERVAL_KEY,
  CLAUDE_STOP_THRESHOLD_KEY,
  CLAUDE_GUARDRAILS_ENABLED_KEY,
  CLAUDE_AUTO_RESUME_AT_RESET_KEY,
  CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY,
  CLAUDE_PREFERENCES_CHANGED_EVENT,
  CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY,
  CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY,
  CLAUDE_WEEKLY_STOP_ENABLED_KEY,
  CLAUDE_WEEKLY_STOP_THRESHOLD_KEY,
  CLAUDE_REDUCE_LOW_USAGE_KEY,
  DEFAULT_CLAUDE_POLL_INTERVAL_SECS,
  DEFAULT_CLAUDE_FIVE_HOUR_STOP_THRESHOLD_PCT,
  DEFAULT_CLAUDE_WEEKLY_STOP_THRESHOLD_PCT,
  ClaudePreferences,
  StorageReader,
  StorageWriter,
  StorageLike,
  parseStoredBoolean,
  sanitizeClaudePollInterval,
  sanitizeClaudeStopThreshold,
} from "./claude-preference-types.js";

export * from "./claude-preference-types.js";

export function normalizeClaudePreferences(preferences: ClaudePreferences): ClaudePreferences {
  const fiveHour = {
    enabled: Boolean(preferences.fiveHour.enabled),
    thresholdPct: sanitizeClaudeStopThreshold(preferences.fiveHour.thresholdPct),
  };
  const weekly = {
    enabled: Boolean(preferences.weekly.enabled),
    thresholdPct: sanitizeClaudeStopThreshold(preferences.weekly.thresholdPct),
  };
  const normalized: ClaudePreferences = {
    pollIntervalSecs: sanitizeClaudePollInterval(preferences.pollIntervalSecs),
    enabled: fiveHour.enabled || weekly.enabled,
    autoResumeAtReset: Boolean(preferences.autoResumeAtReset),
    fiveHour,
    weekly,
  };
  if (preferences.reduceLowUsageFrequency !== undefined) {
    normalized.reduceLowUsageFrequency = Boolean(preferences.reduceLowUsageFrequency);
  }
  return normalized;
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
    const legacyThreshold = hasLegacyThreshold ? sanitizeClaudeStopThreshold(legacyValue) : null;

    const fiveHourThresholdRaw = storage.getItem(CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY);
    const weeklyThresholdRaw = storage.getItem(CLAUDE_WEEKLY_STOP_THRESHOLD_KEY);
    const fiveHourEnabledRaw = storage.getItem(CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY);
    const weeklyEnabledRaw = storage.getItem(CLAUDE_WEEKLY_STOP_ENABLED_KEY);
    const masterEnabledRaw = storage.getItem(CLAUDE_GUARDRAILS_ENABLED_KEY);
    const windowDriven = storage.getItem(CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY) === "true";
    const autoResumeAtReset = parseStoredBoolean(
      storage.getItem(CLAUDE_AUTO_RESUME_AT_RESET_KEY),
      false,
    );
    const rawReduce = storage.getItem(CLAUDE_REDUCE_LOW_USAGE_KEY);
    const reduceLowUsageFrequency =
      rawReduce !== null && rawReduce !== undefined
        ? parseStoredBoolean(rawReduce, false)
        : undefined;

    let fiveHourEnabled = parseStoredBoolean(fiveHourEnabledRaw, hasLegacyThreshold);
    let weeklyEnabled = parseStoredBoolean(weeklyEnabledRaw, hasLegacyThreshold);
    if (!windowDriven && masterEnabledRaw === "false") {
      fiveHourEnabled = false;
      weeklyEnabled = false;
    }

    const defaultFiveHourThreshold = legacyThreshold ?? DEFAULT_CLAUDE_FIVE_HOUR_STOP_THRESHOLD_PCT;
    const defaultWeeklyThreshold = legacyThreshold ?? DEFAULT_CLAUDE_WEEKLY_STOP_THRESHOLD_PCT;

    const parsed: ClaudePreferences = {
      pollIntervalSecs: loadPollInterval(storage),
      enabled: fiveHourEnabled || weeklyEnabled,
      autoResumeAtReset,
      fiveHour: {
        enabled: fiveHourEnabled,
        thresholdPct:
          fiveHourThresholdRaw == null || fiveHourThresholdRaw === ""
            ? defaultFiveHourThreshold
            : sanitizeClaudeStopThreshold(fiveHourThresholdRaw),
      },
      weekly: {
        enabled: weeklyEnabled,
        thresholdPct:
          weeklyThresholdRaw == null || weeklyThresholdRaw === ""
            ? defaultWeeklyThreshold
            : sanitizeClaudeStopThreshold(weeklyThresholdRaw),
      },
    };
    if (reduceLowUsageFrequency !== undefined) {
      parsed.reduceLowUsageFrequency = reduceLowUsageFrequency;
    }
    return normalizeClaudePreferences(parsed);
  } catch {
    return {
      pollIntervalSecs: DEFAULT_CLAUDE_POLL_INTERVAL_SECS,
      enabled: false,
      autoResumeAtReset: false,
      fiveHour: { enabled: false, thresholdPct: DEFAULT_CLAUDE_FIVE_HOUR_STOP_THRESHOLD_PCT },
      weekly: { enabled: false, thresholdPct: DEFAULT_CLAUDE_WEEKLY_STOP_THRESHOLD_PCT },
    };
  }
}

export function saveClaudePreferences(
  preferences: ClaudePreferences,
  storage: StorageWriter = localStorage,
): boolean {
  const normalized = normalizeClaudePreferences(preferences);
  let persisted = true;

  try {
    storage.setItem(CLAUDE_POLL_INTERVAL_KEY, String(normalized.pollIntervalSecs));
    storage.setItem(CLAUDE_GUARDRAILS_ENABLED_KEY, String(normalized.enabled));
    storage.setItem(CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY, "true");
    storage.setItem(CLAUDE_AUTO_RESUME_AT_RESET_KEY, String(normalized.autoResumeAtReset));
    storage.setItem(CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY, String(normalized.fiveHour.enabled));
    storage.setItem(CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY, String(normalized.fiveHour.thresholdPct));
    storage.setItem(CLAUDE_WEEKLY_STOP_ENABLED_KEY, String(normalized.weekly.enabled));
    storage.setItem(CLAUDE_WEEKLY_STOP_THRESHOLD_KEY, String(normalized.weekly.thresholdPct));
    if (normalized.reduceLowUsageFrequency !== undefined) {
      storage.setItem(CLAUDE_REDUCE_LOW_USAGE_KEY, String(normalized.reduceLowUsageFrequency));
    }
  } catch {
    persisted = false;
  }

  if (typeof window !== "undefined") {
    if (persisted && typeof localStorage !== "undefined" && storage === localStorage) {
      syncClaudeGuardrailsToOverlay(normalized);
    }
    window.dispatchEvent(new CustomEvent(CLAUDE_PREFERENCES_CHANGED_EVENT, { detail: normalized }));
  }

  return persisted;
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

export function loadClaudeLowUsageReductionPreference(
  storage: StorageReader = localStorage,
): boolean {
  return Boolean(loadClaudePreferences(storage).reduceLowUsageFrequency);
}

export function saveClaudeLowUsageReductionPreference(
  enabled: boolean,
  storage: StorageLike = localStorage,
): void {
  saveClaudePreferences(
    {
      ...loadClaudePreferences(storage),
      reduceLowUsageFrequency: enabled,
    },
    storage,
  );
}
