import React, { useState } from "react";
import { CodexAccount } from "../../../utils/common/types";

export function useCodexRefreshState(onRefresh?: (acc: CodexAccount) => void | Promise<void>) {
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const handleRefresh = async (e: React.MouseEvent, acc: CodexAccount) => {
    e.stopPropagation();
    if (refreshingIds.has(acc.id) || !onRefresh) return;
    setRefreshingIds((prev) => new Set(prev).add(acc.id));
    try {
      await onRefresh(acc);
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(acc.id);
        return next;
      });
    }
  };

  return { refreshingIds, handleRefresh };
}
