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

export const ANTIGRAVITY_ACTIVE_ID_KEY = "antigravity-active-id";
export const CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id";
export const CODEX_ACTIVE_POOL_ID_KEY = "quotashift_codex_active_pool_id_v1";
export const ANTIGRAVITY_ORDER_KEY = "antigravity-account-order";
export const CODEX_ORDER_KEY = "antigravity-codex-account-order";
export const OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";
export const OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id";

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
  poolRoutingEnabledRef: React.MutableRefObject<boolean>;
  codexUsageCache: Record<string, any>;
  codexUsageCacheRef: React.MutableRefObject<Record<string, any>>;
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
  poolRoutingEnabledRef,
  codexUsageCache,
  codexUsageCacheRef,
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
    poolRoutingEnabledRef,
    codexUsageCache,
    codexUsageCacheRef,
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
