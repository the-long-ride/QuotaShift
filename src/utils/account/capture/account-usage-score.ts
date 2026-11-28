import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
  QuotaData,
} from "../../common/types.js";
import type { ClaudeAccountUsageStatus } from "../../claude/claude-account-types.js";
import { aggregateCloudQuotasIntoPools } from "../../antigravity/quota/antigravity-quota.js";
import { classifyAntigravityTier } from "../../antigravity/quota/antigravity-tier-summary.js";
import { classifyCodexTier, isCodexAccountOAuth } from "../../codex/codex-tier-summary.js";
import {
  resolveClaudeDisplayTier,
  type ClaudeDisplayTier,
} from "../../claude/claude-tier-summary.js";

export const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const clampPercent = (value: number | null): number | null =>
  value === null ? null : Math.min(100, Math.max(0, value));

const usedFromRemaining = (remaining: number | null | undefined): number | null => {
  const value = clampPercent(finite(remaining));
  return value === null ? null : 100 - value;
};

const usedPercent = (window: any): number | null => clampPercent(finite(window?.used_percent));

export function weightedUsageScore(
  fiveHourUsed: number | null,
  weeklyUsed: number | null,
  fiveHourMultiplier = 1,
  weeklyMultiplier = 1,
): number | null {
  if (fiveHourUsed === null && weeklyUsed === null) return null;
  return (weeklyUsed ?? 0) * weeklyMultiplier + ((fiveHourUsed ?? 0) * fiveHourMultiplier) / 6;
}

function antigravityQuotaRows(
  account: AntigravityAccount,
  cache?: AntigravityUsageCacheEntry,
): QuotaData[] {
  if (cache?.quotas?.length) return cache.quotas;
  if (account.quotas?.length) return account.quotas;
  if (cache?.cloudQuotas?.length) return aggregateCloudQuotasIntoPools(cache.cloudQuotas);
  if (account.cloudQuotas?.length) return aggregateCloudQuotasIntoPools(account.cloudQuotas);
  return [];
}

const ANTIGRAVITY_CAPACITY: Record<string, number> = {
  FREE: 0.3,
  PLUS: 1,
  PRO: 3,
  "PRO+": 3,
  ULTRA: 15,
  ENTERPRISE: 15,
};

const CODEX_MULTIPLIER: Record<string, number> = {
  GO: 0.5,
  Pro5x: 5,
  PRE: 5,
  Pro20x: 20,
  Pro50x: 50,
};

export function scoreAntigravityNormalizedUsage(
  account: AntigravityAccount,
  cache?: AntigravityUsageCacheEntry,
): number | null {
  const tier = classifyAntigravityTier(cache?.planTier ?? account.lastPlan);
  const capacity = ANTIGRAVITY_CAPACITY[tier] ?? 15;
  let score: number | null = null;

  for (const quota of antigravityQuotaRows(account, cache)) {
    const five = quota.fiveHourDisabled
      ? null
      : usedFromRemaining(quota.fiveHourPercent ?? quota.percent);
    const weekly = quota.weeklyDisabled ? null : usedFromRemaining(quota.weeklyPercent);
    const candidate = weightedUsageScore(five, weekly, capacity, capacity);
    if (candidate !== null && (score === null || candidate > score)) score = candidate;
  }
  return score;
}

export function scoreCodexNormalizedUsage(account: CodexAccount, cache: any): number | null {
  if (!cache || cache.loading || cache.error) return null;
  const rawPlan = String(cache.planName ?? account.lastPlan ?? "");
  const isOAuth = isCodexAccountOAuth(account, cache);
  const tier = classifyCodexTier(rawPlan, isOAuth);

  if (tier === "FREE") {
    const monthly = usedPercent(cache.monthly ?? cache.secondary);
    // Four full Free monthly allowances equal one Plus 5-hour allowance.
    return monthly === null ? null : weightedUsageScore(monthly, null, 0.25, 1);
  }

  const multiplier = CODEX_MULTIPLIER[tier] ?? 1;
  return weightedUsageScore(
    usedPercent(cache.primary),
    usedPercent(cache.secondary),
    multiplier,
    multiplier,
  );
}

const CLAUDE_MULTIPLIERS: Partial<Record<ClaudeDisplayTier, { five: number; weekly: number }>> = {
  "Max 20x": { five: 20, weekly: 6.5 },
  "Max 5x": { five: 5, weekly: 3 },
  MAX: { five: 5, weekly: 3 },
  PRE: { five: 6.25, weekly: 6.25 },
  STD: { five: 1.25, weekly: 1.25 },
  TEAM: { five: 1.25, weekly: 1.25 },
};

function claudeUsageMultipliers(
  subType: string | null | undefined,
  rateLimitTier: string | null | undefined,
): { five: number; weekly: number } {
  const displayTier = resolveClaudeDisplayTier(subType, rateLimitTier);
  return CLAUDE_MULTIPLIERS[displayTier] ?? { five: 1, weekly: 1 };
}

export function scoreClaudeNormalizedUsage(status: ClaudeAccountUsageStatus): number | null {
  const multipliers = claudeUsageMultipliers(
    status.account.subscriptionType,
    status.account.rateLimitTier,
  );
  return weightedUsageScore(
    clampPercent(finite(status.fiveHour?.usedPercentage)),
    clampPercent(finite(status.sevenDay?.usedPercentage)),
    multipliers.five,
    multipliers.weekly,
  );
}
