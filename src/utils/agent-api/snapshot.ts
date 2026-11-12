import type { AntigravityAccount, CodexAccount, AntigravityUsageCacheEntry, QuotaData } from "../common/types";
import { aggregateCloudQuotasIntoPools } from "../antigravity/quota/antigravity-quota";
import { loadCliRotationBindings, loadCliRotationPools } from "../common/backup/app-storage";

export interface AgentAccountUsage {
  id: string;
  provider: "antigravity" | "codex";
  remainingPercent: number | null;
  usedPercent: number | null;
  resetAt: string | null;
  updatedAt: number | null;
}
export interface AgentPoolUsage {
  id: string;
  provider: "antigravity" | "codex";
  accountIds: string[];
  enabled: boolean;
  active: boolean;
}
export interface AgentApiSnapshot {
  accounts: AgentAccountUsage[];
  pools: AgentPoolUsage[];
  activeAntigravityId: string | null;
  activeCodexId: string | null;
}
const percent = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value))) : null;
function quotaValues(values: QuotaData[]): { value: number | null; reset: string | null } {
  const entries = values.flatMap((q) =>
    [
      { value: percent(q.fiveHourPercent), reset: q.fiveHourReset || null },
      { value: percent(q.weeklyPercent), reset: q.weeklyReset || null },
    ].filter((item): item is { value: number; reset: string | null } => item.value !== null),
  );
  const mostLimited = entries.sort((a, b) => a.value - b.value)[0];
  return { value: mostLimited?.value ?? null, reset: mostLimited?.reset ?? null };
}
function antigravityQuota(
  account: AntigravityAccount, entry?: AntigravityUsageCacheEntry,
): Pick<AgentAccountUsage, "remainingPercent" | "usedPercent" | "resetAt" | "updatedAt"> {
  // Historical zero values are for display only, never fresh evidence for rotation.
  const reported = entry?.cloudQuotas ?? account.cloudQuotas ?? [];
  const cloud = reported.filter((pool) => !pool.quotaCarried);
  const values = entry?.quotas ??
    (reported.length ? aggregateCloudQuotasIntoPools(cloud) : account.quotas ?? []);
  const quota = quotaValues(values);
  return {
    remainingPercent: quota.value,
    usedPercent: quota.value === null ? null : 100 - quota.value,
    resetAt: quota.reset,
    updatedAt: entry?.fetchedAt ?? account.lastQuotaFetchedAt ?? null,
  };
}
function codexQuota(
  entry: any,
): Pick<AgentAccountUsage, "remainingPercent" | "usedPercent" | "resetAt" | "updatedAt"> {
  const windows = [entry?.primary, entry?.secondary, entry?.monthly]
    .filter((value) => value && typeof value === "object");
  const mostUsed = windows.map((window: any) => ({
    used: percent(window.used_percent),
    reset: typeof window.reset_at === "number"
      ? new Date(window.reset_at * 1000).toISOString() : null,
  })).filter((w): w is { used: number; reset: string | null } => w.used !== null)
    .sort((a, b) => b.used - a.used)[0];
  return {
    remainingPercent: mostUsed ? 100 - mostUsed.used : null,
    usedPercent: mostUsed?.used ?? null,
    resetAt: mostUsed?.reset ?? null,
    updatedAt: typeof entry?.fetchedAt === "number" ? entry.fetchedAt : null,
  };
}
/** Never include account objects: they contain credentials, emails and aliases. */
export function buildAgentApiSnapshot(
  antigravity: AntigravityAccount[], codex: CodexAccount[],
  agCache: Record<string, AntigravityUsageCacheEntry>,
  cxCache: Record<string, any>,
  activeAntigravityId: string | null, activeCodexId: string | null,
): AgentApiSnapshot {
  const known = [
    ...antigravity.map((a) => ({
      id: a.id, provider: "antigravity" as const, ...antigravityQuota(a, agCache[a.id]),
    })),
    ...codex.map((a) => ({
      id: a.id, provider: "codex" as const, ...codexQuota(cxCache[a.id]),
    })),
  ];
  const saved = new Set(known.map((a) => `${a.provider}:${a.id}`));
  const rawPools = loadCliRotationPools();
  const bindings = loadCliRotationBindings(rawPools);
  const pools: AgentPoolUsage[] = rawPools.filter((p) => p.enabled).map((p) => ({
    id: p.id, provider: p.provider === "agy" ? "antigravity" : "codex",
    accountIds: p.accountIds.filter((id) =>
      saved.has(`${p.provider === "agy" ? "antigravity" : "codex"}:${id}`)),
    enabled: p.enabled,
    active: (p.provider === "agy" ? bindings.agyActivePoolId : bindings.codexActivePoolId) === p.id,
  }));
  return { accounts: known, pools, activeAntigravityId, activeCodexId };
}
