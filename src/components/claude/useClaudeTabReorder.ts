import { useMemo } from "react";
import type { ClaudeAccountUsageStatus } from "../../utils/common/types";
import { classifyClaudeTier } from "../../utils/claude/claude-tier-summary";
import { usePointerCardReorder } from "../../hooks/accounts/usePointerCardReorder";

function matchesClaudeAccount(status: ClaudeAccountUsageStatus, query?: string): boolean {
  const normalized = (query || "").trim().toLowerCase();
  if (!normalized) return true;
  const account = status.account;
  return [
    account.email,
    account.organizationName,
    account.profileName,
    account.configDir,
    account.subscriptionType,
    account.rateLimitTier,
  ].some((value) => value?.toLowerCase().includes(normalized));
}

export function useClaudeTabReorder(
  statuses: ClaudeAccountUsageStatus[],
  searchQuery: string | undefined,
  onReorder?: (ids: string[]) => void,
  selectedTier: string | null = null,
) {
  const isFiltered = Boolean((searchQuery || "").trim()) || selectedTier !== null;
  const searchFilteredAccounts = useMemo(
    () => statuses.filter((status) => matchesClaudeAccount(status, searchQuery)),
    [searchQuery, statuses],
  );
  const filteredAccounts = useMemo(
    () => searchFilteredAccounts.filter((status) => !selectedTier || classifyClaudeTier(status.account.subscriptionType || status.account.rateLimitTier) === selectedTier),
    [searchFilteredAccounts, selectedTier],
  );
  const reorderItems = useMemo(
    () => filteredAccounts.map((status) => ({ id: status.account.id, status })),
    [filteredAccounts],
  );
  const reorder = usePointerCardReorder(reorderItems, (ids) => {
    if (!isFiltered) onReorder?.(ids);
  });

  return {
    filteredAccounts,
    searchFilteredAccounts,
    displayedAccounts: reorder.displayedItems.map((item) => item.status),
    reorder,
  };
}
