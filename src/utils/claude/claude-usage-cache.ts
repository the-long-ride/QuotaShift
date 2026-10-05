import type { ClaudeAccountUsageStatus } from "./claude-account-types";
import type { ClaudeRateLimitWindow } from "../common/types";

/**
 * Last good Claude quota per account. `claude -p /usage` needs the usage API (some networks
 * only reach it over VPN); while it is unreachable the backend has no numbers after an app
 * restart, so the dashboard and overlay fall back to these values instead of empty bars.
 */
export const CLAUDE_USAGE_CACHE_KEY = "quotashift_claude_usage_cache_v1";
export const CLAUDE_USAGE_CACHE_MAX_AGE_SECS = 7 * 24 * 60 * 60;

interface CachedUsage {
  fiveHour: ClaudeRateLimitWindow | null;
  sevenDay: ClaudeRateLimitWindow | null;
  fetchedAt: number | null;
}

type CacheStorage = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): CacheStorage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const readCache = (storage: CacheStorage | null): Record<string, CachedUsage> => {
  try {
    const parsed = JSON.parse(storage?.getItem(CLAUDE_USAGE_CACHE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/** A cached window whose reset time has passed no longer describes current usage. */
const stillValid = (
  window: ClaudeRateLimitWindow | null | undefined,
  nowSecs: number,
): ClaudeRateLimitWindow | null =>
  window && !(typeof window.resetsAt === "number" && window.resetsAt <= nowSecs) ? window : null;

export function mergeClaudeUsageCache(
  statuses: ClaudeAccountUsageStatus[],
  storage: CacheStorage | null = defaultStorage(),
  nowSecs = Math.floor(Date.now() / 1000),
): ClaudeAccountUsageStatus[] {
  const cache = readCache(storage);
  let changed = false;
  const merged = statuses.map((status) => {
    const id = status.account.id;
    const entry = cache[id];
    const tooOld =
      typeof entry?.fetchedAt === "number" &&
      nowSecs - entry.fetchedAt > CLAUDE_USAGE_CACHE_MAX_AGE_SECS;
    const cached = entry && !tooOld ? entry : undefined;
    const fiveHour = status.fiveHour ?? stillValid(cached?.fiveHour, nowSecs);
    const sevenDay = status.sevenDay ?? stillValid(cached?.sevenDay, nowSecs);
    const usageFetchedAt = status.usageFetchedAt ?? cached?.fetchedAt ?? null;
    if (status.fiveHour || status.sevenDay) {
      cache[id] = { fiveHour, sevenDay, fetchedAt: usageFetchedAt };
      changed = true;
    }
    if ((status.fiveHour && status.sevenDay) || (!fiveHour && !sevenDay)) return status;
    return { ...status, fiveHour, sevenDay, usageFetchedAt };
  });
  if (changed) {
    try {
      storage?.setItem(CLAUDE_USAGE_CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }
  return merged;
}
