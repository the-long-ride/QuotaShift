import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexRouterStatus,
  FullStatus,
} from "../utils/common/types";
import { deobfuscate } from "../utils/auth/auth";
import { buildCodexRouterConfig, reconcileCodexPools } from "../utils";
import {
  loadCodexAccounts,
  loadCodexPools,
  saveCodexPools,
  loadAntigravityAccounts,
} from "../utils/common/app-storage";
import { loadPollIntervalPreference } from "../utils/common/poll-interval";
import type { ToastKind } from "../components/common/Toast";
import type { PlatformVisibility } from "../utils/common/platform-visibility";
import { useAppUpdateCheck } from "./useAppUpdateCheck";
import { useAppEventListeners } from "./useAppEventListeners";

export const CODEX_ACTIVE_POOL_ID_KEY = "quotashift_codex_active_pool_id_v1";
export const CODEX_POOL_ROUTING_KEY = "quotashift_codex_pool_routing_v1";
export const OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";
export const OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id";

export interface UseAppSessionBootstrapParams {
  activeCodexId: string | null;
  codexModelCacheRef: React.MutableRefObject<Record<string, CodexModelCatalogCacheEntry>>;
  poolRoutingEnabledRef: React.MutableRefObject<boolean>;
  setPoolRoutingEnabled: (val: boolean) => void;
  setPoolRoutingBusy: (val: boolean) => void;
  setRouterStatus: (val: CodexRouterStatus | null) => void;
  pollInterval: number;
  idlePollInterval: number;
  platformVisibility: PlatformVisibility;
  setActiveCodexPoolId: (id: string | null) => void;
  setCodexPools: (pools: CodexAccountPool[]) => void;
  setAntigravityUsageCache: React.Dispatch<
    React.SetStateAction<Record<string, AntigravityUsageCacheEntry>>
  >;
  setCodexUsageCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setAntigravityAccounts: (accounts: AntigravityAccount[]) => void;
  setCodexAccounts: (accounts: CodexAccount[]) => void;
  updateLocalSessionFromStatus: (status: any) => void;
  syncLocalSessionFromDisk: () => Promise<void>;
  refreshAntigravityAccountsCloudFirst: (
    accs: AntigravityAccount[],
    force?: boolean,
  ) => Promise<void>;
  fetchAccountUsage: (account: CodexAccount, force?: boolean) => Promise<any>;
  maybeAutoFailoverActiveCodexPool: () => Promise<void>;
  refreshTrackedAccountOnly: (payload: any) => Promise<void>;
  setActiveTab: (tab: "antigravity" | "codex" | "claude") => void;
  overlayEnabled: boolean;
  showToast: (message: string, kind?: ToastKind) => void;
  lastFullStatus?: FullStatus | null;
  setLastFullStatus?: (status: FullStatus | null) => void;
}

export function useAppSessionBootstrap({
  activeCodexId,
  codexModelCacheRef,
  poolRoutingEnabledRef,
  setPoolRoutingEnabled,
  setPoolRoutingBusy,
  setRouterStatus,
  pollInterval,
  idlePollInterval,
  platformVisibility,
  setActiveCodexPoolId,
  setCodexPools,
  setAntigravityUsageCache,
  setCodexUsageCache,
  setAntigravityAccounts,
  setCodexAccounts,
  updateLocalSessionFromStatus,
  syncLocalSessionFromDisk,
  refreshAntigravityAccountsCloudFirst,
  fetchAccountUsage,
  maybeAutoFailoverActiveCodexPool,
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
    maybeAutoFailoverActiveCodexPool,
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
        await maybeAutoFailoverActiveCodexPool();
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
    const storedPoolId = localStorage.getItem(CODEX_ACTIVE_POOL_ID_KEY);
    setActiveCodexPoolId(
      storedPoolId && cxPools.some((p) => p.id === storedPoolId) ? storedPoolId : null,
    );
    if (localStorage.getItem(CODEX_POOL_ROUTING_KEY) === "true") {
      setPoolRoutingBusy(true);
      void (async () => {
        try {
          const started = await invoke<CodexRouterStatus>("start_codex_router");
          if (!started.running) throw new Error("router listener did not report running");
          const config = buildCodexRouterConfig({
            accounts: cxAccounts,
            pools: cxPools,
            usageCache: {},
            modelCache: codexModelCacheRef.current,
            appliedAccountId: activeCodexId,
            decodeCredential: deobfuscate,
          });
          const configured = await invoke<CodexRouterStatus>("configure_codex_router", { config });
          if (!configured.running) throw new Error("router stopped during startup configuration");
          poolRoutingEnabledRef.current = true;
          setPoolRoutingEnabled(true);
          setRouterStatus(configured);
          localStorage.setItem(CODEX_POOL_ROUTING_KEY, "true");
        } catch (error) {
          try {
            await invoke("stop_codex_router");
          } catch {}
          poolRoutingEnabledRef.current = false;
          setPoolRoutingEnabled(false);
          localStorage.setItem(CODEX_POOL_ROUTING_KEY, "false");
          showToast(`Failed to start Codex pool routing: ${error}`, "warning");
        } finally {
          setPoolRoutingBusy(false);
        }
      })();
    } else {
      invoke<CodexRouterStatus>("get_codex_router_status")
        .then((status) => setRouterStatus(status))
        .catch(console.warn);
    }
    const initialPollInterval = loadPollIntervalPreference();
    invoke("set_poll_interval", { seconds: initialPollInterval }).catch(console.warn);
    const savedTrackedProvider = localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY);
    const savedTrackedAccountId = localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    if (savedTrackedProvider === "codex") {
      const targetAcc = cxAccounts.find(
        (a) => a.id === (savedTrackedAccountId || activeCodexId || cxAccounts[0]?.id),
      );
      if (targetAcc)
        invoke("set_monitored_codex", {
          info: {
            accountId: targetAcc.id,
            label: targetAcc.label || targetAcc.email || "Codex",
            primaryPercent: null,
            primaryLabel: "5h",
            secondaryPercent: null,
            secondaryLabel: "wk",
          },
        }).catch(console.warn);
    } else if (savedTrackedProvider === "antigravity" || savedTrackedProvider === "claude") {
      invoke("set_monitored_codex", { info: null }).catch(console.warn);
    }
    if (platformVisibility.codex) {
      Promise.all(
        cxAccounts.map((acc) => {
          setCodexUsageCache((p) => ({
            ...p,
            [acc.id]: {
              ...p[acc.id],
              loading: true,
              isOAuth: deobfuscate(acc.apiKey).startsWith("{"),
            },
          }));
          return fetchAccountUsage(acc);
        }),
      )
        .then(maybeAutoFailoverActiveCodexPool)
        .catch(console.error);
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
