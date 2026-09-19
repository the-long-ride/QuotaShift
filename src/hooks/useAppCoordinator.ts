import { useState, useRef, useEffect } from "react";
import type {
  AntigravityAccount,
  CodexAccount,
  CodexAccountPool,
  FullStatus,
} from "../utils/common/types";
import {
  loadPollIntervalPreference,
  loadIdlePollIntervalPreference,
} from "../utils/common/poll-interval";
import {
  loadAntigravityAccounts,
  loadCodexAccounts,
  loadCodexPools,
} from "../utils/common/app-storage";
import { refreshAntigravityAccountsCloudFirst as refreshAntigravityCloudOps } from "../utils/antigravity/app-antigravity-ops";
import { loadPersistentWorkerPreference } from "../utils/antigravity/antigravity-exact";
import { resolveTrackedProviderTab } from "../utils/common/tracked-provider-tab";
import { useLocalSession } from "./useLocalSession";
import { useClaudeMonitor } from "./useClaudeMonitor";
import { useAppThemeAndOverlay } from "./useAppThemeAndOverlay";
import { useCodexModelScanManager } from "./useCodexModelScanManager";
import { useCodexRouterManager, type UseCodexRouterManagerParams } from "./useCodexRouterManager";
import { useAppUsageAndOverlay } from "./useAppUsageAndOverlay";
import { useAppAccountOperations } from "./useAppAccountOperations";
import { useAppBackups } from "./useAppBackups";
import { useAppSessionBootstrap } from "./useAppSessionBootstrap";
import type { ToastKind } from "../components/common/Toast";
import {
  firstVisiblePlatform,
  loadPlatformVisibilityPreference,
  savePlatformVisibilityPreference,
  type PlatformId,
} from "../utils/common/platform-visibility";

const OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";
const ANTIGRAVITY_ACTIVE_ID_KEY = "antigravity-active-id";
const CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id";
const CODEX_ACTIVE_POOL_ID_KEY = "quotashift_codex_active_pool_id_v1";
const EMPTY_CODEX_USAGE_CACHE: UseCodexRouterManagerParams["codexUsageCache"] = {};

