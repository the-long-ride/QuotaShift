import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type React from "react";
import type { ToastKind } from "../components/common/Toast";
import type { ClaudeAccountUsageStatus } from "../utils/common/types";
import { claudeConfigPathKey } from "../utils/claude/claude-profile-paths";

type ShowToast = (message: string, kind?: ToastKind) => void;
type RequestStatuses = (
  force?: boolean,
  maxAgeSecs?: number,
  refreshAccountId?: string | null,
) => Promise<ClaudeAccountUsageStatus[]>;

export function useClaudeAccountRefresh(
  platformVisible: boolean,
  accountStatusesRef: React.MutableRefObject<ClaudeAccountUsageStatus[]>,
  requestStatuses: RequestStatuses,
  showToast: ShowToast,
) {
  const [refreshingAccountIds, setRefreshingAccountIds] = useState<Set<string>>(() => new Set());

  const refreshAccountUsage = useCallback(
    async (accountId: string) => {
      const status = accountStatusesRef.current.find((item) => item.account.id === accountId);
      if (!platformVisible || !status || status.suspended) return;

      setRefreshingAccountIds((current) => new Set(current).add(accountId));
      try {
        await requestStatuses(true, 1, accountId);
      } catch (error) {
        setRefreshingAccountIds((current) => {
          const next = new Set(current);
          next.delete(accountId);
          return next;
        });
        showToast(`Failed to refresh Claude Code usage: ${String(error)}`, "error");
      }
    },
    [accountStatusesRef, platformVisible, requestStatuses, showToast],
  );

  useEffect(() => {
    if (!platformVisible) {
      setRefreshingAccountIds(new Set());
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("claude-account-usage-updated", (event) => {
      if (cancelled) return;
      const completedKey = claudeConfigPathKey(event.payload || "");
      setRefreshingAccountIds((current) => {
        if (!current.size) return current;
        const next = new Set(current);
        for (const accountId of current) {
          const status = accountStatusesRef.current.find((item) => item.account.id === accountId);
          if (status && claudeConfigPathKey(status.account.configDir) === completedKey) {
            next.delete(accountId);
          }
        }
        return next.size === current.size ? current : next;
      });
    }).then((dispose) => {
      if (cancelled) dispose();
      else unlisten = dispose;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [accountStatusesRef, platformVisible]);

  return { refreshingAccountIds, refreshAccountUsage };
}
