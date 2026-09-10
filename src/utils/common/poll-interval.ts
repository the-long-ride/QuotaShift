export const POLL_INTERVAL_KEY = "antigravity-poll-interval";
export const POLL_INTERVAL_LEGACY_KEY = "quotashift_poll_interval_secs";

export const DEFAULT_POLL_INTERVAL_SECS = 30;
export const MIN_POLL_INTERVAL_SECS = 5;
export const MAX_POLL_INTERVAL_SECS = 3600;

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
