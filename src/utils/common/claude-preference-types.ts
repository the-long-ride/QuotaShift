/** Preferences types, constants, and sanitation for Claude monitoring. */

export const CLAUDE_POLL_INTERVAL_KEY = "quotashift_claude_poll_interval_secs";
export const CLAUDE_STOP_THRESHOLD_KEY = "quotashift_claude_stop_threshold_pct";
export const CLAUDE_GUARDRAILS_ENABLED_KEY = "quotashift_claude_guardrails_enabled";
export const CLAUDE_AUTO_RESUME_AT_RESET_KEY = "quotashift_claude_auto_resume_at_reset_v1";
export const CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY = "quotashift_claude_guardrails_window_driven_v1";
export const CLAUDE_PREFERENCES_CHANGED_EVENT = "quotashift:claude-preferences-changed";
export const CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY = "quotashift_claude_five_hour_stop_enabled";
export const CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY = "quotashift_claude_five_hour_stop_threshold_pct";
export const CLAUDE_WEEKLY_STOP_ENABLED_KEY = "quotashift_claude_weekly_stop_enabled";
export const CLAUDE_WEEKLY_STOP_THRESHOLD_KEY = "quotashift_claude_weekly_stop_threshold_pct";
export const CLAUDE_REDUCE_LOW_USAGE_KEY = "quotashift_claude_reduce_low_usage_frequency";

export const DEFAULT_CLAUDE_POLL_INTERVAL_SECS = 20;
export const MIN_CLAUDE_POLL_INTERVAL_SECS = 5;
export const MAX_CLAUDE_POLL_INTERVAL_SECS = 1200;
export const DEFAULT_CLAUDE_STOP_THRESHOLD_PCT = 98;
export const DEFAULT_CLAUDE_FIVE_HOUR_STOP_THRESHOLD_PCT = 95;
export const DEFAULT_CLAUDE_WEEKLY_STOP_THRESHOLD_PCT = 98;
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
  autoResumeAtReset: boolean;
  fiveHour: ClaudeGuardrailWindowPreference;
  weekly: ClaudeGuardrailWindowPreference;
  reduceLowUsageFrequency?: boolean;
}

export type StorageReader = Pick<Storage, "getItem">;
export type StorageWriter = Pick<Storage, "setItem">;
export type StorageLike = StorageReader & StorageWriter;

export const parseStoredBoolean = (value: string | null, fallback: boolean): boolean => {
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
