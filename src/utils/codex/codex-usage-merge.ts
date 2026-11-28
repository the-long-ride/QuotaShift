import { obfuscate } from "../auth/auth.js";
import type { CodexAccount } from "../common/types.js";
import { normalizeDetectedCodexPlan } from "./account/codex-account-plan.js";
import { propagateRotatedRefreshToken } from "./account/codex-oauth-refresh.js";
import type { CodexResetCreditItem, CodexResetCreditsData } from "./codex-reset-credits.js";
import { normalizeDistinctCodexAccountId } from "./current-local-session.js";

export interface CodexAccountMismatch {
  expected: string;
  actual: string;
}

export function detectCodexAccountMismatch(
  expectedAccountId: unknown,
  usageData: any,
): CodexAccountMismatch | null {
  const expected = normalizeDistinctCodexAccountId(expectedAccountId);
  const actual = normalizeDistinctCodexAccountId(usageData?.account_id);
  if (!expected || !actual || expected === actual) return null;
  return { expected, actual };
}

export function formatCodexAccountMismatchError(mismatch: CodexAccountMismatch): string {
  return `Workspace mismatch: response belonged to another ChatGPT profile (${mismatch.actual.slice(0, 8)}… instead of ${mismatch.expected.slice(0, 8)}…). Re-authenticate and select this profile.`;
}

function isGrantExpired(item: CodexResetCreditItem, nowMs: number): boolean {
  if ((item.status || "available") !== "available") return false;
  if (!item.expires_at) return false;
  const expiresMs = Date.parse(item.expires_at);
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

export function pruneExpiredCodexResetCredits(
  data: CodexResetCreditsData | null | undefined,
  nowMs = Date.now(),
): CodexResetCreditsData | null {
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.credits)) return { ...data };

  const kept = data.credits.filter((item) => !isGrantExpired(item, nowMs));
  if (kept.length === data.credits.length) return { ...data };
  const availableCount = kept.filter((item) => (item.status || "available") === "available").length;
  return {
    ...data,
    credits: kept,
    available_count: availableCount,
  };
}

export function mergeCodexResetCredits(
  incoming: CodexResetCreditsData | null | undefined,
  previous: CodexResetCreditsData | null | undefined,
  nowMs = Date.now(),
): CodexResetCreditsData | null {
  const prunedIncoming = pruneExpiredCodexResetCredits(incoming, nowMs);
  if (
    prunedIncoming &&
    (Array.isArray(prunedIncoming.credits) || typeof prunedIncoming.available_count === "number")
  ) {
    return prunedIncoming;
  }

  const prunedPrevious = pruneExpiredCodexResetCredits(previous, nowMs);
  if (!prunedPrevious) return null;
  return { ...prunedPrevious, stale: true };
}

export function extractPriorCodexUsedPercent(cacheEntry: any): number | null {
  const candidates = [
    cacheEntry?.primary?.used_percent,
    cacheEntry?.rate_limit?.primary_window?.used_percent,
    cacheEntry?.secondary?.used_percent,
    cacheEntry?.rate_limit?.secondary_window?.used_percent,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function buildMergedCodexUsageEntry(
  usageData: any,
  priorCacheEntry: any,
  nowMs = Date.now(),
): Record<string, any> {
  const limits =
    usageData?.rate_limit && typeof usageData.rate_limit === "object" ? usageData.rate_limit : {};
  const priorResetCredits =
    priorCacheEntry?.rate_limit?.reset_credits ?? priorCacheEntry?.resetCredits ?? null;
  const mergedResetCredits = mergeCodexResetCredits(limits.reset_credits, priorResetCredits, nowMs);
  const mergedLimits = mergedResetCredits
    ? { ...limits, reset_credits: mergedResetCredits }
    : limits;
  const primary = mergedLimits.primary_window || null;
  const secondary = mergedLimits.secondary_window || mergedLimits.weekly_window || null;
  const monthly = mergedLimits.monthly_window || mergedLimits.month_window || null;
  const planName = normalizeDetectedCodexPlan(usageData?.plan_type);

  return {
    loading: false,
    fetchedAt: nowMs,
    isOAuth: true,
    planName,
    primary,
    secondary,
    monthly,
    rate_limit: mergedLimits,
    ...(mergedResetCredits ? { resetCredits: mergedResetCredits } : {}),
    error: undefined,
  };
}

export function updateCodexAccountsAfterRefresh(
  accounts: CodexAccount[],
  accountId: string,
  previousRefreshToken: string | null | undefined,
  mergedOAuth: Record<string, any>,
): CodexAccount[] {
  const obfuscatedKey = obfuscate(JSON.stringify(mergedOAuth));
  const withTargetUpdated = accounts.map((item) =>
    item.id === accountId ? { ...item, apiKey: obfuscatedKey } : item,
  );
  return propagateRotatedRefreshToken(withTargetUpdated, accountId, previousRefreshToken, {
    accessToken: mergedOAuth.accessToken,
    refreshToken: mergedOAuth.refreshToken,
    idToken: mergedOAuth.idToken,
    lastRefresh: mergedOAuth.lastRefresh,
  });
}
