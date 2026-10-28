import { useCallback, useEffect, useState } from "react";
import type { CodexAccount } from "../../utils/common/types";
import type { CodexModelPoolV2 } from "../../utils/codex/pools/codex-pools-v2-types";
import { validateEnabledPoolNames } from "../../utils/codex/pools/codex-pools-v2";
import {
  loadCodexModelPoolsV2,
  saveCodexModelPoolsV2,
} from "../../utils/common/backup/app-storage";
import type { ToastKind } from "../../components/common/Toast";

export function useCodexModelPoolsV2(
  accounts: CodexAccount[],
  showToast: (message: string, kind?: ToastKind) => void,
) {
  const [modelPoolsV2, setModelPoolsV2] = useState<CodexModelPoolV2[]>(() =>
    loadCodexModelPoolsV2(localStorage, accounts),
  );

  const updateModelPoolsV2 = useCallback(
    (next: CodexModelPoolV2[]): boolean => {
      const validation = validateEnabledPoolNames(next, accounts);
      if (!validation.valid) {
        showToast(validation.error || "Invalid enabled Model Pools", "error");
        return false;
      }
      saveCodexModelPoolsV2(next);
      setModelPoolsV2(next);
      return true;
    },
    [accounts, showToast],
  );

  // Removal of a saved account must never leave an enabled pool routable with stale members.
  useEffect(() => {
    const known = new Set(accounts.map((a) => a.id));
    setModelPoolsV2((previous) => {
      const next = previous.map((pool) => {
        // A Codex account refresh must not delete independently registered SIWC members.
        if (pool.authMode === "siwc") return pool;
        const members = pool.memberAccountIds.filter((id) => known.has(id));
        return members.length === pool.memberAccountIds.length
          ? pool
          : {
              ...pool,
              memberAccountIds: members,
              enabled: pool.enabled && members.length > 0,
            };
      });
      if (next.every((pool, index) => pool === previous[index])) return previous;
      saveCodexModelPoolsV2(next);
      return next;
    });
  }, [accounts]);

  return { modelPoolsV2, updateModelPoolsV2 };
}
