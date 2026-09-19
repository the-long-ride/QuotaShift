import type { ClaudeAccountUsageStatus } from "./claude-account-types.js";

export type ClaudeTier = "FREE" | "PRO" | "MAX" | "TEAM" | "ENTERPRISE" | "OTHER";

export const CLAUDE_TIERS: readonly ClaudeTier[] = [
  "FREE",
  "PRO",
  "MAX",
  "TEAM",
  "ENTERPRISE",
  "OTHER",
] as const;

export function classifyClaudeTier(raw: string | null | undefined): ClaudeTier {
  const lower = raw?.trim().toLowerCase() ?? "";
  if (!lower) return "OTHER";
  if (lower.includes("max")) return "MAX";
  if (lower.includes("enterprise") || lower.includes("edu") || lower.includes("education")) {
    return "ENTERPRISE";
  }
  if (lower.includes("team") || lower.includes("business")) return "TEAM";
  if (lower.includes("pro")) return "PRO";
  if (lower.includes("free")) return "FREE";
  return "OTHER";
}

export interface ClaudeTierBadgeItem {
  tier: ClaudeTier;
  count: number;
}

export interface ClaudeTierSummary {
  total: number;
  counts: Record<ClaudeTier, number>;
  badges: ClaudeTierBadgeItem[];
}

export function computeClaudeTierSummary(
  statuses: ClaudeAccountUsageStatus[] = [],
): ClaudeTierSummary {
  const counts: Record<ClaudeTier, number> = {
    FREE: 0,
    PRO: 0,
    MAX: 0,
    TEAM: 0,
    ENTERPRISE: 0,
    OTHER: 0,
  };

  for (const status of statuses) {
    const account = status.account;
    const tier = classifyClaudeTier(account.subscriptionType ?? account.rateLimitTier);
    counts[tier]++;
  }

  const badges = CLAUDE_TIERS.filter((tier) => counts[tier] > 0).map((tier) => ({
    tier,
    count: counts[tier],
  }));

  return {
    total: statuses.length,
    counts,
    badges,
  };
}
