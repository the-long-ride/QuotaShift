import {
  isUsageCacheFresh,
  pickBestCodexAccount,
  scoreCodexAccountUsage,
} from "../account/account-selection.js";
import type { BestAccountResult } from "../account/account-selection.js";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexPoolCapacity,
  CodexPoolLaneCapacity,
} from "../common/types.js";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function readUsedPercent(window: any): number | null {
  const value = window?.used_percent;
  return typeof value === "number" && Number.isFinite(value) ? clampPercent(value) : null;
}

function isFreshUsableCache(cache: any): boolean {
  return isUsageCacheFresh(cache);
}

export function normalizeCodexPools(value: unknown): CodexAccountPool[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const normalized: CodexAccountPool[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<CodexAccountPool>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
    if (!id || !name || !model || seenIds.has(id)) continue;

    const accountIds = Array.isArray(candidate.accountIds)
      ? [
          ...new Set(
            candidate.accountIds
              .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              .map((item) => item.trim()),
          ),
        ]
      : [];
    const modelSelectionMode =
      candidate.modelSelectionMode === "discovered" ? "discovered" : "manual";
    const activatedAt =
      typeof candidate.activatedAt === "number" && Number.isFinite(candidate.activatedAt)
        ? candidate.activatedAt
        : undefined;

    seenIds.add(id);
    normalized.push({
      id,
      name,
      model,
      accountIds,
      autoSwitch: candidate.autoSwitch === true,
      modelSelectionMode,
      ...(activatedAt !== undefined ? { activatedAt } : {}),
    });
  }

  return normalized;
}

export function reconcileCodexPools(
  pools: CodexAccountPool[],
  accounts: CodexAccount[],
): CodexAccountPool[] {
  const validIds = new Set(accounts.map((account) => account.id));
  return normalizeCodexPools(pools).map((pool) => ({
    ...pool,
    accountIds: pool.accountIds.filter((id) => validIds.has(id)),
  }));
}

function aggregateLane(
  pool: CodexAccountPool,
  accountsById: Map<string, CodexAccount>,
  usageCache: Record<string, any>,
  lane: "primary" | "secondary",
): CodexPoolLaneCapacity {
  let remainingPoints = 0;
  let capacityPoints = 0;
  let knownMembers = 0;
  let nextResetAt: number | null = null;

  for (const accountId of pool.accountIds) {
    if (!accountsById.has(accountId)) continue;
    const cache = usageCache[accountId];
    if (!isFreshUsableCache(cache) || cache.isOAuth !== true) continue;

    const window = lane === "primary" ? cache.primary : (cache.secondary ?? cache.monthly);
    const usedPercent = readUsedPercent(window);
    if (usedPercent == null) continue;

    const remaining = 100 - usedPercent;
    remainingPoints += remaining;
    capacityPoints += 100;
    knownMembers += 1;

    if (remaining <= 0) {
      const resetAt = window?.reset_at;
      if (typeof resetAt === "number" && Number.isFinite(resetAt)) {
        nextResetAt = nextResetAt == null ? resetAt : Math.min(nextResetAt, resetAt);
      }
    }
  }

  return {
    remainingPoints,
    capacityPoints,
    knownMembers,
    totalMembers: pool.accountIds.length,
    nextResetAt,
  };
}

export function aggregateCodexPoolCapacity(
  pool: CodexAccountPool,
  accounts: CodexAccount[],
  usageCache: Record<string, any>,
): CodexPoolCapacity {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  let oauthMembers = 0;
  let apiKeyMembers = 0;

  for (const accountId of pool.accountIds) {
    if (!accountsById.has(accountId)) continue;
    const cache = usageCache[accountId];
    if (!isFreshUsableCache(cache)) continue;
    if (cache.isOAuth === true) oauthMembers += 1;
    else if (cache.isOAuth === false) apiKeyMembers += 1;
  }

  return {
    primary: aggregateLane(pool, accountsById, usageCache, "primary"),
    secondary: aggregateLane(pool, accountsById, usageCache, "secondary"),
    oauthMembers,
    apiKeyMembers,
  };
}

export function pickBestCodexPoolMember(
  pool: CodexAccountPool,
  accounts: CodexAccount[],
  usageCache: Record<string, any>,
): BestAccountResult<CodexAccount> | null {
  const memberIds = new Set(pool.accountIds);
  const members = accounts.filter((account) => memberIds.has(account.id));
  const healthyOauth = members.filter((account) => {
    const cache = usageCache[account.id];
    return (
      isFreshUsableCache(cache) && cache.isOAuth === true && scoreCodexAccountUsage(cache) != null
    );
  });

  if (healthyOauth.length > 0) {
    return pickBestCodexAccount(healthyOauth, usageCache);
  }

  return pickBestCodexAccount(members, usageCache);
}

function isExhaustedOrUnusable(cache: any): boolean {
  if (!isFreshUsableCache(cache)) return true;

  if (cache.isOAuth === true) {
    const windows = [cache.primary, cache.secondary, cache.monthly].filter(Boolean);
    if (windows.length === 0) return true;
    return windows.some((window) => {
      const usedPercent = readUsedPercent(window);
      return usedPercent != null && usedPercent >= 100;
    });
  }

  const score = scoreCodexAccountUsage(cache);
  return score == null || score <= 0;
}

export function findCodexPoolFailover(
  pool: CodexAccountPool,
  currentAccountId: string | null,
  accounts: CodexAccount[],
  usageCache: Record<string, any>,
): BestAccountResult<CodexAccount> | null {
  if (!pool.autoSwitch || !currentAccountId || !pool.accountIds.includes(currentAccountId))
    return null;

  const currentCache = usageCache[currentAccountId];
  if (!isExhaustedOrUnusable(currentCache)) return null;

  const best = pickBestCodexPoolMember(pool, accounts, usageCache);
  if (!best || best.account.id === currentAccountId) return null;

  const currentScore = scoreCodexAccountUsage(currentCache) ?? -Infinity;
  return best.score > currentScore ? best : null;
}
