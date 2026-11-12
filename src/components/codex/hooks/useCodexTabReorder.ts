import { useMemo } from "react";
import { CodexAccount } from "../../../utils/common/types";
import { filterAccountsByQuery } from "../../../utils/account/account-search";
import { classifyCodexTier, isCodexAccountOAuth } from "../../../utils/codex/codex-tier-summary";
import { usePointerCardReorder } from "../../../hooks/accounts/usePointerCardReorder";

export function useCodexTabReorder(
  accounts: CodexAccount[],
  searchQuery: string | undefined,
  appliedId: string | null,
  onReorder: (ids: string[]) => void,
  selectedTier: string | null = null,
  usageCache: Record<string, any> = {},
) {
  const isFiltered = Boolean((searchQuery || "").trim()) || selectedTier !== null;
  const searchFilteredAccounts = useMemo(
    () => filterAccountsByQuery(accounts, searchQuery),
    [accounts, searchQuery],
  );
  const filteredAccounts = useMemo(
    () => searchFilteredAccounts.filter((account) => !selectedTier || classifyCodexTier(usageCache[account.id]?.planName ?? account.lastPlan, isCodexAccountOAuth(account, usageCache[account.id])) === selectedTier),
    [searchFilteredAccounts, selectedTier, usageCache],
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
    searchFilteredAccounts,
    reorder,
    currentAppliedId,
  };
}
