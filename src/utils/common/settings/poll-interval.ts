export const POLL_INTERVAL_KEY = "antigravity-poll-interval";
export const POLL_INTERVAL_LEGACY_KEY = "quotashift_poll_interval_secs";

export const DEFAULT_POLL_INTERVAL_SECS = 30;
export const MIN_POLL_INTERVAL_SECS = 5;
export const MAX_POLL_INTERVAL_SECS = 1200;

// Tracked account poll rate: 30s to 120s recommended, 5s to 20min allowed.
export const TRACKED_POLL_INTERVAL_KEY = "quotashift_tracked_poll_interval_secs";
export const TRACKED_POLL_INTERVAL_CHANGED_EVENT = "quotashift:tracked-poll-interval-changed";
export const DEFAULT_TRACKED_POLL_INTERVAL_SECS = 30;
export const MIN_TRACKED_POLL_INTERVAL_SECS = 5;
export const MAX_TRACKED_POLL_INTERVAL_SECS = 1200;

// Idle accounts poll rate: 5 to 15min recommended, 5s to 20min allowed.
export const IDLE_POLL_INTERVAL_KEY = "quotashift_idle_poll_interval_secs";
export const DEFAULT_IDLE_POLL_INTERVAL_SECS = 600;
export const MIN_IDLE_POLL_INTERVAL_SECS = 5;
export const MAX_IDLE_POLL_INTERVAL_SECS = 1200;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function sanitizePollInterval(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_POLL_INTERVAL_SECS, Math.max(MIN_POLL_INTERVAL_SECS, Math.round(value)));
  }
  if (typeof value === "string") {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_POLL_INTERVAL_SECS, Math.max(MIN_POLL_INTERVAL_SECS, parsed));
    }
  }
  return DEFAULT_POLL_INTERVAL_SECS;
}

export function sanitizeTrackedPollInterval(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(
      MAX_TRACKED_POLL_INTERVAL_SECS,
      Math.max(MIN_TRACKED_POLL_INTERVAL_SECS, Math.round(value)),
    );
  }
  if (typeof value === "string") {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.min(
        MAX_TRACKED_POLL_INTERVAL_SECS,
        Math.max(MIN_TRACKED_POLL_INTERVAL_SECS, parsed),
      );
    }
  }
  return DEFAULT_TRACKED_POLL_INTERVAL_SECS;
}

export function sanitizeIdlePollInterval(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(
      MAX_IDLE_POLL_INTERVAL_SECS,
      Math.max(MIN_IDLE_POLL_INTERVAL_SECS, Math.round(value)),
    );
  }
  if (typeof value === "string") {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_IDLE_POLL_INTERVAL_SECS, Math.max(MIN_IDLE_POLL_INTERVAL_SECS, parsed));
    }
  }
  return DEFAULT_IDLE_POLL_INTERVAL_SECS;
}

export function loadPollIntervalPreference(storage: StorageReader = localStorage): number {
  try {
    const raw = storage.getItem(POLL_INTERVAL_KEY) ?? storage.getItem(POLL_INTERVAL_LEGACY_KEY);
    if (raw === null || raw === undefined || raw === "") {
      return DEFAULT_POLL_INTERVAL_SECS;
    }
    return sanitizePollInterval(raw);
  } catch {
    return DEFAULT_POLL_INTERVAL_SECS;
  }
}

export function savePollIntervalPreference(
  interval: number,
  storage: StorageWriter = localStorage,
): void {
  try {
    const sanitized = sanitizePollInterval(interval);
    storage.setItem(POLL_INTERVAL_KEY, String(sanitized));
  } catch {}
}

export function loadTrackedPollIntervalPreference(storage: StorageReader = localStorage): number {
  try {
    const raw = storage.getItem(TRACKED_POLL_INTERVAL_KEY);
    if (raw === null || raw === undefined || raw === "") {
      return DEFAULT_TRACKED_POLL_INTERVAL_SECS;
    }
    return sanitizeTrackedPollInterval(raw);
  } catch {
    return DEFAULT_TRACKED_POLL_INTERVAL_SECS;
  }
}

export function saveTrackedPollIntervalPreference(
  interval: number,
  storage: StorageWriter = localStorage,
): void {
  try {
    const sanitized = sanitizeTrackedPollInterval(interval);
    storage.setItem(TRACKED_POLL_INTERVAL_KEY, String(sanitized));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TRACKED_POLL_INTERVAL_CHANGED_EVENT, { detail: sanitized }),
      );
    }
  } catch {}
}

export function loadIdlePollIntervalPreference(storage: StorageReader = localStorage): number {
  try {
    const raw = storage.getItem(IDLE_POLL_INTERVAL_KEY);
    if (raw === null || raw === undefined || raw === "") {
      return DEFAULT_IDLE_POLL_INTERVAL_SECS;
    }
    return sanitizeIdlePollInterval(raw);
  } catch {
    return DEFAULT_IDLE_POLL_INTERVAL_SECS;
  }
}

export function saveIdlePollIntervalPreference(
  interval: number,
  storage: StorageWriter = localStorage,
): void {
  try {
    const sanitized = sanitizeIdlePollInterval(interval);
    storage.setItem(IDLE_POLL_INTERVAL_KEY, String(sanitized));
  } catch {}
}

/** Longest a fetch may take and still count as one interval (10s, or half a short interval). */
const TRACKED_REFRESH_SLACK_MS = 10_000;

/**
 * Cache age at which a tracked account is due again. The scheduled tick fires every poll interval,
 * but a cache is stamped when its fetch finishes, so it is always a little younger than one
 * interval at the next tick. A strict "younger than the interval" check would skip every second
 * tick and refresh at half the configured rate.
 */
export function trackedCacheMaxAgeMs(secs: number): number {
  const interval = Math.max(5000, secs * 1000);
  return interval - Math.min(TRACKED_REFRESH_SLACK_MS, Math.round(interval / 2));
}
