export const GITHUB_REPO_URL = "https://github.com/the-long-ride/QuotaShift";
export const GITHUB_DONATE_URL = "https://github.com/the-long-ride#donate";
export const GITHUB_REPO_API_URL = "https://api.github.com/repos/the-long-ride/QuotaShift";

export const SUPPORT_PROMPT_STORAGE_KEY = "quotashift_support_prompt_v1";
export const STAR_COUNT_CACHE_KEY = "quotashift_github_star_count_v1";

export const FIRST_USE_DELAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const STAR_COUNT_CACHE_TTL_MS = 60 * 60 * 1000;

export interface SupportPromptState {
  firstSeenAt: number;
  lastShownAt: number | null;
  dontShowAgain: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | undefined {
  return typeof localStorage !== "undefined" ? localStorage : undefined;
}

export function saveSupportPromptState(
  state: SupportPromptState,
  storage: StorageLike | undefined = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SUPPORT_PROMPT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

export function loadSupportPromptState(
  storage: StorageLike | undefined = defaultStorage(),
  now = Date.now(),
): SupportPromptState {
  try {
    const raw = storage?.getItem(SUPPORT_PROMPT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupportPromptState>;
      const firstSeenAt =
        typeof parsed.firstSeenAt === "number" && Number.isFinite(parsed.firstSeenAt)
          ? parsed.firstSeenAt
          : now;
      const lastShownAt =
        typeof parsed.lastShownAt === "number" && Number.isFinite(parsed.lastShownAt)
          ? parsed.lastShownAt
          : null;
      return {
        firstSeenAt,
        lastShownAt,
        dontShowAgain: parsed.dontShowAgain === true,
      };
    }
  } catch {
    // Reset malformed payload below.
  }
  const initial: SupportPromptState = {
    firstSeenAt: now,
    lastShownAt: null,
    dontShowAgain: false,
  };
  saveSupportPromptState(initial, storage);
  return initial;
}

export function shouldShowSupportPrompt(state: SupportPromptState, now = Date.now()): boolean {
  if (state.dontShowAgain) return false;
  if (state.lastShownAt === null) {
    return now - state.firstSeenAt >= FIRST_USE_DELAY_MS;
  }
  return now - state.lastShownAt >= REMIND_INTERVAL_MS;
}

export function msUntilNextSupportPrompt(
  state: SupportPromptState,
  now = Date.now(),
): number | null {
  if (state.dontShowAgain) return null;
  const targetAt =
    state.lastShownAt === null
      ? state.firstSeenAt + FIRST_USE_DELAY_MS
      : state.lastShownAt + REMIND_INTERVAL_MS;
  return Math.max(0, targetAt - now);
}

export function markSupportPromptShown(
  now = Date.now(),
  dontShowAgain?: boolean,
  storage: StorageLike | undefined = defaultStorage(),
): SupportPromptState {
  const current = loadSupportPromptState(storage, now);
  const next: SupportPromptState = {
    firstSeenAt: current.firstSeenAt,
    lastShownAt: now,
    dontShowAgain: dontShowAgain !== undefined ? dontShowAgain : current.dontShowAgain,
  };
  saveSupportPromptState(next, storage);
  return next;
}

export function setSupportPromptDontShowAgain(
  dontShowAgain: boolean,
  now = Date.now(),
  storage: StorageLike | undefined = defaultStorage(),
): SupportPromptState {
  const current = loadSupportPromptState(storage, now);
  const next: SupportPromptState = { ...current, dontShowAgain };
  saveSupportPromptState(next, storage);
  return next;
}

export function formatStarCount(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
    return null;
  }
  return String(Math.floor(count));
}

export function loadCachedStarCount(
  storage: StorageLike | undefined = defaultStorage(),
  now = Date.now(),
): { count: number; isFresh: boolean } | null {
  try {
    const raw = storage?.getItem(STAR_COUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { count?: unknown; fetchedAt?: unknown };
    if (
      typeof parsed.count !== "number" ||
      !Number.isFinite(parsed.count) ||
      parsed.count < 0 ||
      typeof parsed.fetchedAt !== "number" ||
      !Number.isFinite(parsed.fetchedAt)
    ) {
      return null;
    }
    return {
      count: Math.floor(parsed.count),
      isFresh: now - parsed.fetchedAt < STAR_COUNT_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function saveCachedStarCount(
  count: number,
  storage: StorageLike | undefined = defaultStorage(),
  now = Date.now(),
): void {
  if (!storage || !Number.isFinite(count) || count < 0) return;
  try {
    storage.setItem(
      STAR_COUNT_CACHE_KEY,
      JSON.stringify({ count: Math.floor(count), fetchedAt: now }),
    );
  } catch {
    // Ignore storage quota errors.
  }
}
