import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
  QuotaData,
} from "../common/types.js";
import type { ClaudeAccountUsageStatus } from "../claude/claude-account-types.js";
import { aggregateCloudQuotasIntoPools } from "../antigravity/antigravity-quota.js";
import {
  ANTIGRAVITY_TIERS,
  classifyAntigravityTier,
} from "../antigravity/antigravity-tier-summary.js";
import {
  CODEX_TIERS,
  classifyCodexTier,
  isCodexAccountOAuth,
} from "../codex/codex-tier-summary.js";
import { CLAUDE_TIERS, classifyClaudeTier } from "../claude/claude-tier-summary.js";

export type AccountSortField = "alias" | "email" | "tier" | "usage" | "lastUsed";
export type AccountSortDirection = "asc" | "desc";

type SortRecord = {
  id: string;
  alias: string | null;
  email: string | null;
  tier: number | null;
  usage: number | null;
  lastUsed: number | null;
};

const finite = (value: unknown): number | null =>
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

function compareOptional<T>(
  left: T | null,
  right: T | null,
  direction: AccountSortDirection,
  compare: (a: T, b: T) => number,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const result = compare(left, right);
  return direction === "asc" ? result : -result;
}

function sortRecords(
  records: SortRecord[],
  field: AccountSortField,
  direction: AccountSortDirection,
): string[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const a = left.record[field];
      const b = right.record[field];
      const result =
        field === "alias" || field === "email"
          ? compareOptional(a as string | null, b as string | null, direction, (x, y) =>
              x.localeCompare(y, undefined, { sensitivity: "base", numeric: true }),
            )
          : compareOptional(a as number | null, b as number | null, direction, (x, y) => x - y);
      return result || left.index - right.index;
    })
    .map(({ record }) => record.id);
}

const tierRank = <T extends string>(tiers: readonly T[], tier: T): number => tiers.indexOf(tier);

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

export function scoreAntigravityNormalizedUsage(
  account: AntigravityAccount,
  cache?: AntigravityUsageCacheEntry,
): number | null {
  const tier = classifyAntigravityTier(cache?.planTier ?? account.lastPlan);
  const capacity = tier === "FREE" ? 0.3 : tier === "PLUS" ? 1 : tier === "PRO" ? 3 : 15;
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

function codexPlanMultiplier(rawPlan: string, tier: ReturnType<typeof classifyCodexTier>): number {
  if (tier !== "PRO") return 1;
  return /(?:x\s*20|20\s*x)/i.test(rawPlan) ? 20 : 5;
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

  const multiplier = codexPlanMultiplier(rawPlan, tier);
  return weightedUsageScore(
    usedPercent(cache.primary),
    usedPercent(cache.secondary),
    multiplier,
    multiplier,
  );
}

function claudeUsageMultipliers(rawTier: string): { five: number; weekly: number } {
  if (classifyClaudeTier(rawTier) !== "MAX") return { five: 1, weekly: 1 };
  const isTwenty = /(?:x[_\s-]*20|20[_\s-]*x)/i.test(rawTier);
  return isTwenty ? { five: 20, weekly: 6.5 } : { five: 5, weekly: 3 };
}

export function scoreClaudeNormalizedUsage(status: ClaudeAccountUsageStatus): number | null {
  const rawTier = status.account.subscriptionType ?? status.account.rateLimitTier ?? "";
  const multipliers = claudeUsageMultipliers(rawTier);
  return weightedUsageScore(
    clampPercent(finite(status.fiveHour?.usedPercentage)),
    clampPercent(finite(status.sevenDay?.usedPercentage)),
    multipliers.five,
    multipliers.weekly,
  );
}

export function sortAntigravityAccountIds(
  accounts: AntigravityAccount[],
  usageCache: Record<string, AntigravityUsageCacheEntry>,
  field: AccountSortField,
  direction: AccountSortDirection,
): string[] {
  return sortRecords(
    accounts.map((account) => {
      const cache = usageCache[account.id];
      const tier = classifyAntigravityTier(cache?.planTier ?? account.lastPlan);
      return {
        id: account.id,
        alias: account.label?.trim() || null,
        email: account.email?.trim() || cache?.email?.trim() || null,
        tier: tierRank(ANTIGRAVITY_TIERS, tier),
        usage: scoreAntigravityNormalizedUsage(account, cache),
        lastUsed: finite(account.lastUsedAt),
      };
    }),
    field,
    direction,
  );
}

export function sortCodexAccountIds(
  accounts: CodexAccount[],
  usageCache: Record<string, any>,
  field: AccountSortField,
  direction: AccountSortDirection,
): string[] {
  return sortRecords(
    accounts.map((account) => {
      const cache = usageCache[account.id];
      const isOAuth = isCodexAccountOAuth(account, cache);
      const tier = classifyCodexTier(cache?.planName ?? account.lastPlan, isOAuth);
      return {
        id: account.id,
        alias: account.label?.trim() || null,
        email: account.email?.trim() || null,
        tier: tierRank(CODEX_TIERS, tier),
        usage: scoreCodexNormalizedUsage(account, cache),
        lastUsed: finite(account.lastUsedAt),
      };
    }),
    field,
    direction,
  );
}

export function sortClaudeAccountIds(
  statuses: ClaudeAccountUsageStatus[],
  field: AccountSortField,
  direction: AccountSortDirection,
): string[] {
  return sortRecords(
    statuses.map((status) => {
      const account = status.account;
      const tier = classifyClaudeTier(account.subscriptionType ?? account.rateLimitTier);
      return {
        id: account.id,
        alias: account.profileName?.trim() || null,
        email: account.email?.trim() || null,
        tier: tierRank(CLAUDE_TIERS, tier),
        usage: scoreClaudeNormalizedUsage(status),
        lastUsed: finite(status.lastUsedAt),
      };
    }),
    field,
    direction,
  );
}
