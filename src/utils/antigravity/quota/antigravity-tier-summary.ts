import type { AntigravityAccount, AntigravityUsageCacheEntry } from "../../common/types.js";

export type AntigravityTier = "FREE" | "PLUS" | "PRO" | "PRO+" | "ULTRA" | "ENTERPRISE";

export const ANTIGRAVITY_TIERS: readonly AntigravityTier[] = [
  "FREE",
  "PLUS",
  "PRO",
  "PRO+",
  "ULTRA",
  "ENTERPRISE",
] as const;

export const PRO_PLUS_EMPTY_PRESERVE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isAntigravityProPlusPlan(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase().trim();
  return (
    lower.includes("pro+") ||
    lower.includes("pro plus") ||
    lower.includes("pro-plus") ||
    lower.includes("pro_plus")
  );
}

export function classifyAntigravityTier(raw: string | null | undefined): AntigravityTier {
  if (!raw) return "FREE";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("ultra")) return "ULTRA";
  if (lower.includes("enterprise")) return "ENTERPRISE";
  if (isAntigravityProPlusPlan(lower)) {
    return "PRO+";
  }
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

export interface PreserveAntigravityTierParams {
  incomingPlan?: string | null;
  incomingPremiumModels?: readonly string[] | null;
  previousPlan?: string | null;
  previousPremiumModels?: readonly string[] | null;
  /** True for local IDE reads that can omit CLI-gated models even on Pro+ accounts. */
  preserveOnEmpty?: boolean;
  /** Unix ms timestamp when previous Pro+ status was last observed. */
  previousObservedAt?: number | null;
  now?: number;
  preserveOnEmptyMaxAgeMs?: number;
}

/**
 * Prevent Pro+ badges and observed next-gen models from flickering back to Pro
 * when fetchAvailableModels transiently fails (null) or a local IDE read omits CLI-gated models.
 */
export function resolvePreservedAntigravityTier({
  incomingPlan,
  incomingPremiumModels,
  previousPlan,
  previousPremiumModels,
  preserveOnEmpty = false,
  previousObservedAt,
  now = Date.now(),
  preserveOnEmptyMaxAgeMs = PRO_PLUS_EMPTY_PRESERVE_MAX_AGE_MS,
}: PreserveAntigravityTierParams): {
  planTier: string | null;
  premiumModels: string[] | null;
} {
  const prevModels = previousPremiumModels ? [...previousPremiumModels] : null;
  const incomingIsList = Array.isArray(incomingPremiumModels);
  const incomingHasModels = incomingIsList && incomingPremiumModels.length > 0;
  const incomingIsPro = classifyAntigravityTier(incomingPlan) === "PRO";
  const previousWasProPlus = classifyAntigravityTier(previousPlan) === "PRO+";

  if (incomingHasModels) {
    return {
      planTier: incomingIsPro ? "Google AI Pro+" : (incomingPlan ?? previousPlan ?? null),
      premiumModels: [...incomingPremiumModels],
    };
  }

  const withinPreserveWindow =
    previousObservedAt == null || now - previousObservedAt <= preserveOnEmptyMaxAgeMs;
  const shouldPreservePrevious =
    !incomingIsList || (preserveOnEmpty && previousWasProPlus && withinPreserveWindow);
  if (shouldPreservePrevious) {
    return {
      planTier:
        incomingIsPro && previousWasProPlus
          ? "Google AI Pro+"
          : (incomingPlan ?? previousPlan ?? null),
      premiumModels: prevModels,
    };
  }

  return {
    planTier: incomingPlan ?? previousPlan ?? null,
    premiumModels: [],
  };
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
    "PRO+": 0,
    ULTRA: 0,
    ENTERPRISE: 0,
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
