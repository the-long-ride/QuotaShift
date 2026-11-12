import type { CliQuotaWindowKind, CliRotationPoolV1 } from "./types.js";

export interface QuotaReading {
  remaining: number;
  resetAt: number | null;
  fetchedAt: number;
}
interface QuotaEvidenceState {
  resetAt: number | null;
  samples: number[];
  lastFetchedAt: number;
  fired: boolean;
}
interface CandidateSnapshot {
  id: string;
  provider: string;
  remainingPercent: number | null;
  updatedAt: number | null;
}

const DEFAULT_MAX_AGE = 300_000;
const validPercent = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value : null;
const resetMillis = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const validAge = (fetchedAt: unknown, now: number, maxAge: number): fetchedAt is number =>
  typeof fetchedAt === "number" && Number.isFinite(fetchedAt) &&
  fetchedAt <= now && now - fetchedAt <= maxAge;

function antigravityWindow(entry: any, kind: CliQuotaWindowKind): { remaining: number; resetAt: number | null } | null {
  if (kind === "monthly" || entry.accuracy !== "exact_grouped") return null;
  const raw = Array.isArray(entry.cloudQuotas) && entry.cloudQuotas.length
    ? entry.cloudQuotas : (Array.isArray(entry.quotas) ? entry.quotas : []);
  if (!raw.length || raw.some((q: any) => q.quotaCarried)) return null;
  const field = kind === "5h" ? "fiveHourPercent" : "weeklyPercent";
  const resetField = kind === "5h" ? "fiveHourReset" : "weeklyReset";
  const disabledField = kind === "5h" ? "fiveHourDisabled" : "weeklyDisabled";
  if (raw.some((q: any) => q[disabledField] === true)) return null;
  const available = raw.map((q: any) => ({
    remaining: validPercent(q[field]), resetAt: resetMillis(q[resetField]),
  })).filter((q: any): q is { remaining: number; resetAt: number | null } => q.remaining !== null);
  if (!available.length) return null;
  // Do not rotate while *any* currently reported usable model pool has quota.
  const mostAvailable = available.reduce((a: any, b: any) => b.remaining > a.remaining ? b : a);
  return mostAvailable;
}

function codexWindow(entry: any, kind: CliQuotaWindowKind): { remaining: number; resetAt: number | null } | null {
  if (!entry.isOAuth) return null;
  const value = kind === "5h" ? entry.primary
    : kind === "weekly" ? entry.secondary : entry.monthly;
  if (!value || typeof value !== "object") return null;
  const duration = value.window_duration_mins ?? value.window_minutes ?? value.duration_minutes
    ?? (typeof value.limit_window_seconds === "number" ? value.limit_window_seconds / 60 : null);
  if (typeof duration === "number" && Number.isFinite(duration)) {
    const expected = kind === "5h" ? 300 : kind === "weekly" ? 10080 : 43200;
    if (duration < expected * 0.95 || duration > expected * 1.05) return null;
  }
  const used = validPercent(value.used_percent);
  if (used === null) return null;
  return { remaining: 100 - used, resetAt: resetMillis(value.reset_at) };
}

/** One fresh, trustworthy quota observation, or null; display caches are not evidence. */
export function observePoolQuota(
  provider: "agy" | "codex",
  entry: any,
  kind: CliQuotaWindowKind,
  now = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE,
): QuotaReading | null {
  if (!entry || entry.error || entry.loading || !validAge(entry.fetchedAt, now, maxAgeMs)) {
    return null;
  }
  const window = provider === "agy" ? antigravityWindow(entry, kind) : codexWindow(entry, kind);
  if (!window || (window.resetAt !== null && window.resetAt <= now)) return null;
  return { remaining: window.remaining, resetAt: window.resetAt, fetchedAt: entry.fetchedAt };
}

/** A repeated render/poll at the same fetchedAt never contributes another sample. */
export function recordQuotaEvidence(
  history: Map<string, QuotaEvidenceState>,
  key: string,
  reading: QuotaReading | null,
  now: number,
  requiredSamples = 2,
  minSeparationSeconds = 5,
  maxAgeMs = DEFAULT_MAX_AGE,
): boolean {
  // Rendering the intermediate loading state must not erase a valid first
  // quota sample. Two distinct successful fetch timestamps are still required.
  if (!reading) {
    const prior = history.get(key);
    if (prior && now - prior.lastFetchedAt > maxAgeMs) history.delete(key);
    return false;
  }
  if (reading.fetchedAt > now || now - reading.fetchedAt > maxAgeMs
    || (reading.resetAt !== null && reading.resetAt <= now)) {
    history.delete(key);
    return false;
  }
  if (reading.remaining !== 0) {
    history.delete(key);
    return false;
  }
  const previous = history.get(key);
  if (previous && previous.resetAt === reading.resetAt && previous.fired) return false;
  if (previous && previous.resetAt === reading.resetAt && previous.lastFetchedAt === reading.fetchedAt) {
    return false;
  }
  const gap = Math.max(5000, minSeparationSeconds * 1000);
  const samples = previous && previous.resetAt === reading.resetAt ? [...previous.samples] : [];
  if (!samples.length || reading.fetchedAt - samples[samples.length - 1] >= gap) {
    samples.push(reading.fetchedAt);
  }
  const confirmed = samples.length >= Math.max(2, requiredSamples);
  history.set(key, {
    resetAt: reading.resetAt, samples: samples.slice(-10),
    lastFetchedAt: reading.fetchedAt, fired: confirmed,
  });
  return confirmed;
}

/** Pool order wins; unknown, stale or depleted candidates are never applied. */
export function nextEligibleCandidate(
  pool: Pick<CliRotationPoolV1, "provider" | "enabled" | "autoSwitch" | "accountIds">,
  activeId: string,
  accounts: CandidateSnapshot[],
  now = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE,
): string | null {
  if (!pool.enabled || !pool.autoSwitch || pool.accountIds.length < 2) return null;
  const from = pool.accountIds.indexOf(activeId);
  if (from < 0) return null;
  const provider = pool.provider === "agy" ? "antigravity" : "codex";
  for (let offset = 1; offset < pool.accountIds.length; offset++) {
    const id = pool.accountIds[(from + offset) % pool.accountIds.length];
    const a = accounts.find((candidate) => candidate.provider === provider && candidate.id === id);
    if (a && validPercent(a.remainingPercent) !== null && a.remainingPercent! > 0
      && validAge(a.updatedAt, now, maxAgeMs)) return id;
  }
  return null;
}
