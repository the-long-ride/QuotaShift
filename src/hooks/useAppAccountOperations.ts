import { useState } from "react";
import type {
  AntigravityAccount,
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
} from "../utils/common/types";
import type { ToastKind } from "../components/common/Toast";
import { useAntigravityAccountOps } from "./useAntigravityAccountOps";
import { useCodexAccountOps } from "./useCodexAccountOps";
import { saveAntigravityAccounts, saveCodexAccounts } from "../utils/common/app-storage";
import { saveAccountOrder, sortByOrder } from "../utils/account/account-order";
import { ANTIGRAVITY_ORDER_KEY, CODEX_ORDER_KEY } from "../utils/common/app-constants";

export interface UseAppAccountOperationsParams {
  antigravityAccounts: AntigravityAccount[];
  setAntigravityAccounts: (accs: AntigravityAccount[]) => void;
  activeAntigravityId: string | null;
  setActiveAntigravityId: (id: string | null) => void;
  codexAccounts: CodexAccount[];
  setCodexAccounts: (accs: CodexAccount[]) => void;
  activeCodexId: string | null;
  setActiveCodexId: (id: string | null) => void;
  codexPools: CodexAccountPool[];
  setCodexPools: (pools: CodexAccountPool[]) => void;
  codexPoolsRef: React.MutableRefObject<CodexAccountPool[]>;
  activeCodexPoolId: string | null;
  setActiveCodexPoolId: (id: string | null) => void;
  codexModelCacheRef: React.MutableRefObject<Record<string, CodexModelCatalogCacheEntry>>;
  setCodexModelCache: React.Dispatch<
    React.SetStateAction<Record<string, CodexModelCatalogCacheEntry>>
  >;
  fetchCodexModelCatalog: (account: CodexAccount, force?: boolean) => Promise<any>;
  codexUsageCache: Record<string, any>;
  antigravityUsageCache: Record<string, any>;
  showToast: (message: string, kind?: ToastKind) => void;
  triggerRefresh: (force?: boolean) => Promise<void>;
  handleApplyAccountToLocalSession: (acc: AntigravityAccount) => void;
  syncTrackedIdentityState: (provider: "antigravity" | "codex" | "claude", id: string) => void;
  handleTrackCodexAccount: (acc: CodexAccount) => Promise<any>;
  refreshAntigravityAccountsCloudFirst: (
    accs: AntigravityAccount[],
    force?: boolean,
  ) => Promise<void>;
}

export function useAppAccountOperations({
  antigravityAccounts,
  setAntigravityAccounts,
  activeAntigravityId,
  setActiveAntigravityId,
  codexAccounts,
  setCodexAccounts,
  activeCodexId,
  setActiveCodexId,
  codexPools,
  setCodexPools,
  codexPoolsRef,
  activeCodexPoolId,
  setActiveCodexPoolId,
  codexModelCacheRef,
  setCodexModelCache,
  fetchCodexModelCatalog,
  codexUsageCache,
  antigravityUsageCache,
  showToast,
  triggerRefresh,
  handleApplyAccountToLocalSession,
  syncTrackedIdentityState,
  handleTrackCodexAccount,
  refreshAntigravityAccountsCloudFirst,
}: UseAppAccountOperationsParams) {
  const [accountPendingDelete, setAccountPendingDelete] = useState<{
    name: string;
    email?: string | null;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const [accountPendingApply, setAccountPendingApply] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const [trackingCurrentProvider, setTrackingCurrentProvider] = useState<
    "antigravity" | "codex" | null
  >(null);

  const agOps = useAntigravityAccountOps({
    antigravityAccounts,
    setAntigravityAccounts,
    activeAntigravityId,
    setActiveAntigravityId,
    antigravityUsageCache,
    showToast,
    triggerRefresh,
    handleApplyAccountToLocalSession,
    syncTrackedIdentityState,
    refreshAntigravityAccountsCloudFirst,
    setAccountPendingApply,
    setAccountPendingDelete,
    setTrackingCurrentProvider,
  });

  const cxOps = useCodexAccountOps({
    codexAccounts,
    setCodexAccounts,
    activeCodexId,
    setActiveCodexId,
    codexPools,
    setCodexPools,
    codexPoolsRef,
    activeCodexPoolId,
    setActiveCodexPoolId,
    codexModelCacheRef,
    setCodexModelCache,
    fetchCodexModelCatalog,
    codexUsageCache,
    showToast,
    syncTrackedIdentityState,
    handleTrackCodexAccount,
    setAccountPendingApply,
    setAccountPendingDelete,
    setTrackingCurrentProvider,
  });

  const handleRenameAntigravity = (acc: AntigravityAccount, label: string) => {
    const list = antigravityAccounts.map((a) => (a.id === acc.id ? { ...a, label } : a));
    saveAntigravityAccounts(list);
    setAntigravityAccounts(list);
  };

  const handleRenameCodex = (acc: CodexAccount, label: string) => {
    const list = codexAccounts.map((a) => (a.id === acc.id ? { ...a, label } : a));
    saveCodexAccounts(list);
    setCodexAccounts(list);
  };

  const handleReorderAntigravity = (ids: string[]) => {
    saveAccountOrder(ANTIGRAVITY_ORDER_KEY, ids);
    setAntigravityAccounts(sortByOrder(antigravityAccounts, ids));
  };

  const handleReorderCodex = (ids: string[]) => {
    saveAccountOrder(CODEX_ORDER_KEY, ids);
    setCodexAccounts(sortByOrder(codexAccounts, ids));
  };

  return {
    accountPendingDelete,
    setAccountPendingDelete,
    accountPendingApply,
    setAccountPendingApply,
    trackingCurrentProvider,
    handleRenameAntigravity,
    handleRenameCodex,
    handleReorderAntigravity,
    handleReorderCodex,
    ...agOps,
    ...cxOps,
  };
}
