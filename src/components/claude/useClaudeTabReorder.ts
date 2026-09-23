import { useMemo } from "react";
import type { ClaudeAccountUsageStatus } from "../../utils/common/types";
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
) {
  const isFiltered = Boolean((searchQuery || "").trim());
  const filteredAccounts = useMemo(
    () => statuses.filter((status) => matchesClaudeAccount(status, searchQuery)),
    [searchQuery, statuses],
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
    displayedAccounts: reorder.displayedItems.map((item) => item.status),
    reorder,
  };
}
