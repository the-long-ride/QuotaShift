import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CLAUDE_RESET_CREDITS_CHANGED_EVENT,
  CLAUDE_RESET_CREDITS_ENABLED_KEY,
  loadClaudeResetCreditsEnabled,
  type ClaudeResetCredits,
} from "../../utils/claude/claude-reset-credits";
import type { ClaudeAccountUsageStatus } from "../../utils/claude/claude-account-types";
import { logFrontend } from "../../utils/common/logger";

/** Frontend cadence; the backend cache enforces the same 30-minute limit per account. */
export const RESET_CREDITS_POLL_MS = 30 * 60 * 1000;

type TrackedProvider = "antigravity" | "codex" | "claude";

/**
 * Remaining Claude resets. Account cards always get them, like Codex; the opt-in setting
 * only gates the overlay/taskbar badge. Only real (non `claude-local`) accounts are queried.
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
    .map((status) => `${status.account.id}:${status.account.configDir}`)
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
    window.addEventListener(CLAUDE_RESET_CREDITS_CHANGED_EVENT, sync);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CLAUDE_RESET_CREDITS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const refreshResetCredits = useCallback(
    async (force = false, targetAccountId?: string): Promise<ClaudeResetCredits | null> => {
      const requestedAccountId = targetAccountId;
      if (!requestedAccountId || requestedAccountId === "claude-local") return null;
      if (!accountStatusesRef.current.some((status) => status.account.id === requestedAccountId)) {
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
        setResultsByAccountId((previous) => ({ ...previous, [requestedAccountId]: credits }));
        return credits;
      } catch (error) {
        logFrontend("WARN", "claude:resets", "Reset count request failed", String(error));
        setResultsByAccountId((previous) => {
          if (!(requestedAccountId in previous)) return previous;
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
        .map((status) => status.account.id)
        .filter((id) => id !== "claude-local"),
    );
    setResultsByAccountId((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([id]) => realAccountIds.has(id))),
    );
  }, [accountStatusesKey]);

  // Cards always show the count, so every real account is polled regardless of the setting.
  useEffect(() => {
    const refreshAll = async () => {
      for (const status of accountStatusesRef.current) {
        if (status.account.id === "claude-local") continue;
        await refreshResetCredits(false, status.account.id);
      }
    };
    void refreshAll();
    const timer = window.setInterval(() => void refreshAll(), RESET_CREDITS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [accountStatusesKey, refreshResetCredits]);

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
    resetCreditsByAccountId: resultsByAccountId,
    refreshResetCredits,
  };
}
