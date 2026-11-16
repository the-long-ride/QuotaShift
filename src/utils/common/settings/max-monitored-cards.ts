export const MAX_MONITORED_CARDS_KEY = "quotashift_max_monitored_cards_v1";
export const MAX_MONITORED_CARDS_EVENT = "quotashift:max-monitored-cards-changed";
export const MAX_MONITORED_CARDS_TAURI_EVENT = "max-monitored-cards-changed";

export const MAX_MONITORED_CARDS_DEFAULT = 3;
export const MAX_MONITORED_CARDS_MIN = 1;
export const MAX_MONITORED_CARDS_MAX = 20;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function normalizeMaxMonitoredCards(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return MAX_MONITORED_CARDS_DEFAULT;
  return Math.max(MAX_MONITORED_CARDS_MIN, Math.min(MAX_MONITORED_CARDS_MAX, Math.round(num)));
}

export function loadMaxMonitoredCards(storage: StorageLike | null = defaultStorage()): number {
  try {
    const raw = storage?.getItem(MAX_MONITORED_CARDS_KEY);
    if (raw == null || raw.trim() === "") return MAX_MONITORED_CARDS_DEFAULT;
    return normalizeMaxMonitoredCards(raw);
  } catch {
    return MAX_MONITORED_CARDS_DEFAULT;
  }
}

export function saveMaxMonitoredCards(
  value: unknown,
  storage: StorageLike | null = defaultStorage(),
): number {
  const normalized = normalizeMaxMonitoredCards(value);
  try {
    storage?.setItem(MAX_MONITORED_CARDS_KEY, String(normalized));
  } catch {}
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(MAX_MONITORED_CARDS_EVENT, { detail: normalized }));
    }
  } catch {}
  return normalized;
}
