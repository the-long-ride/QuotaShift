import { CodexAccount, AntigravityAccount, QuotaData, AntigravityModelQuota } from "./types";

export const USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface BestAccountResult<T> {
  account: T;
  score: number;
}

function clampPercent(value: number | undefined | null): number {
  if (value == null) return 0;
  return Math.min(100, Math.max(0, value));
}

export function isUsageCacheFresh(cache: any, ttlMs = USAGE_CACHE_TTL_MS): boolean {
  return (
    cache &&
    !cache.loading &&
    !cache.error &&
    typeof cache.fetchedAt === "number" &&
    Date.now() - cache.fetchedAt < ttlMs
  );
}

export function scoreCodexAccountUsage(cache: any): number | null {
  if (!cache || cache.loading || cache.error) return null;

  if (cache.isOAuth) {
    const windows = [
      cache.primary,
      cache.secondary,
      cache.monthly,
    ].filter(Boolean);
    if (windows.length === 0) return null;

    let total = 0;
    for (const w of windows) {
      total += 100 - clampPercent(w.used_percent);
    }
    return total / windows.length;
  }

  if (cache.snapshot) {
    const snapshot = cache.snapshot;
    const limit = snapshot.hardLimit || snapshot.softLimit;
    if (!limit) return null;
    const models = Array.isArray(snapshot.models) ? snapshot.models : [];
    const totalSpend = models.reduce((sum: number, m: any) => sum + (m.costUsd || 0), 0);
    return Math.max(0, 100 - (totalSpend / limit) * 100);
  }

  return null;
}

export function pickBestCodexAccount(
  accounts: CodexAccount[],
  usageCache: Record<string, any>
): BestAccountResult<CodexAccount> | null {
  let best: CodexAccount | null = null;
  let bestScore = -Infinity;

  for (const acc of accounts) {
    const score = scoreCodexAccountUsage(usageCache[acc.id]);
    if (score != null && score > bestScore) {
      best = acc;
      bestScore = score;
    }
  }

  return best ? { account: best, score: bestScore } : null;
}

export function scoreAntigravityAccountUsage(
  cache: any,
  fallbackCloudQuotas?: AntigravityModelQuota[],
  fallbackLegacyQuotas?: QuotaData[]
): number | null {
  if (cache?.loading) return null;
  if (cache?.error && !cache?.cloudQuotas?.length && !cache?.quotas?.length) return null;

  const cloudQuotas: AntigravityModelQuota[] | undefined = cache?.cloudQuotas?.length
    ? cache.cloudQuotas
    : fallbackCloudQuotas;

  if (cloudQuotas && cloudQuotas.length > 0) {
    const validPcts: number[] = [];
    for (const q of cloudQuotas) {
      const isPool = q.modelId?.endsWith("_pool") || q.displayName === "Gemini Models" || q.displayName === "Claude and GPT Models";
      const fiveHour = q.fiveHourDisabled
        ? 0
        : (q.fiveHourPercent ?? (isPool ? undefined : q.remainingPercent));
      const weekly = q.weeklyDisabled ? 0 : q.weeklyPercent;
      if (typeof fiveHour === "number" && !isNaN(fiveHour)) validPcts.push(fiveHour);
      if (typeof weekly === "number" && !isNaN(weekly)) validPcts.push(weekly);
    }
    if (validPcts.length === 0) return null;
    return Math.min(...validPcts);
  }

  const legacyQuotas: QuotaData[] | undefined = cache?.quotas?.length
    ? cache.quotas
    : fallbackLegacyQuotas;

  if (!legacyQuotas || legacyQuotas.length === 0) return null;

  let best = -Infinity;
  for (const q of legacyQuotas) {
    const fiveHour = q.fiveHourDisabled ? 0 : (q.fiveHourPercent ?? q.percent ?? 0);
    const weekly = q.weeklyDisabled ? 0 : (q.weeklyPercent ?? q.percent ?? 0);
    const bottleneck = Math.min(fiveHour, weekly);
    if (bottleneck > best) best = bottleneck;
  }

  return best;
}

export function pickBestAntigravityAccount(
  accounts: AntigravityAccount[],
  usageCache: Record<string, any>
): BestAccountResult<AntigravityAccount> | null {
  let best: AntigravityAccount | null = null;
  let bestScore = -Infinity;

  for (const acc of accounts) {
    const score = scoreAntigravityAccountUsage(usageCache[acc.id], acc.cloudQuotas, acc.quotas);
    if (score != null && score > bestScore) {
      best = acc;
      bestScore = score;
    }
  }

  return best ? { account: best, score: bestScore } : null;
}
