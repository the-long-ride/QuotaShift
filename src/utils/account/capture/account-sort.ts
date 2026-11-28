import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
} from "../../common/types.js";
import type { ClaudeAccountUsageStatus } from "../../claude/claude-account-types.js";
import {
  ANTIGRAVITY_TIERS,
  classifyAntigravityTier,
} from "../../antigravity/quota/antigravity-tier-summary.js";
import {
  CODEX_TIERS,
  classifyCodexTier,
  isCodexAccountOAuth,
} from "../../codex/codex-tier-summary.js";
import { CLAUDE_TIERS, classifyClaudeTier } from "../../claude/claude-tier-summary.js";
import {
  finite,
  scoreAntigravityNormalizedUsage,
  scoreClaudeNormalizedUsage,
  scoreCodexNormalizedUsage,
  weightedUsageScore,
} from "./account-usage-score.js";

export {
  scoreAntigravityNormalizedUsage,
  scoreClaudeNormalizedUsage,
  scoreCodexNormalizedUsage,
  weightedUsageScore,
};

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
