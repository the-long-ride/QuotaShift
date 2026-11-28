import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CLAUDE_RESET_CREDITS_CHANGED_EVENT,
  CLAUDE_RESET_CREDITS_ENABLED_KEY,
  CLAUDE_RESET_CREDITS_UPDATED_EVENT,
  loadClaudeResetCreditsEnabled,
  type ClaudeResetCredits,
} from "../../utils/claude/claude-reset-credits";
import type { ClaudeAccountUsageStatus } from "../../utils/claude/claude-account-types";
import { isQuotaPollingEnabled } from "../../utils/common/accounts/quota-polling";
import { logFrontend } from "../../utils/common/logger";

/** Frontend cadence; mirrors the 3-hour persistent backend cache TTL per account. */
export const RESET_CREDITS_POLL_MS = 3 * 60 * 60 * 1000;
const RESET_SWEEP_STAGGER_MIN_MS = 2500;
const RESET_SWEEP_JITTER_MS = 600;

type TrackedProvider = "antigravity" | "codex" | "claude";

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isValidCountStatus(status?: string): boolean {
  return status === "available" || status === "none";
}

/**
 * Remaining Claude resets are fetched only while the user setting is enabled.
 * Only real authenticated (non `claude-local`) accounts are queried.
 */
export function useClaudeResetCredits(
  trackedProvider: TrackedProvider,
  trackedAccountId: string | null,
  accountStatuses: ClaudeAccountUsageStatus[],
) {
  const [enabled, setEnabled] = useState(() => loadClaudeResetCreditsEnabled());
  const [resultsByAccountId, setResultsByAccountId] = useState<Record<string, ClaudeResetCredits>>(
    {},
  );
  const accountStatusesRef = useRef(accountStatuses);
  accountStatusesRef.current = accountStatuses;
  const configDirsRef = useRef(accountStatuses.map((status) => status.account.configDir));
  configDirsRef.current = accountStatuses.map((status) => status.account.configDir);
  const accountStatusesKey = accountStatuses
    .map(
      (status) =>
        `${status.account.id}:${status.account.configDir}:${status.account.authenticated !== false ? "1" : "0"}`,
    )
    .sort()
    .join("|");
  const accountId =
    trackedProvider === "claude" && trackedAccountId && trackedAccountId !== "claude-local"
      ? trackedAccountId
      : null;

  useEffect(() => {
    const sync = () => setEnabled(loadClaudeResetCreditsEnabled());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CLAUDE_RESET_CREDITS_ENABLED_KEY) sync();
    };
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string; credits?: ClaudeResetCredits }>)
        .detail;
      if (!detail?.accountId || !detail.credits) return;
      setResultsByAccountId((previous) => ({
        ...previous,
        [detail.accountId!]: detail.credits!,
      }));
    };
    window.addEventListener(CLAUDE_RESET_CREDITS_CHANGED_EVENT, sync);
    window.addEventListener(CLAUDE_RESET_CREDITS_UPDATED_EVENT, handleUpdated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CLAUDE_RESET_CREDITS_CHANGED_EVENT, sync);
      window.removeEventListener(CLAUDE_RESET_CREDITS_UPDATED_EVENT, handleUpdated);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const refreshResetCredits = useCallback(
    async (force = false, targetAccountId?: string): Promise<ClaudeResetCredits | null> => {
      if (!loadClaudeResetCreditsEnabled()) return null;
      const requestedAccountId = targetAccountId;
      if (!requestedAccountId || requestedAccountId === "claude-local") return null;
      const target = accountStatusesRef.current.find(
        (status) => status.account.id === requestedAccountId,
      );
      if (!target || target.account.authenticated === false) {
        return null;
      }
      try {
        const credits = await invoke<ClaudeResetCredits>("get_claude_reset_credits", {
          accountId: requestedAccountId,
          extraConfigDirs: configDirsRef.current,
          force,
        });
        if (
          !accountStatusesRef.current.some((status) => status.account.id === requestedAccountId)
        ) {
          return null;
        }
        if (!loadClaudeResetCreditsEnabled()) return null;
        setResultsByAccountId((previous) => {
          const existing = previous[requestedAccountId];
          if (
            !isValidCountStatus(credits.status) &&
            existing &&
            isValidCountStatus(existing.status) &&
            credits.reason === "http_429"
          ) {
            return {
              ...previous,
              [requestedAccountId]: {
                ...existing,
                stale: true,
                retryAfterAt: credits.retryAfterAt ?? existing.retryAfterAt ?? null,
              },
            };
          }
          return { ...previous, [requestedAccountId]: credits };
        });
        return credits;
      } catch (error) {
        logFrontend("WARN", "claude:resets", "Reset count request failed", String(error));
        setResultsByAccountId((previous) => {
          const existing = previous[requestedAccountId];
          if (!existing) return previous;
          if (isValidCountStatus(existing.status)) {
            return { ...previous, [requestedAccountId]: { ...existing, stale: true } };
          }
          const next = { ...previous };
          delete next[requestedAccountId];
          return next;
        });
        return null;
      }
    },
    [accountStatusesKey],
  );

  useEffect(() => {
    const realAccountIds = new Set(
      accountStatusesRef.current
        .filter((status) => status.account.authenticated !== false)
        .map((status) => status.account.id)
        .filter((id) => id !== "claude-local"),
    );
    setResultsByAccountId((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([id]) => realAccountIds.has(id))),
    );
  }, [accountStatusesKey]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const refreshAll = async () => {
      const hidden = typeof document !== "undefined" && document.hidden;
      const eligible = accountStatusesRef.current.filter((status) => {
        const id = status.account.id;
        if (id === "claude-local" || status.account.authenticated === false) return false;
        const isTracked = accountId === id;
        if (hidden && !isTracked) return false;
        return isTracked || isQuotaPollingEnabled("claude", id);
      });
      for (let index = 0; index < eligible.length; index++) {
        if (cancelled) return;
        if (index > 0) {
          const jitter = Math.floor(Math.random() * RESET_SWEEP_JITTER_MS);
          await delayMs(RESET_SWEEP_STAGGER_MIN_MS + jitter);
          if (cancelled) return;
        }
        await refreshResetCredits(false, eligible[index].account.id);
      }
    };
    void refreshAll();
    const timer = window.setInterval(() => void refreshAll(), RESET_CREDITS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, accountId, accountStatusesKey, refreshResetCredits]);

  useEffect(() => {
    if (!enabled) return;
    logFrontend(
      "INFO",
      "claude:resets",
      accountId
        ? `Reset count badge enabled for tracked Claude account ${accountId}`
        : "Reset count badge enabled; no Claude account is tracked in the overlay",
    );
  }, [accountId, enabled]);

  const resetCredits = enabled && accountId ? (resultsByAccountId[accountId] ?? null) : null;
  return {
    resetCredits,
    resetCreditsByAccountId: enabled ? resultsByAccountId : {},
    refreshResetCredits,
  };
}
