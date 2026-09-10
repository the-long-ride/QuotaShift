import type { AntigravityAccount, AntigravityUsageCacheEntry } from "./types.js";

export type AntigravityTier = "FREE" | "PLUS" | "PRO" | "ULTRA";

export const ANTIGRAVITY_TIERS: readonly AntigravityTier[] = [
  "FREE",
  "PLUS",
  "PRO",
  "ULTRA",
] as const;

export function classifyAntigravityTier(raw: string | null | undefined): AntigravityTier {
  if (!raw) return "FREE";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("ultra")) return "ULTRA";
  if (lower.includes("pro") || lower.includes("advanced")) return "PRO";
  if (
    lower.includes("plus") ||
    lower.includes("paid") ||
    lower.includes("standard") ||
    lower.includes("legacy")
  ) {
    return "PLUS";
  }
  return "FREE";
}

export interface AntigravityTierBadgeItem {
  tier: AntigravityTier;
  count: number;
}

export interface AntigravityTierSummary {
  total: number;
  counts: Record<AntigravityTier, number>;
  badges: AntigravityTierBadgeItem[];
}

export function computeAntigravityTierSummary(
  accounts: AntigravityAccount[] = [],
  usageCache: Record<string, AntigravityUsageCacheEntry> = {},
): AntigravityTierSummary {
  const counts: Record<AntigravityTier, number> = {
    FREE: 0,
    PLUS: 0,
    PRO: 0,
    ULTRA: 0,
  };

  for (const acc of accounts) {
    const plan = usageCache[acc.id]?.planTier ?? acc.lastPlan;
    const tier = classifyAntigravityTier(plan);
    counts[tier]++;
  }

  const total = accounts.length;

  const badges = ANTIGRAVITY_TIERS.filter((tier) => counts[tier] > 0).map((tier) => ({
    tier,
    count: counts[tier],
  }));

  return { total, counts, badges };
}
