import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  CodexAccount,
} from "../types.js";
import type { TrackedEntry, TrackedProvider } from "./tracked-accounts.js";
import { classifyAntigravityTier } from "../../antigravity/quota/antigravity-tier-summary.js";
import { classifyCodexTier, isCodexAccountOAuth } from "../../codex/codex-tier-summary.js";
import { classifyClaudeTier } from "../../claude/claude-tier-summary.js";

export const OPEN_MONITORED_ACCOUNTS_MODAL_EVENT = "quotashift:open-monitored-accounts-modal";

export type MonitoredSortField = "platform" | "alias" | "email" | "tier";
export type MonitoredSortDirection = "asc" | "desc";

export interface MonitoredAccountItem {
  id: string;
  entry: TrackedEntry;
  platform: TrackedProvider;
  platformLabel: string;
  alias: string;
  email: string;
  tier: string;
}

export interface MonitoredAccountSources {
  antigravityAccounts: AntigravityAccount[];
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  codexAccounts: CodexAccount[];
  codexUsageCache: Record<string, any>;
  claudeAccountStatuses: ClaudeAccountUsageStatus[];
}

const PLATFORM_LABELS: Record<TrackedProvider, string> = {
  antigravity: "Antigravity",
  codex: "ChatGPT Codex",
  claude: "Claude Code",
};

const PLATFORM_RANK: Record<TrackedProvider, number> = {
  antigravity: 0,
  codex: 1,
  claude: 2,
};

const TIER_RANK: Record<string, number> = {
  ULTRA: 0,
  ENTERPRISE: 1,
  PRO50X: 2,
  "MAX 20X": 3,
  MAX: 3,
  PRO20X: 4,
  PRE: 5,
  PRO5X: 7,
  "MAX 5X": 8,
  "PRO+": 9,
  PRO: 10,
  STD: 11,
  BUSINESS: 12,
  TEAM: 13,
  PLUS: 14,
  EDU: 15,
  GO: 16,
  API: 17,
  FREE: 18,
  OTHER: 19,
};

export const monitoredItemKey = (entry: TrackedEntry): string => `${entry.provider}:${entry.id}`;

function resolveAccountDisplay(
  entry: TrackedEntry,
  sources: MonitoredAccountSources,
): { alias: string; email: string; tier: string } {
  if (entry.provider === "antigravity") {
    const acc = sources.antigravityAccounts.find((item) => item.id === entry.id);
    const cache = sources.antigravityUsageCache[entry.id];
    return {
      alias: acc?.label || acc?.email || entry.id,
      email: acc?.email || cache?.email || "Antigravity",
      tier: classifyAntigravityTier(cache?.planTier ?? acc?.lastPlan),
    };
  }

  if (entry.provider === "codex") {
    const acc = sources.codexAccounts.find((item) => item.id === entry.id);
    const cache = sources.codexUsageCache[entry.id];
    const rawTier = cache?.planName ?? acc?.lastPlan ?? "Free";
    return {
      alias: acc?.label || acc?.email || entry.id,
      email: acc?.email || "ChatGPT",
      tier: classifyCodexTier(rawTier, acc ? isCodexAccountOAuth(acc, cache) : true),
    };
  }

  const status = sources.claudeAccountStatuses.find((item) => item.account.id === entry.id);
  const account = status?.account;
  return {
    alias: account?.profileName || account?.email || entry.id,
    email: account?.email || account?.organizationName || account?.configDir || "Claude Code",
    tier: account ? classifyClaudeTier(account.subscriptionType || account.rateLimitTier) : "OTHER",
  };
}

function resolveSingleItem(
  entry: TrackedEntry,
  sources: MonitoredAccountSources,
): MonitoredAccountItem {
  const { alias, email, tier } = resolveAccountDisplay(entry, sources);
  return {
    id: monitoredItemKey(entry),
    entry,
    platform: entry.provider,
    platformLabel: PLATFORM_LABELS[entry.provider],
    alias,
    email,
    tier,
  };
}

export function resolveMonitoredAccountItems(
  entries: TrackedEntry[],
  sources: MonitoredAccountSources,
): MonitoredAccountItem[] {
  return entries.map((entry) => resolveSingleItem(entry, sources));
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function sortMonitoredAccountItems(
  items: MonitoredAccountItem[],
  field: MonitoredSortField,
  direction: MonitoredSortDirection = "asc",
): MonitoredAccountItem[] {
  const dir = direction === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (field === "platform") {
      cmp = PLATFORM_RANK[a.platform] - PLATFORM_RANK[b.platform];
    } else if (field === "tier") {
      const rankA = TIER_RANK[a.tier.trim().toUpperCase()] ?? 99;
      const rankB = TIER_RANK[b.tier.trim().toUpperCase()] ?? 99;
      cmp = rankA - rankB || compareText(a.tier, b.tier);
    } else if (field === "email") {
      cmp = compareText(a.email, b.email);
    } else {
      cmp = compareText(a.alias, b.alias);
    }
    if (cmp !== 0) return cmp * dir;
    const tieAlias = compareText(a.alias, b.alias);
    if (tieAlias !== 0) return tieAlias * dir;
    return compareText(a.email, b.email) * dir;
  });
}
