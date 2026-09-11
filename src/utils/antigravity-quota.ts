import type { AntigravityModelQuota, QuotaData } from "./types";

type PoolKey = "gemini" | "claude_gpt";

type LaneState = {
  percent?: number;
  reset?: string;
  contributors: number;
  allDisabled: boolean;
};

type PoolState = {
  seen: boolean;
  fiveHour: LaneState;
  weekly: LaneState;
};

const createLane = (): LaneState => ({ contributors: 0, allDisabled: true });
const createPool = (): PoolState => ({ seen: false, fiveHour: createLane(), weekly: createLane() });

function classifyPool(quota: AntigravityModelQuota): PoolKey | null {
  const text = `${quota.modelId ?? ""} ${quota.displayName ?? ""} ${quota.family ?? ""}`.toLowerCase();
  if (text.includes("gemini") || text.includes("imagen")) return "gemini";
  if (
    text.includes("claude") ||
    text.includes("gpt") ||
    text.includes("openai") ||
    quota.family === "claude" ||
    quota.family === "open_ai"
  ) {
    return "claude_gpt";
  }
  return null;
}

function isEarlierReset(candidate?: string | null, existing?: string): boolean {
  if (!candidate) return false;
  if (!existing) return true;
  const candidateTime = Date.parse(candidate);
  const existingTime = Date.parse(existing);
  if (Number.isFinite(candidateTime) && Number.isFinite(existingTime)) {
    return candidateTime < existingTime;
  }
  return candidate < existing;
}

function considerLane(
  lane: LaneState,
  percent: number | null | undefined,
  reset: string | null | undefined,
  disabled: boolean | null | undefined,
): void {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return;
  const normalized = Math.min(100, Math.max(0, Math.round(percent)));
  lane.contributors += 1;
  lane.allDisabled = lane.contributors === 1 ? disabled === true : lane.allDisabled && disabled === true;

  const shouldReplace =
    lane.percent === undefined ||
    normalized < lane.percent ||
    (normalized === lane.percent && isEarlierReset(reset, lane.reset));
  if (shouldReplace) {
    lane.percent = normalized;
    lane.reset = reset || undefined;
  }
}

function isBackendPool(quota: AntigravityModelQuota): boolean {
  const id = quota.modelId?.toLowerCase() ?? "";
  const name = quota.displayName?.toLowerCase() ?? "";
  return id.endsWith("_pool") || name === "gemini models" || name === "claude and gpt models";
}

function toQuotaData(key: PoolKey, pool: PoolState): QuotaData {
  const model = key === "gemini" ? "Gemini Models" : "Claude and GPT Models";
  const fallbackPercent = pool.fiveHour.percent ?? pool.weekly.percent ?? 0;
  const refreshTime = pool.fiveHour.allDisabled && pool.fiveHour.contributors > 0
    ? "Disabled"
    : pool.fiveHour.reset || "Ready";

  return {
    model,
    percent: fallbackPercent,
    refreshTime,
    fiveHourPercent: pool.fiveHour.percent,
    fiveHourReset: pool.fiveHour.reset,
    fiveHourDisabled: pool.fiveHour.contributors > 0 ? pool.fiveHour.allDisabled : undefined,
    weeklyPercent: pool.weekly.percent,
    weeklyReset: pool.weekly.reset,
    weeklyDisabled: pool.weekly.contributors > 0 ? pool.weekly.allDisabled : undefined,
  };
}

/**
 * Convert both old per-model cloud quota records and new backend pool records
 * into the same fixed two-pool display contract. This helper never derives a
 * weekly value from the five-hour/legacy remaining percentage.
 */
export function aggregateCloudQuotasIntoPools(
  quotas: AntigravityModelQuota[],
): QuotaData[] {
  const pools: Record<PoolKey, PoolState> = {
    gemini: createPool(),
    claude_gpt: createPool(),
  };

  for (const quota of quotas) {
    const key = classifyPool(quota);
    if (!key) continue;
    const pool = pools[key];
    pool.seen = true;

    const pooled = isBackendPool(quota);
    const fiveHourPercent = pooled
      ? quota.fiveHourPercent
      : (quota.fiveHourPercent ?? quota.remainingPercent);
    const fiveHourReset = pooled
      ? quota.fiveHourReset
      : (quota.fiveHourReset ?? quota.resetAt);

    considerLane(pool.fiveHour, fiveHourPercent, fiveHourReset, quota.fiveHourDisabled);
    considerLane(pool.weekly, quota.weeklyPercent, quota.weeklyReset, quota.weeklyDisabled);
  }

  return (["gemini", "claude_gpt"] as const)
    .filter((key) => pools[key].seen)
    .map((key) => toQuotaData(key, pools[key]));
}
