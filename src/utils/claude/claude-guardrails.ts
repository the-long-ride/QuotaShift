import type { ClaudeAccountUsageStatus } from "./claude-account-types";
import type { ClaudePreferences } from "../common/claude-preferences";

export interface ClaudeGuardrailDecision {
  hit: boolean;
  fiveHourHit: boolean;
  weeklyHit: boolean;
}

export function claudeAccountGuardrailDecision(
  status: ClaudeAccountUsageStatus,
  preferences: ClaudePreferences,
): ClaudeGuardrailDecision {
  if (
    (preferences.onlyWatchProcessingAccounts && status.active !== true) ||
    !status.usageFresh ||
    status.error
  ) {
    return {
      hit: false,
      fiveHourHit: false,
      weeklyHit: false,
    };
  }

  const five = status.fiveHour?.usedPercentage;
  const weekly = status.sevenDay?.usedPercentage;
  const fiveHourHit =
    preferences.fiveHour.enabled &&
    typeof five === "number" &&
    Number.isFinite(five) &&
    five >= preferences.fiveHour.thresholdPct;
  const weeklyHit =
    preferences.weekly.enabled &&
    typeof weekly === "number" &&
    Number.isFinite(weekly) &&
    weekly >= preferences.weekly.thresholdPct;

  return {
    hit: fiveHourHit || weeklyHit,
    fiveHourHit,
    weeklyHit,
  };
}
