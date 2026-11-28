/** Claude usage-limit reset count shown in the overlay badge (opt-in, unofficial source). */
import { formatRetryAfterTime } from "../common/ui/format-reset-count.js";

export const CLAUDE_RESET_CREDITS_ENABLED_KEY = "quotashift_claude_reset_credits_enabled_v1";
export const CLAUDE_RESET_CREDITS_CHANGED_EVENT = "quotashift:claude-reset-credits-changed";
export const CLAUDE_RESET_CREDITS_UPDATED_EVENT = "quotashift:claude-reset-credits-updated";

export type ClaudeResetCreditsStatus = "available" | "none" | "ineligible" | "unavailable";

export interface ClaudeResetGrant {
  resetsLeft: number;
  expiresAt: string | null;
}

/** Mirrors the token-free Rust `ClaudeResetCredits` returned by `get_claude_reset_credits`. */
export interface ClaudeResetCredits {
  status: ClaudeResetCreditsStatus;
  count: number | null;
  grants: ClaudeResetGrant[];
  nearestExpiresAt: string | null;
  reason: string | null;
  fetchedAt: number;
  stale?: boolean;
  retryAfterAt?: number | null;
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

const defaultStorage = (): (StorageReader & StorageWriter) | null =>
  typeof localStorage !== "undefined" ? localStorage : null;

export function loadClaudeResetCreditsEnabled(
  storage: StorageReader | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(CLAUDE_RESET_CREDITS_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveClaudeResetCreditsEnabled(
  enabled: boolean,
  storage: StorageWriter | null = defaultStorage(),
): void {
  try {
    storage?.setItem(CLAUDE_RESET_CREDITS_ENABLED_KEY, String(enabled));
  } catch {
    // Storage can be blocked; the in-memory toggle still applies for this session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CLAUDE_RESET_CREDITS_CHANGED_EVENT, { detail: enabled }));
  }
}

export const formatClaudeResetRetryAt = formatRetryAfterTime;

export function buildClaudeResetCountTooltip(credits?: ClaudeResetCredits | null): string {
  if (!credits?.stale) return "Click to see detail";
  const retryAt = formatClaudeResetRetryAt(credits.retryAfterAt);
  if (retryAt) {
    return `Cached reset count (rate limited · retries after ${retryAt})\nClick to see detail`;
  }
  return "Cached reset count (refresh temporarily rate limited)\nClick to see detail";
}

export function resetCreditsToOverlayFields(credits?: ClaudeResetCredits | null): {
  resetCount: number | null;
  resetNearestExpiresAt: string | null;
} {
  if (credits?.status !== "available" || typeof credits.count !== "number") {
    return { resetCount: null, resetNearestExpiresAt: null };
  }
  return { resetCount: credits.count, resetNearestExpiresAt: credits.nearestExpiresAt };
}
