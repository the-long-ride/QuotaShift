import type {
  AntigravityAccount,
  AntigravityModelQuota,
  AntigravityUsageCacheEntry,
  FullStatus,
  LocalAntigravitySession,
} from "../../src/utils/common/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_MS = 60 * 1000;

const isoFromNow = (now: number, offsetMs: number): string =>
  new Date(now + offsetMs).toISOString();

function buildCloudQuotas(
  now: number,
  spec: {
    gemini5h: number;
    geminiWk: number;
    claude5h: number;
    claudeWk: number;
    fiveHourOffsetMs: number;
    weeklyOffsetMs: number;
  },
): AntigravityModelQuota[] {
  const fiveReset = isoFromNow(now, spec.fiveHourOffsetMs);
  const weekReset = isoFromNow(now, spec.weeklyOffsetMs);
  return [
    {
      modelId: "gemini-3.1-pro",
      displayName: "Gemini 3.1 Pro",
      family: "gemini",
      remainingFraction: spec.gemini5h / 100,
      remainingPercent: spec.gemini5h,
      resetAt: fiveReset,
      fiveHourPercent: spec.gemini5h,
      fiveHourReset: fiveReset,
      weeklyPercent: spec.geminiWk,
      weeklyReset: weekReset,
    },
    {
      modelId: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      family: "claude",
      remainingFraction: spec.claude5h / 100,
      remainingPercent: spec.claude5h,
      resetAt: fiveReset,
      fiveHourPercent: spec.claude5h,
      fiveHourReset: fiveReset,
      weeklyPercent: spec.claudeWk,
      weeklyReset: weekReset,
    },
  ];
}

export function createInitialAntigravityState(now: number = Date.now()): {
  accounts: AntigravityAccount[];
  usageCache: Record<string, AntigravityUsageCacheEntry>;
  localSession: LocalAntigravitySession;
  lastFullStatus: FullStatus;
} {
  const studioQuotas = buildCloudQuotas(now, {
    gemini5h: 86,
    geminiWk: 74,
    claude5h: 64,
    claudeWk: 58,
    fiveHourOffsetMs: 3.4 * HOUR_MS,
    weeklyOffsetMs: 4.5 * DAY_MS,
  });
  const personalQuotas = buildCloudQuotas(now, {
    gemini5h: 44,
    geminiWk: 38,
    claude5h: 28,
    claudeWk: 45,
    fiveHourOffsetMs: 1.8 * HOUR_MS,
    weeklyOffsetMs: 2.2 * DAY_MS,
  });
  const backupQuotas = buildCloudQuotas(now, {
    gemini5h: 96,
    geminiWk: 92,
    claude5h: 94,
    claudeWk: 89,
    fiveHourOffsetMs: 4.7 * HOUR_MS,
    weeklyOffsetMs: 6.1 * DAY_MS,
  });

  const accounts: AntigravityAccount[] = [
    {
      id: "ag-studio-ultra",
      label: "Studio Ultra",
      token: "demo-ag-token-studio",
      lastPlan: "Google AI Ultra",
      lastBalance: "$42.50",
      cloudQuotas: studioQuotas,
      email: "studio@acme-labs.dev",
      lastUsedAt: now - 3 * MIN_MS,
      lastQuotaFetchedAt: now - 25_000,
      authMethod: "oauth",
      authSource: "browser_oauth",
    },
    {
      id: "ag-personal-pro",
      label: "Personal Pro",
      token: "demo-ag-token-personal",
      lastPlan: "Google AI Pro",
      lastBalance: "$15.00",
      cloudQuotas: personalQuotas,
      email: "alex.rivera@gmail.com",
      lastUsedAt: now - 48 * MIN_MS,
      lastQuotaFetchedAt: now - 40_000,
      authMethod: "oauth",
      authSource: "browser_oauth",
    },
    {
      id: "ag-backup-ultra",
      label: "Backup Ultra",
      token: "demo-ag-token-backup",
      lastPlan: "Google AI Ultra",
      lastBalance: "$88.00",
      cloudQuotas: backupQuotas,
      email: "ops-backup@acme-labs.dev",
      lastUsedAt: now - 6 * HOUR_MS,
      lastQuotaFetchedAt: now - 50_000,
      authMethod: "oauth",
      authSource: "native_capture",
    },
  ];

  const usageCache: Record<string, AntigravityUsageCacheEntry> = {
    "ag-studio-ultra": {
      loading: false,
      exactState: "exact",
      cloudQuotas: studioQuotas,
      planTier: "Google AI Ultra",
      email: "studio@acme-labs.dev",
      credits: { balance: 42.5, creditType: "USD" },
      source: "exact",
      accuracy: "exact_grouped",
      fetchedAt: now - 25_000,
      lastExactFetchedAt: now - 25_000,
    },
    "ag-personal-pro": {
      loading: false,
      exactState: "exact",
      cloudQuotas: personalQuotas,
      planTier: "Google AI Pro",
      email: "alex.rivera@gmail.com",
      credits: { balance: 15.0, creditType: "USD" },
      source: "exact",
      accuracy: "exact_grouped",
      fetchedAt: now - 40_000,
      lastExactFetchedAt: now - 40_000,
    },
    "ag-backup-ultra": {
      loading: false,
      exactState: "exact",
      cloudQuotas: backupQuotas,
      planTier: "Google AI Ultra",
      email: "ops-backup@acme-labs.dev",
      credits: { balance: 88.0, creditType: "USD" },
      source: "exact",
      accuracy: "exact_grouped",
      fetchedAt: now - 50_000,
      lastExactFetchedAt: now - 50_000,
    },
  };

  const localSession: LocalAntigravitySession = {
    email: "studio@acme-labs.dev",
    planTier: "Google AI Ultra",
    credits: { balance: 42.5, creditType: "USD" },
    quotas: [],
    source: "app_local",
    accuracy: "exact_grouped",
    online: true,
    lastSeenAt: now - 15_000,
  };

  const lastFullStatus: FullStatus = {
    credits: { balance: 42.5, creditType: "USD" },
    quotas: [],
    planTier: "Google AI Ultra",
    recentlyUsedModel: "gemini-3.1-pro",
    monitoredCodex: null,
    email: "studio@acme-labs.dev",
    online: true,
    source: "app_local",
    accuracy: "exact_grouped",
  };

  return { accounts, usageCache, localSession, lastFullStatus };
}

