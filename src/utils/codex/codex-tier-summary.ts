import type { CodexAccount } from "../common/types.js";
import { deobfuscate } from "../auth/auth.js";

export type CodexTier =
  | "FREE"
  | "GO"
  | "PLUS"
  | "Pro5x"
  | "Pro20x"
  | "Pro50x"
  | "STD"
  | "PRE"
  | "ENTERPRISE"
  | "EDU"
  | "API";

export const CODEX_TIERS: readonly CodexTier[] = [
  "FREE",
  "GO",
  "PLUS",
  "Pro5x",
  "Pro20x",
  "Pro50x",
  "STD",
  "PRE",
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
    const compact = lower.replace(/[\s_-]+/g, "");

    if (
      lower.includes("self_serve_business_prolite") ||
      compact === "bpre" ||
      compact === "pre" ||
      ((lower.includes("business") || lower.includes("team")) &&
        (lower.includes("prolite") ||
          lower.includes("premium") ||
          /\bpre\b/.test(lower) ||
          /\bpro\b/.test(lower)))
    ) {
      return "PRE";
    }
    if (
      lower.includes("self_serve_business") ||
      lower.includes("business") ||
      lower.includes("team") ||
      compact === "bstd" ||
      compact === "std"
    ) {
      return "STD";
    }
    if (lower.includes("enterprise")) return "ENTERPRISE";
    if (lower.includes("education") || /\bedu\b/.test(lower)) return "EDU";

    if (
      compact.includes("promax") ||
      /pro[\s_-]*(?:500|50x|x50)\b/.test(lower) ||
      (/\b50\s*x\b/.test(lower) && lower.includes("pro"))
    ) {
      return "Pro50x";
    }
    if (
      compact.includes("prolite") ||
      /pro[\s_-]*(?:100|5x|x5|10x|x10)\b/.test(lower) ||
      (/\b(?:5|10)\s*x\b/.test(lower) && lower.includes("pro"))
    ) {
      return "Pro5x";
    }
    if (lower.includes("pro")) return "Pro20x";
    if (lower.includes("plus")) return "PLUS";

    if (
      lower.includes("pay") ||
      lower.includes("api") ||
      lower.includes("usage") ||
      lower.includes("tier")
    ) {
      return "API";
    }
    if (/\bgo\b/.test(lower)) return "GO";
    if (lower.includes("free") || lower.includes("guest")) return "FREE";
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
    Pro5x: 0,
    Pro20x: 0,
    Pro50x: 0,
    STD: 0,
    PRE: 0,
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
