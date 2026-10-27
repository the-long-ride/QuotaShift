import type { AntigravityModelQuota, QuotaData } from "../common/types";

type PoolQuota = AntigravityModelQuota | QuotaData;

type PoolKey = "gemini" | "claude_gpt" | "argon";

export function isArgonPoolModel(model: string | null | undefined): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return (
    lower.includes("argon") ||
    lower.includes("gemini-4") ||
    lower.includes("gemini_4") ||
    lower.includes("gemini 4")
  );
}

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

function classifyPool(quota: PoolQuota): PoolKey | null {
  const text = (
    "model" in quota
      ? quota.model
      : `${quota.modelId ?? ""} ${quota.displayName ?? ""} ${quota.family ?? ""}`
  ).toLowerCase();
  if (isArgonPoolModel(text) || ("family" in quota && quota.family === "argon")) {
    return "argon";
  }
  if (text.includes("gemini") || text.includes("imagen")) return "gemini";
  if (
    text.includes("claude") ||
    text.includes("gpt") ||
    text.includes("openai") ||
    ("family" in quota && (quota.family === "claude" || quota.family === "open_ai"))
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
  lane.allDisabled =
    lane.contributors === 1 ? disabled === true : lane.allDisabled && disabled === true;

  const shouldReplace =
    lane.percent === undefined ||
    normalized < lane.percent ||
    (normalized === lane.percent && isEarlierReset(reset, lane.reset));
  if (shouldReplace) {
    lane.percent = normalized;
    lane.reset = reset || undefined;
  }
}

function isBackendPool(quota: PoolQuota): boolean {
  if ("model" in quota) return true;
  const id = quota.modelId?.toLowerCase() ?? "";
  const name = quota.displayName?.toLowerCase() ?? "";
  return (
    id.endsWith("_pool") ||
    name === "gemini models" ||
    name === "claude and gpt models" ||
    name === "claude & openai models" ||
    name === "argon models" ||
    name === "gemini 4 argon"
  );
}

function rawQuotaSignature(quota: PoolQuota): string {
  const pct =
    quota.fiveHourPercent ??
    quota.weeklyPercent ??
    ("remainingPercent" in quota ? quota.remainingPercent : undefined) ??
    ("percent" in quota ? quota.percent : undefined);
  const reset =
    quota.fiveHourReset ??
    quota.weeklyReset ??
    ("resetAt" in quota ? quota.resetAt : undefined) ??
    ("refreshTime" in quota ? quota.refreshTime : undefined) ??
    "";
  return `${pct ?? "null"}|${reset}`;
}

function toQuotaData(key: PoolKey, pool: PoolState): QuotaData {
  const model =
    key === "gemini"
      ? "Gemini Models"
      : key === "claude_gpt"
        ? "Claude & OpenAI Models"
        : "Gemini 4 Argon";
  const fallbackPercent = pool.fiveHour.percent ?? pool.weekly.percent ?? 0;
  const refreshTime =
    key === "argon"
      ? pool.weekly.allDisabled && pool.weekly.contributors > 0
        ? "Disabled"
        : pool.weekly.reset || "Ready"
      : pool.fiveHour.allDisabled && pool.fiveHour.contributors > 0
        ? "Disabled"
        : pool.fiveHour.reset || "Ready";

  return {
    model,
    percent: fallbackPercent,
    refreshTime,
    fiveHourPercent: key === "argon" ? undefined : pool.fiveHour.percent,
    fiveHourReset: key === "argon" ? undefined : pool.fiveHour.reset,
    fiveHourDisabled:
      key !== "argon" && pool.fiveHour.contributors > 0 ? pool.fiveHour.allDisabled : undefined,
    weeklyPercent: pool.weekly.percent,
    weeklyReset: pool.weekly.reset,
    weeklyDisabled: pool.weekly.contributors > 0 ? pool.weekly.allDisabled : undefined,
  };
}

/**
 * Convert both old per-model cloud quota records and new backend pool records
 * into the same available-pool display contract. This helper never derives a
 * weekly value from the five-hour/legacy remaining percentage.
 */
export function aggregateCloudQuotasIntoPools(quotas: readonly PoolQuota[]): QuotaData[] {
  const pools: Record<PoolKey, PoolState> = {
    gemini: createPool(),
    claude_gpt: createPool(),
    argon: createPool(),
  };

  const hasDedicatedArgonPool = quotas.some(
    (q) => classifyPool(q) === "argon" && (isBackendPool(q) || q.weeklyPercent !== undefined),
  );
  const geminiSignatures = new Set(
    quotas.filter((q) => classifyPool(q) === "gemini").map(rawQuotaSignature),
  );
  const rawArgonQuotas = quotas.filter((q) => classifyPool(q) === "argon");
  const mergeArgonIntoGemini =
    !hasDedicatedArgonPool &&
    rawArgonQuotas.length > 0 &&
    geminiSignatures.size > 0 &&
    rawArgonQuotas.every((q) => geminiSignatures.has(rawQuotaSignature(q)));

  for (const quota of quotas) {
    const rawKey = classifyPool(quota);
    if (!rawKey) continue;
    const key: PoolKey = rawKey === "argon" && mergeArgonIntoGemini ? "gemini" : rawKey;
    const pool = pools[key];
    pool.seen = true;

    const pooled = isBackendPool(quota);
    if (key === "argon") {
      const weeklyPercent =
        quota.weeklyPercent ??
        (!pooled && "remainingPercent" in quota ? quota.remainingPercent : undefined);
      const weeklyReset =
        quota.weeklyReset ?? (!pooled && "resetAt" in quota ? quota.resetAt : undefined);
      considerLane(pool.weekly, weeklyPercent, weeklyReset, quota.weeklyDisabled);
      continue;
    }

    const fiveHourPercent = pooled
      ? quota.fiveHourPercent
      : (quota.fiveHourPercent ??
        ("remainingPercent" in quota ? quota.remainingPercent : undefined));
    const fiveHourReset = pooled
      ? quota.fiveHourReset
      : (quota.fiveHourReset ?? ("resetAt" in quota ? quota.resetAt : undefined));

    considerLane(pool.fiveHour, fiveHourPercent, fiveHourReset, quota.fiveHourDisabled);
    considerLane(pool.weekly, quota.weeklyPercent, quota.weeklyReset, quota.weeklyDisabled);
  }

  return (["gemini", "claude_gpt", "argon"] as const)
    .filter((key) => (key === "argon" ? pools.argon.weekly.contributors > 0 : pools[key].seen))
    .map((key) => toQuotaData(key, pools[key]));
}

/** A lone Gemini pool uses the account's plain two-window layout. */
export function isGeminiOnlyPool(labels: readonly string[]): boolean {
  return labels.length === 1 && /gemini/i.test(labels[0]) && !isArgonPoolModel(labels[0]);
}
