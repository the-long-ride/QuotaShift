import type { CodexAccount } from "../common/types.js";
import { deobfuscate } from "../auth/auth.js";

export type CodexTier = "FREE" | "GO" | "PLUS" | "PRO" | "BUSINESS" | "ENTERPRISE" | "EDU" | "API";

export const CODEX_TIERS: readonly CodexTier[] = [
  "FREE",
  "GO",
  "PLUS",
  "PRO",
  "BUSINESS",
  "ENTERPRISE",
  "EDU",
  "API",
] as const;

export function isCodexAccountOAuth(account: CodexAccount, cacheEntry?: any): boolean {
  if (typeof cacheEntry?.isOAuth === "boolean") return cacheEntry.isOAuth;
  if (!account.apiKey) return false;
  try {
    return deobfuscate(account.apiKey).startsWith("{");
  } catch {
    return false;
  }
}

export function classifyCodexTier(raw: string | null | undefined, isOAuth?: boolean): CodexTier {
  if (raw) {
    const lower = raw.toLowerCase().trim();
    if (
      lower.includes("pay") ||
      lower.includes("api") ||
      lower.includes("usage") ||
      lower.includes("tier")
    ) {
      return "API";
    }
    if (lower.includes("business") || lower.includes("team")) return "BUSINESS";
    if (lower.includes("enterprise")) return "ENTERPRISE";
    if (lower.includes("education") || /\bedu\b/.test(lower)) return "EDU";
    if (lower.includes("pro")) return "PRO";
    if (lower.includes("plus")) return "PLUS";
    if (/\bgo\b/.test(lower)) return "GO";
    if (lower.includes("free")) return "FREE";
  }
  if (isOAuth === false) return "API";
  return "FREE";
}

export interface CodexTierBadgeItem {
  tier: CodexTier;
  count: number;
}

export interface CodexTierSummary {
  total: number;
  counts: Record<CodexTier, number>;
  badges: CodexTierBadgeItem[];
}

export function computeCodexTierSummary(
  accounts: CodexAccount[] = [],
  usageCache: Record<string, any> = {},
): CodexTierSummary {
  const counts: Record<CodexTier, number> = {
    FREE: 0,
    GO: 0,
    PLUS: 0,
    PRO: 0,
    BUSINESS: 0,
    ENTERPRISE: 0,
    EDU: 0,
    API: 0,
  };

  for (const acc of accounts) {
    const cache = usageCache[acc.id];
    const isOAuth = isCodexAccountOAuth(acc, cache);
    const plan = cache?.planName ?? acc.lastPlan;
    const tier = classifyCodexTier(plan, isOAuth);
    counts[tier]++;
  }

  const total = accounts.length;

  const badges = CODEX_TIERS.filter((tier) => counts[tier] > 0).map((tier) => ({
    tier,
    count: counts[tier],
  }));

  return { total, counts, badges };
}
