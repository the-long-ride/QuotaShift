import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
  CodexAccountPool,
  FullStatus,
} from "../../utils/common/types";
import { reconcileCodexPools } from "../../utils";
import { restoreCodexPoolRoutingSelection } from "../../utils/codex/codex-active-storage";
import {
  loadCodexAccounts,
  loadCodexPools,
  saveCodexPools,
  loadAntigravityAccounts,
} from "../../utils/common/app-storage";
import { loadPollIntervalPreference } from "../../utils/common/poll-interval";
import type { ToastKind } from "../../components/common/Toast";
import type { PlatformVisibility } from "../../utils/common/platform-visibility";
import { useAppUpdateCheck } from "./useAppUpdateCheck";
import { useAppEventListeners } from "./useAppEventListeners";
import { buildInitialMonitoredCodexInfo } from "../../utils/codex/codex-tray-state";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../utils/common/app-constants";

export interface UseAppSessionBootstrapParams {
  activeCodexId: string | null;
  setPoolRoutingEnabled: (val: boolean) => void;
  pollInterval: number;
  idlePollInterval: number;
  platformVisibility: PlatformVisibility;
  setActiveCodexPoolId: (id: string | null) => void;
  setCodexPools: (pools: CodexAccountPool[]) => void;
  setAntigravityUsageCache: React.Dispatch<
    React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>
  >;
  setAntigravityAccounts: (accounts: AntigravityAccount[]) => void;
  setCodexAccounts: (accounts: CodexAccount[]) => void;
  updateLocalSessionFromStatus: (status: any) => void;
  syncLocalSessionFromDisk: () => Promise<void>;
  refreshAntigravityAccountsCloudFirst: (
    accs: AntigravityAccount[],
    force?: boolean,
  ) => Promise<void>;
  fetchAccountUsage: (account: CodexAccount, force?: boolean) => Promise<any>;
  refreshTrackedAccountOnly: (payload: any) => Promise<void>;
  setActiveTab: (tab: "antigravity" | "codex" | "claude") => void;
  overlayEnabled: boolean;
  showToast: (message: string, kind?: ToastKind) => void;
  lastFullStatus?: FullStatus | null;
  setLastFullStatus?: (status: FullStatus | null) => void;
}

export function useAppSessionBootstrap({
  activeCodexId,
  setPoolRoutingEnabled,
  pollInterval,
  idlePollInterval,
  platformVisibility,
  setActiveCodexPoolId,
  setCodexPools,
  setAntigravityUsageCache,
  setAntigravityAccounts,
  setCodexAccounts,
  updateLocalSessionFromStatus,
  syncLocalSessionFromDisk,
  refreshAntigravityAccountsCloudFirst,
  fetchAccountUsage,
  refreshTrackedAccountOnly,
  setActiveTab,
  overlayEnabled,
  showToast,
  lastFullStatus: externalLastFullStatus,
  setLastFullStatus: setExternalLastFullStatus,
}: UseAppSessionBootstrapParams) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [internalLastFullStatus, setInternalLastFullStatus] = useState<any>(null);
  const lastFullStatus =
    externalLastFullStatus !== undefined ? externalLastFullStatus : internalLastFullStatus;
  const setLastFullStatus = setExternalLastFullStatus || setInternalLastFullStatus;
  const {
    updateAvailable,
    updateTag,
    updatePromptOpen,
    setUpdatePromptOpen,
    checkForUpdates,
    handleCheckUpdate,
    handleDownloadUpdate,
  } = useAppUpdateCheck();
  useAppEventListeners({
    setLastFullStatus,
    updateLocalSessionFromStatus,
    fetchAccountUsage,
    pollInterval,
    idlePollInterval,
    platformVisibility,
    refreshAntigravityAccountsCloudFirst,
    setActiveTab,
    setAntigravityUsageCache,
    refreshTrackedAccountOnly,
    setAntigravityAccounts,
    setCodexAccounts,
  });
  const triggerRefresh = async (force = false) => {
    setIsRefreshing(true);
    try {
      const s = await invoke<any>("force_refresh");
      if (s) {
        setLastFullStatus(s);
        updateLocalSessionFromStatus(s);
      }
      if (platformVisibility.antigravity) {
        await syncLocalSessionFromDisk();
        await refreshAntigravityAccountsCloudFirst(loadAntigravityAccounts(), true);
      }
      checkForUpdates();
      if (platformVisibility.codex) {
        await Promise.all(loadCodexAccounts().map((acc) => fetchAccountUsage(acc, force)));
      }
    } catch (e) {
      console.error("Refresh error:", e);
    } finally {
      setIsRefreshing(false);
    }
  };
  useEffect(() => {
    const cxAccounts = loadCodexAccounts();
    const cxPools = reconcileCodexPools(loadCodexPools(), cxAccounts);
    saveCodexPools(cxPools);
    setCodexPools(cxPools);
    const routingRestore = restoreCodexPoolRoutingSelection(localStorage, cxPools);
    const resolvedPoolId = routingRestore.activePoolId;
    setActiveCodexPoolId(resolvedPoolId);
    if (routingRestore.disabledMissingPool) {
      showToast("Pool Routing was disabled because no valid active pool is selected", "warning");
    } else if (routingRestore.shouldRestoreRouting) {
      setPoolRoutingEnabled(true);
    }
    const initialPollInterval = loadPollIntervalPreference();
    invoke("set_poll_interval", { seconds: initialPollInterval }).catch(console.warn);
    const savedTrackedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
    const savedTrackedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    if (savedTrackedProvider === "codex") {
      const accountId = savedTrackedAccountId || activeCodexId || cxAccounts[0]?.id || null;
      const info = buildInitialMonitoredCodexInfo(cxAccounts, accountId);
      if (info) invoke("set_monitored_codex", { info }).catch(console.warn);
    } else if (savedTrackedProvider === "antigravity" || savedTrackedProvider === "claude") {
      invoke("set_monitored_codex", { info: null }).catch(console.warn);
    }
    if (platformVisibility.codex) {
      Promise.all(cxAccounts.map((acc) => fetchAccountUsage(acc))).catch(console.error);
    }
    if (platformVisibility.antigravity) {
      const agAccounts = loadAntigravityAccounts();
      agAccounts.forEach((acc) => {
        setAntigravityUsageCache((p) => ({
          ...p,
          [acc.id]: {
            ...p[acc.id],
            loading: true,
            exactState: "idle",
            workerMessage: "Refreshing quota summary",
          },
        }));
      });
      setTimeout(() => {
        refreshAntigravityAccountsCloudFirst(agAccounts, false).catch(console.error);
      }, 0);
    }
    checkForUpdates();
  }, []);

  useEffect(() => {
    if (overlayEnabled) invoke("set_overlay_visible", { visible: true }).catch(() => {});
  }, [overlayEnabled]);

  return {
    updateAvailable,
    updateTag,
    updatePromptOpen,
    setUpdatePromptOpen,
    isRefreshing,
    lastFullStatus,
    checkForUpdates,
    handleCheckUpdate,
    handleDownloadUpdate,
    triggerRefresh,
  };
}
