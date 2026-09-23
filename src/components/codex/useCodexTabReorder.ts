import { useMemo } from "react";
import { CodexAccount } from "../../utils/common/types";
import { filterAccountsByQuery } from "../../utils/account/account-search";
import { usePointerCardReorder } from "../../hooks/accounts/usePointerCardReorder";

export function useCodexTabReorder(
  accounts: CodexAccount[],
  searchQuery: string | undefined,
  appliedId: string | null,
  onReorder: (ids: string[]) => void,
) {
  const isFiltered = Boolean((searchQuery || "").trim());
  const filteredAccounts = useMemo(
    () => filterAccountsByQuery(accounts, searchQuery),
    [accounts, searchQuery],
  );
  const reorder = usePointerCardReorder(filteredAccounts, (ids) => {
    if (!isFiltered) onReorder(ids);
  });
  const currentAppliedId = useMemo(
    () => (appliedId && accounts.some((a) => a.id === appliedId) ? appliedId : null),
    [accounts, appliedId],
  );

  return {
    isFiltered,
    filteredAccounts,
    reorder,
    currentAppliedId,
  };
}
