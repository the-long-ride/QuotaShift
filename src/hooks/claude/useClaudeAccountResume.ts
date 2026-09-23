import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ToastKind } from "../../components/common/Toast";
import type { ClaudeAccountUsageStatus } from "../../utils/common/types";

type ShowToast = (message: string, kind?: ToastKind) => void;
type RequestStatuses = (
  force?: boolean,
  maxAgeSecs?: number,
  refreshAccountId?: string | null,
) => Promise<ClaudeAccountUsageStatus[]>;

type ClaudeProcessResumeResult = {
  totalResumed: number;
  staleRemoved: number;
  persistenceError: string | null;
};

export function useClaudeAccountResume(
  platformVisible: boolean,
  requestStatuses: RequestStatuses,
  showToast: ShowToast,
) {
  return useCallback(
    async (configDir: string) => {
      if (!platformVisible) return;
      try {
        const result = await invoke<ClaudeProcessResumeResult>("resume_claude_account_processes", {
          configDir,
        });
        await requestStatuses(false).catch(() => {});
        if ((result?.totalResumed ?? 0) > 0) {
          const warning = result.persistenceError
            ? " Suspension journal cleanup could not be saved; the stale record will be rechecked on next startup."
            : "";
          showToast(
            `Resumed ${result.totalResumed} Claude Code process(es).${warning}`,
            result.persistenceError ? "warning" : "info",
          );
        } else if (result.persistenceError) {
          showToast(
            "Claude Code suspension journal cleanup could not be saved; it will be rechecked on next startup.",
            "warning",
          );
        }
      } catch (error) {
        showToast(`Failed to resume Claude Code processes: ${String(error)}`, "error");
      }
    },
    [platformVisible, requestStatuses, showToast],
  );
}
