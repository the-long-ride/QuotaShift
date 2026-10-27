import {
  ANTIGRAVITY_TIERS,
  classifyAntigravityTier,
} from "../antigravity/antigravity-tier-summary.js";
import { CODEX_TIERS, classifyCodexTier } from "../codex/codex-tier-summary.js";
import type { CliProvider } from "./types.js";

export function resolveAccountTier(
  provider: CliProvider,
  account: { lastPlan?: string | null; isOAuth?: boolean },
): string {
  if (provider === "agy") {
    return classifyAntigravityTier(account.lastPlan);
  }
  return classifyCodexTier(account.lastPlan, account.isOAuth);
}

export function getAvailableTiers(
  provider: CliProvider,
  accounts: Array<{ lastPlan?: string | null; isOAuth?: boolean }>,
): string[] {
  const presentTiers = new Set<string>();
  for (const acc of accounts) {
    presentTiers.add(resolveAccountTier(provider, acc));
  }

  const standardOrder = provider === "agy" ? ANTIGRAVITY_TIERS : CODEX_TIERS;
  return Array.from(presentTiers).sort((a, b) => {
    const idxA = (standardOrder as readonly string[]).indexOf(a);
    const idxB = (standardOrder as readonly string[]).indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });
}

export function getTierCounts(
  provider: CliProvider,
  accounts: Array<{ lastPlan?: string | null; isOAuth?: boolean }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const acc of accounts) {
    const tier = resolveAccountTier(provider, acc);
    counts[tier] = (counts[tier] ?? 0) + 1;
  }
  return counts;
}
