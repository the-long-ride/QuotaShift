import type { CodexAccount } from "./types.js";
import { deobfuscate } from "./auth.js";

export type CodexTier = "FREE" | "PLUS" | "PRO" | "TEAM" | "ENTERPRISE" | "API";

export const CODEX_TIERS: readonly CodexTier[] = [
  "FREE",
  "PLUS",
  "PRO",
  "TEAM",
  "ENTERPRISE",
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

export function classifyCodexTier(
  raw: string | null | undefined,
  isOAuth?: boolean,
): CodexTier {
  if (raw) {
    const lower = raw.toLowerCase().trim();
    if (lower.includes("pro")) return "PRO";
    if (lower.includes("plus")) return "PLUS";
    if (lower.includes("team") || lower.includes("business")) return "TEAM";
    if (
      lower.includes("enterprise") ||
      lower.includes("edu") ||
      lower.includes("education")
    ) {
      return "ENTERPRISE";
    }
    if (lower.includes("free")) return "FREE";
    if (
      lower.includes("pay") ||
      lower.includes("api") ||
      lower.includes("usage") ||
      lower.includes("tier")
    ) {
      return "API";
    }
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
    PLUS: 0,
    PRO: 0,
    TEAM: 0,
    ENTERPRISE: 0,
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

  const badges = CODEX_TIERS
    .filter((tier) => counts[tier] > 0)
    .map((tier) => ({
      tier,
      count: counts[tier],
    }));

  return { total, counts, badges };
}
