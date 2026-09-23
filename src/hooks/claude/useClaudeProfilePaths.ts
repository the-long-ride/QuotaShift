import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeAccountUsageStatus } from "../../utils/common/types";
import type { ToastKind } from "../../components/common/Toast";
import {
  cleanClaudeProfilePath,
  loadClaudeManualProfilePaths,
  sameClaudeConfigPath,
  saveClaudeManualProfilePaths,
} from "../../utils/claude/claude-profile-paths";

type ShowToast = (message: string, kind?: ToastKind) => void;

export function useClaudeProfilePaths(
  showToast: ShowToast,
  setAccountStatuses: (statuses: ClaudeAccountUsageStatus[]) => void,
) {
  const [manualProfilePaths, setManualProfilePaths] = useState(() =>
    loadClaudeManualProfilePaths(),
  );
  const manualProfilePathsRef = useRef(manualProfilePaths);
  manualProfilePathsRef.current = manualProfilePaths;

  const addProfilePath = useCallback(
    async (rawPath: string) => {
      const configDir = cleanClaudeProfilePath(rawPath);
      if (!configDir) throw new Error("Enter a Claude Code profile path.");

      const existing = manualProfilePathsRef.current;
      const next = existing.some((path) => sameClaudeConfigPath(path, configDir))
        ? existing
        : [...existing, configDir];
      const statuses = await invoke<ClaudeAccountUsageStatus[]>("get_claude_account_statuses", {
        force: true,
        extraConfigDirs: next,
      });
      const account = statuses.find((status) =>
        sameClaudeConfigPath(status.account.configDir, configDir),
      );
      if (!account) {
        throw new Error("No Claude Code subscription profile was found at that path.");
      }

      saveClaudeManualProfilePaths(next);
      manualProfilePathsRef.current = next;
      setManualProfilePaths(next);
      setAccountStatuses(statuses);
      showToast(
        `Added Claude Code account ${account.account.email || account.account.configDir}`,
        "info",
      );
    },
    [setAccountStatuses, showToast],
  );

  return { manualProfilePaths, manualProfilePathsRef, addProfilePath };
}
