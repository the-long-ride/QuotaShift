import { useCallback, useState } from "react";
import type React from "react";
import type { ToastKind } from "../../components/common/Toast";
import type { ClaudeAccountUsageStatus } from "../../utils/common/types";
import { resolveCurrentClaudeAccount } from "../../utils/claude/claude-current-account";

type ShowToast = (message: string, kind?: ToastKind) => void;

export function useClaudeCurrentAccountResolver(
  showToast: ShowToast,
  accountStatusesRef: React.MutableRefObject<ClaudeAccountUsageStatus[]>,
  manualProfilePathsRef: React.MutableRefObject<string[]>,
  requestStatuses: (force?: boolean) => Promise<ClaudeAccountUsageStatus[]>,
) {
  const [isResolvingCurrentAccount, setIsResolvingCurrentAccount] = useState(false);

  const resolveCurrentAccount = useCallback(async () => {
    setIsResolvingCurrentAccount(true);
    try {
      const result = await resolveCurrentClaudeAccount(
        accountStatusesRef.current,
        manualProfilePathsRef.current,
        () => requestStatuses(false),
      );
      if (result.reason === "no-process") {
        showToast("No active Claude Code process was found.", "info");
      } else if (result.reason === "not-listed") {
        showToast(
          "The active Claude Code profile is not in the account list. Add its profile path first.",
          "error",
        );
      }
      return result.status;
    } catch (error) {
      showToast(`Failed to detect the active Claude Code account: ${String(error)}`, "error");
      return null;
    } finally {
      setIsResolvingCurrentAccount(false);
    }
  }, [accountStatusesRef, manualProfilePathsRef, requestStatuses, showToast]);

  return { isResolvingCurrentAccount, resolveCurrentAccount };
}
