import type { AntigravityModelQuota } from "../../common/types";

const resetStillValid = (reset: string | null | undefined, now: number): boolean => {
  const at = reset ? Date.parse(reset) : Number.NaN;
  return Number.isFinite(at) && at > now;
};
const carryable = (percent: number | null | undefined, reset: string | null | undefined, now: number) =>
  percent != null && (resetStillValid(reset, now) || (percent === 0 && !reset));
const isArgonName = (value: string | null | undefined) =>
  Boolean(value && /argon|gemini[ _-]?4/i.test(value));
const argon = (pool: AntigravityModelQuota) =>
  pool.family === "argon" || isArgonName(pool.modelId) || isArgonName(pool.displayName);

/** Preserve a proven depleted Argon pool when a quota API response omits it.
 * A future reset bounds the cache lifetime; fresh explicit values always win.
 * Missing quota is not new evidence of exhaustion for automatic rotation.
 */
export function carryForwardQuotaLanes(
  previous: readonly AntigravityModelQuota[] | null | undefined,
  next: AntigravityModelQuota[],
  now = Date.now(),
): AntigravityModelQuota[] {
  if (!previous?.length) return next;
  const result = next.map((pool) => {
    const prior = previous.find((item) => item.modelId === pool.modelId);
    if (!prior) return pool;
    const carried = { ...pool };
    if (pool.fiveHourPercent == null && carryable(prior.fiveHourPercent, prior.fiveHourReset, now)) {
      carried.fiveHourPercent = prior.fiveHourPercent;
      carried.fiveHourReset = prior.fiveHourReset;
      carried.fiveHourDisabled = prior.fiveHourDisabled;
      carried.quotaCarried = true;
    }
    if (pool.weeklyPercent == null && carryable(prior.weeklyPercent, prior.weeklyReset, now)) {
      carried.weeklyPercent = prior.weeklyPercent;
      carried.weeklyReset = prior.weeklyReset;
      carried.weeklyDisabled = prior.weeklyDisabled;
      carried.quotaCarried = true;
    }
    return carried;
  });
  for (const prior of previous) {
    if (!argon(prior) || result.some((item) => item.modelId === prior.modelId)) continue;
    if (prior.weeklyPercent !== 0 || !carryable(prior.weeklyPercent, prior.weeklyReset, now)) continue;
    result.push({ ...prior, quotaCarried: true });
  }
  return result;
}
