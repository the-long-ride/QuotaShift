import type { AntigravityModelQuota } from "../common/types";

const resetsLater = (reset: string | null | undefined, now: number): boolean => {
  const time = reset ? Date.parse(reset) : Number.NaN;
  return Number.isFinite(time) && time > now;
};

/**
 * A refresh that could not read a lane (the quota summary failed and only the model catalog
 * answered) keeps the previous value for that lane until its reset time passes.
 */
export function carryForwardQuotaLanes(
  previous: readonly AntigravityModelQuota[] | null | undefined,
  next: AntigravityModelQuota[],
  now = Date.now(),
): AntigravityModelQuota[] {
  if (!previous?.length) return next;
  return next.map((pool) => {
    const prior = previous.find((candidate) => candidate.modelId === pool.modelId);
    if (!prior) return pool;
    const carried = { ...pool };
    if (
      pool.fiveHourPercent == null &&
      prior.fiveHourPercent != null &&
      resetsLater(prior.fiveHourReset, now)
    ) {
      carried.fiveHourPercent = prior.fiveHourPercent;
      carried.fiveHourReset = prior.fiveHourReset;
      carried.fiveHourDisabled = prior.fiveHourDisabled;
    }
    if (
      pool.weeklyPercent == null &&
      prior.weeklyPercent != null &&
      resetsLater(prior.weeklyReset, now)
    ) {
      carried.weeklyPercent = prior.weeklyPercent;
      carried.weeklyReset = prior.weeklyReset;
      carried.weeklyDisabled = prior.weeklyDisabled;
    }
    return carried;
  });
}