export function useAppCoordinator(showToast: (message: string, kind?: ToastKind) => void) {
  const [platformVisibility, setPlatformVisibility] = useState(() =>
    loadPlatformVisibilityPreference(),
  );
  const [activeTab, setActiveTab] = useState<"antigravity" | "codex" | "claude">(() => {
    const visibility = loadPlatformVisibilityPreference();
    const preferred = resolveTrackedProviderTab(localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY));
    return visibility[preferred] ? preferred : firstVisiblePlatform(visibility) || preferred;
  });
  const [antigravityAccounts, setAntigravityAccounts] = useState<AntigravityAccount[]>(() =>
    loadAntigravityAccounts(),
  );
  const [activeAntigravityId, setActiveAntigravityId] = useState<string | null>(() =>
    localStorage.getItem(ANTIGRAVITY_ACTIVE_ID_KEY),
  );
  const [codexAccounts, setCodexAccounts] = useState<CodexAccount[]>(() => loadCodexAccounts());
  const [activeCodexId, setActiveCodexId] = useState<string | null>(() =>
    localStorage.getItem(CODEX_ACTIVE_ID_KEY),
  );
  const [codexPools, setCodexPools] = useState<CodexAccountPool[]>(() => loadCodexPools());
  const [activeCodexPoolId, setActiveCodexPoolId] = useState<string | null>(() =>
    localStorage.getItem(CODEX_ACTIVE_POOL_ID_KEY),
  );
  const [persistentWorkers, setPersistentWorkers] = useState(() =>
    loadPersistentWorkerPreference(),
  );
  const [pollInterval, setPollInterval] = useState(() => loadPollIntervalPreference());
  const [idlePollInterval, setIdlePollInterval] = useState(() => loadIdlePollIntervalPreference());
  const [lastFullStatus, setLastFullStatus] = useState<FullStatus | null>(null);
  const [addAgOpen, setAddAgOpen] = useState(false);
  const [isCodexModalOpen, setIsCodexModalOpen] = useState(false);
  const [poolModalOpen, setPoolModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<CodexAccountPool | null>(null);

  const codexPoolsRef = useRef(codexPools);
  codexPoolsRef.current = codexPools;
  useEffect(() => {
    if (platformVisibility[activeTab]) return;
    const next = firstVisiblePlatform(platformVisibility);
    if (next) setActiveTab(next);
  }, [activeTab, platformVisibility]);

  const handlePlatformVisibilityChange = (platform: PlatformId, visible: boolean) => {
    setPlatformVisibility((prev) => {
      const next = { ...prev, [platform]: visible };
      savePlatformVisibilityPreference(next);
      return next;
    });
  };

  const themeAndOverlay = useAppThemeAndOverlay();
  const claudeMonitor = useClaudeMonitor(showToast, platformVisibility.claude, idlePollInterval);
  const codexModelScan = useCodexModelScanManager({ codexAccounts, showToast });

  const codexRouter = useCodexRouterManager({
    codexAccounts,
    codexPools,
    codexUsageCache: EMPTY_CODEX_USAGE_CACHE,
    codexModelCache: codexModelScan.codexModelCache,
    activeCodexId,
    recordRoutedCodexUse: (id) => accountOps.persistCodexLastUsed(id),
    showToast,
  });

  const refreshAntigravityAccountsCloudFirst = async (
    accs: AntigravityAccount[] = [],
    force = true,
    maxAgeMs?: number,
  ) =>
    refreshAntigravityCloudOps(
      accs,
      force,
      persistentWorkers,
      usageAndOverlay.antigravityUsageCacheRef,
      usageAndOverlay.setAntigravityUsageCache,
      setAntigravityAccounts,
      maxAgeMs,
    );

  const localSession = useLocalSession(
    antigravityAccounts,
    setAntigravityAccounts,
    refreshAntigravityAccountsCloudFirst,
  );

  const usageAndOverlay = useAppUsageAndOverlay({
    antigravityAccounts,
    activeAntigravityId,
    codexAccounts,
    setCodexAccounts,
    activeCodexId,
    codexPools,
    activeCodexPoolId,
    claudeMonitorStatus: claudeMonitor.claudeMonitorStatus,
    claudeAccountStatuses: claudeMonitor.claudeAccountStatuses,
    refreshClaudeAccountStatuses: claudeMonitor.refreshClaudeAccountStatuses,
    lastFullStatus,
    refreshAntigravityAccountsCloudFirst,
    handleApplyCodexAccount: (acc, model, pool, skip) =>
      accountOps.handleApplyCodexAccount(acc, model, pool, skip),
    localAntigravitySession: localSession.localAntigravitySession,
    refreshLocalSessionQuota: localSession.refreshLocalSessionQuota,
    syncLocalSessionFromDisk: localSession.syncLocalSessionFromDisk,
  });

  const accountOps = useAppAccountOperations({
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
    codexModelCacheRef: codexModelScan.codexModelCacheRef,
    setCodexModelCache: codexModelScan.setCodexModelCache,
    fetchCodexModelCatalog: codexModelScan.fetchCodexModelCatalog,
    poolRoutingEnabledRef: codexRouter.poolRoutingEnabledRef,
    codexUsageCache: usageAndOverlay.codexUsageCache,
    codexUsageCacheRef: usageAndOverlay.codexUsageCacheRef,
    antigravityUsageCache: usageAndOverlay.antigravityUsageCache,
    showToast,
    triggerRefresh: (force) => bootstrap.triggerRefresh(force),
    handleApplyAccountToLocalSession: localSession.handleApplyAccountToLocalSession,
    syncTrackedIdentityState: usageAndOverlay.syncTrackedIdentityState,
    handleTrackCodexAccount: usageAndOverlay.handleTrackCodexAccount,
    refreshAntigravityAccountsCloudFirst,
  });

  const backups = useAppBackups({
    antigravityAccounts,
    setAntigravityAccounts,
    codexAccounts,
    setCodexAccounts,
    setCodexPools,
    isDarkMode: themeAndOverlay.isDarkMode,
    showToast,
    triggerRefresh: (force) => bootstrap.triggerRefresh(force),
  });

  const bootstrap = useAppSessionBootstrap({
    activeCodexId,
    codexModelCacheRef: codexModelScan.codexModelCacheRef,
    poolRoutingEnabledRef: codexRouter.poolRoutingEnabledRef,
    setPoolRoutingEnabled: codexRouter.setPoolRoutingEnabled,
    setPoolRoutingBusy: codexRouter.setPoolRoutingBusy,
    setRouterStatus: codexRouter.setRouterStatus,
    pollInterval,
    idlePollInterval,
    platformVisibility,
    setActiveCodexPoolId,
    setCodexPools,
    setAntigravityUsageCache: usageAndOverlay.setAntigravityUsageCache,
    setCodexUsageCache: usageAndOverlay.setCodexUsageCache,
    setAntigravityAccounts,
    setCodexAccounts,
    updateLocalSessionFromStatus: (status) => {
      setLastFullStatus(status);
      localSession.updateLocalSessionFromStatus(status);
    },
    syncLocalSessionFromDisk: localSession.syncLocalSessionFromDisk,
    refreshAntigravityAccountsCloudFirst,
    fetchAccountUsage: usageAndOverlay.fetchAccountUsage,
    maybeAutoFailoverActiveCodexPool: usageAndOverlay.maybeAutoFailoverActiveCodexPool,
    refreshTrackedAccountOnly: usageAndOverlay.refreshTrackedAccountOnly,
    setActiveTab,
    overlayEnabled: themeAndOverlay.overlayEnabled,
    showToast,
    lastFullStatus,
    setLastFullStatus,
  });

  return {
    activeTab,
    setActiveTab,
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
    activeCodexPoolId,
    persistentWorkers,
    setPersistentWorkers,
    pollInterval,
    setPollInterval,
    idlePollInterval,
    setIdlePollInterval,
    platformVisibility,
    handlePlatformVisibilityChange,
    handleRenameAntigravity: accountOps.handleRenameAntigravity,
    handleRenameCodex: accountOps.handleRenameCodex,
    handleReorderAntigravity: accountOps.handleReorderAntigravity,
    handleReorderCodex: accountOps.handleReorderCodex,
    addAgOpen,
    setAddAgOpen,
    isCodexModalOpen,
    setIsCodexModalOpen,
    poolModalOpen,
    setPoolModalOpen,
    editingPool,
    setEditingPool,
    themeAndOverlay,
    claudeMonitor,
    codexModelScan,
    codexRouter,
    localSession,
    usageAndOverlay,
    accountOps,
    backups,
    bootstrap,
    refreshAntigravityAccountsCloudFirst,
  };
}