const initial = createInitialAntigravityState();

export const INITIAL_ANTIGRAVITY_ACCOUNTS: AntigravityAccount[] = initial.accounts;
export const INITIAL_ANTIGRAVITY_USAGE_CACHE: Record<string, AntigravityUsageCacheEntry> =
  initial.usageCache;
export const DEMO_LOCAL_ANTIGRAVITY_SESSION: LocalAntigravitySession = initial.localSession;
export const DEMO_LAST_FULL_STATUS: FullStatus = initial.lastFullStatus;

export function pickBestAntigravityAccount(
  accounts: AntigravityAccount[],
  usageCache: Record<string, AntigravityUsageCacheEntry>,
): AntigravityAccount | null {
  let best: AntigravityAccount | null = null;
  let bestScore = -1;
  for (const acc of accounts) {
    const quotas = usageCache[acc.id]?.cloudQuotas ?? acc.cloudQuotas ?? [];
    const vals = quotas.map((q) => q.fiveHourPercent ?? q.weeklyPercent ?? q.remainingPercent);
    const score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = acc;
    }
  }
  return best;
}

export function nudgeAntigravityCacheEntry(
  entry: AntigravityUsageCacheEntry | undefined,
  now: number = Date.now(),
): AntigravityUsageCacheEntry {
  const clamp = (v: number) => Math.max(5, Math.min(100, v));
  const cloudQuotas = (entry?.cloudQuotas ?? []).map((q) => {
    const delta = q.family === "claude" ? -2 : 1;
    const next5h = q.fiveHourPercent != null ? clamp(q.fiveHourPercent + delta) : q.fiveHourPercent;
    const nextWk = q.weeklyPercent != null ? clamp(q.weeklyPercent + delta) : q.weeklyPercent;
    const nextRem = clamp((next5h ?? nextWk ?? q.remainingPercent) as number);
    return {
      ...q,
      remainingPercent: nextRem,
      remainingFraction: nextRem / 100,
      fiveHourPercent: next5h,
      weeklyPercent: nextWk,
    };
  });
  return {
    ...entry,
    loading: false,
    exactState: "exact",
    cloudQuotas,
    fetchedAt: now,
    lastExactFetchedAt: now,
  };
}

export function refreshAllAntigravityCache(
  usageCache: Record<string, AntigravityUsageCacheEntry>,
  now: number = Date.now(),
): Record<string, AntigravityUsageCacheEntry> {
  return Object.fromEntries(
    Object.entries(usageCache).map(([id, entry]) => [id, nudgeAntigravityCacheEntry(entry, now)]),
  );
}

export function renameById<T extends { id: string; label: string }>(
  items: T[],
  id: string,
  rawLabel: string,
): T[] {
  const label = rawLabel.trim();
  return label ? items.map((item) => (item.id === id ? { ...item, label } : item)) : items;
}
