import type { CodexAccount } from "../../src/utils/common/types";
import type { CodexResetCreditsData } from "../../src/utils/codex/codex-reset-credits";
import type { DemoCodexUsageCacheEntry } from "./demo-codex";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const isoAt = (now: number, offsetMs: number): string => new Date(now + offsetMs).toISOString();

export function buildCodexResetCredits(
  now: number,
  idPrefix: string,
  count: number,
): CodexResetCreditsData {
  const credits = Array.from({ length: count }, (_, idx) => ({
    id: `${idPrefix}-reset-${idx + 1}`,
    reset_type: "rate_limit_reset",
    is_supported_by_plan: true,
    status: "available",
    granted_at: isoAt(now, -(idx + 3) * DAY_MS),
    expires_at: isoAt(now, (idx + 1) * 9 * DAY_MS + 4 * HOUR_MS),
    redeem_started_at: null,
    redeemed_at: null,
    title: "5-hour & weekly quota reset",
    description: "Instantly resets active Codex rate-limit windows.",
  }));
  return {
    available_count: count,
    total_earned_count: count,
    credits,
    immediate_reset_purchase_eligible: false,
    history_enabled: true,
  };
}

export function pickBestCodexAccount(
  accounts: CodexAccount[],
  usageCache: Record<string, DemoCodexUsageCacheEntry>,
): CodexAccount | null {
  let best: CodexAccount | null = null;
  let bestRemaining = -1;
  for (const acc of accounts) {
    const rl = usageCache[acc.id]?.rate_limit;
    const rem5h = 100 - (rl?.primary_window.used_percent ?? 100);
    const remWk = 100 - (rl?.secondary_window.used_percent ?? 100);
    const score = rem5h * 0.65 + remWk * 0.35;
    if (score > bestRemaining) {
      bestRemaining = score;
      best = acc;
    }
  }
  return best;
}

export function nudgeCodexCacheEntry(
  entry: DemoCodexUsageCacheEntry,
  now: number = Date.now(),
): DemoCodexUsageCacheEntry {
  const clamp = (v: number) => Math.max(0, Math.min(98, v));
  return {
    ...entry,
    loading: false,
    fetchedAt: now,
    rate_limit: {
      ...entry.rate_limit,
      primary_window: {
        ...entry.rate_limit.primary_window,
        used_percent: clamp(entry.rate_limit.primary_window.used_percent + 2),
      },
      secondary_window: {
        ...entry.rate_limit.secondary_window,
        used_percent: clamp(entry.rate_limit.secondary_window.used_percent + 1),
      },
    },
  };
}

export function refreshAllCodexCache(
  usageCache: Record<string, DemoCodexUsageCacheEntry>,
  now: number = Date.now(),
): Record<string, DemoCodexUsageCacheEntry> {
  return Object.fromEntries(
    Object.entries(usageCache).map(([id, entry]) => [id, nudgeCodexCacheEntry(entry, now)]),
  );
}
