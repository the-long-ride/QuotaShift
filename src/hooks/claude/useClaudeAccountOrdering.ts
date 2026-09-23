import { useCallback, useRef } from "react";
import type { ClaudeAccountUsageStatus } from "../../utils/common/types";
import {
  loadAccountOrder,
  saveAccountOrder,
  sortByOrderValue,
} from "../../utils/account/account-order";
import { CLAUDE_LAST_USED_KEY, CLAUDE_ORDER_KEY } from "../../utils/common/app-constants";

type ClaudeLastUsedMap = Record<string, number>;

const loadClaudeLastUsed = (): ClaudeLastUsedMap => {
  try {
    const raw = localStorage.getItem(CLAUDE_LAST_USED_KEY);
    return raw ? (JSON.parse(raw) as ClaudeLastUsedMap) : {};
  } catch {
    return {};
  }
};

const saveClaudeLastUsed = (value: ClaudeLastUsedMap) => {
  localStorage.setItem(CLAUDE_LAST_USED_KEY, JSON.stringify(value));
};

export function useClaudeAccountOrdering(
  accountStatusesRef: React.MutableRefObject<ClaudeAccountUsageStatus[]>,
  setAccountStatuses: React.Dispatch<React.SetStateAction<ClaudeAccountUsageStatus[]>>,
) {
  const lastUsedRef = useRef<ClaudeLastUsedMap>(loadClaudeLastUsed());

  const setStatuses = useCallback(
    (statuses: ClaudeAccountUsageStatus[]) => {
      const now = Date.now();
      let lastUsedChanged = false;
      const withLastUsed = statuses.map((status) => {
        const accountId = status.account.id;
        let lastUsedAt = lastUsedRef.current[accountId] ?? null;
        if (status.active && (lastUsedAt === null || now - lastUsedAt >= 30_000)) {
          lastUsedAt = now;
          lastUsedRef.current[accountId] = now;
          lastUsedChanged = true;
        }
        return { ...status, lastUsedAt };
      });
      if (lastUsedChanged) saveClaudeLastUsed(lastUsedRef.current);
      const ordered = sortByOrderValue(
        withLastUsed,
        loadAccountOrder(CLAUDE_ORDER_KEY),
        (status) => status.account.id,
      );
      accountStatusesRef.current = ordered;
      setAccountStatuses(ordered);
    },
    [accountStatusesRef, setAccountStatuses],
  );

  const handleReorderClaudeAccounts = useCallback(
    (ids: string[]) => {
      saveAccountOrder(CLAUDE_ORDER_KEY, ids);
      const ordered = sortByOrderValue(
        accountStatusesRef.current,
        ids,
        (status) => status.account.id,
      );
      accountStatusesRef.current = ordered;
      setAccountStatuses(ordered);
    },
    [accountStatusesRef, setAccountStatuses],
  );

  return { setStatuses, handleReorderClaudeAccounts };
}
