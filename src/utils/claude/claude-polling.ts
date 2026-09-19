import type { ClaudeAccountUsageStatus } from "../common/types";
import type { ClaudePreferences } from "../common/claude-preferences";

export const CLAUDE_FIVE_HOUR_EAGER_MARGIN_PCT = 10;
export const CLAUDE_WEEKLY_EAGER_MARGIN_PCT = 3;
export const CLAUDE_ADAPTIVE_DISTANCE_STEP_PCT = 10;
export const CLAUDE_ADAPTIVE_BACKOFF_PER_STEP = 0.15;
export const CLAUDE_MAX_ADAPTIVE_POLL_SECS = 1200;

export function claudeAccountMonitorPollIntervalSecs(
  guardrailsActive: boolean,
  isClaudeTracked: boolean,
  claudePollIntervalSecs: number,
  globalTrackedPollIntervalSecs: number,
  idlePollIntervalSecs: number,
): number {
  if (guardrailsActive) return Math.max(5, claudePollIntervalSecs);
  if (isClaudeTracked) return Math.max(5, globalTrackedPollIntervalSecs);
  return Math.max(5, idlePollIntervalSecs);
}

function windowMultiplier(
  enabled: boolean,
  usage: number | null | undefined,
  threshold: number,
  eagerMargin: number,
): number | null {
  if (!enabled) return null;
  if (typeof usage !== "number" || !Number.isFinite(usage)) return 1;

  const eagerAt = Math.max(0, threshold - eagerMargin);
  if (usage >= eagerAt) return 1;

  const distance = eagerAt - usage;
  const steps = Math.max(1, Math.ceil(distance / CLAUDE_ADAPTIVE_DISTANCE_STEP_PCT));
  return 1 + steps * CLAUDE_ADAPTIVE_BACKOFF_PER_STEP;
}

export function claudeAdaptivePollMultiplier(
  statuses: ClaudeAccountUsageStatus[],
  preferences: ClaudePreferences,
): number {
  if (!preferences.fiveHour.enabled && !preferences.weekly.enabled) return 1;
  if (!statuses.length) return 1;

  let multiplier = Number.POSITIVE_INFINITY;
  for (const status of statuses) {
    if (!status.usageFresh || status.error) return 1;
    const five = windowMultiplier(
      preferences.fiveHour.enabled,
      status.fiveHour?.usedPercentage,
      preferences.fiveHour.thresholdPct,
      CLAUDE_FIVE_HOUR_EAGER_MARGIN_PCT,
    );
    const weekly = windowMultiplier(
      preferences.weekly.enabled,
      status.sevenDay?.usedPercentage,
      preferences.weekly.thresholdPct,
      CLAUDE_WEEKLY_EAGER_MARGIN_PCT,
    );
    if (five !== null) multiplier = Math.min(multiplier, five);
    if (weekly !== null) multiplier = Math.min(multiplier, weekly);
  }

  return Number.isFinite(multiplier) ? multiplier : 1;
}

export function isClaudeLowUsage(statuses: ClaudeAccountUsageStatus[], thresholdPct = 10): boolean {
  if (!statuses.length) return false;
  return statuses.every((s) => {
    if (!s.usageFresh || s.error) return false;
    const five = s.fiveHour?.usedPercentage;
    const weekly = s.sevenDay?.usedPercentage;
    const fiveLow = five === null || five === undefined || five < thresholdPct;
    const weeklyLow = weekly === null || weekly === undefined || weekly < thresholdPct;
    return fiveLow && weeklyLow;
  });
}

export function claudeAdaptivePollIntervalSecs(
  basePollIntervalSecs: number,
  statuses: ClaudeAccountUsageStatus[],
  preferences: ClaudePreferences,
): number {
  const base = Math.max(5, basePollIntervalSecs);
  let multiplier = claudeAdaptivePollMultiplier(statuses, preferences);

  const guardrailsActive = preferences.fiveHour.enabled || preferences.weekly.enabled;
  const isSafelyOutsideEager = !guardrailsActive || multiplier > 1;

  if (
    preferences.reduceLowUsageFrequency &&
    isSafelyOutsideEager &&
    isClaudeLowUsage(statuses, 10)
  ) {
    multiplier = Math.max(multiplier, 5);
    return Math.min(CLAUDE_MAX_ADAPTIVE_POLL_SECS, Math.max(300, Math.round(base * multiplier)));
  }

  return Math.min(CLAUDE_MAX_ADAPTIVE_POLL_SECS, Math.max(base, Math.round(base * multiplier)));
}
