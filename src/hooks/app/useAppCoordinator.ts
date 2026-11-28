import { useState, useRef } from "react";
import type {
  AntigravityAccount,
  CodexAccount,
  CodexAccountPool,
  FullStatus,
} from "../../utils/common/types";
import {
  loadPollIntervalPreference,
  loadIdlePollIntervalPreference,
} from "../../utils/common/settings/poll-interval";
import {
  loadAntigravityAccounts,
  loadCodexAccounts,
  loadCodexPools,
} from "../../utils/common/backup/app-storage";
import { refreshAntigravityAccountsCloudFirst as refreshAntigravityCloudOps } from "../../utils/antigravity/app-antigravity-ops";
import { loadPersistentWorkerPreference } from "../../utils/antigravity/quota/antigravity-exact";
import { resolveTrackedProviderTab } from "../../utils/common/accounts/tracked-provider-tab";
import {
  ANTIGRAVITY_ACTIVE_ID_KEY,
  CODEX_ACTIVE_ID_KEY,
  CODEX_ACTIVE_POOL_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../utils/common/backup/app-constants";
import {
  buildNoTrackedAccountToastMessage,
  buildTrackStartedToastMessage,
} from "../../utils/common/accounts/track-toast";
import { useLocalSession } from "../antigravity/useLocalSession";
import { useClaudeMonitor } from "../claude/useClaudeMonitor";
import { useAppThemeAndOverlay } from "./tracking/useAppThemeAndOverlay";
import { useCodexModelScanManager } from "../codex/useCodexModelScanManager";
import { useCodexRouterManager } from "../codex/useCodexRouterManager";
import { useCodexModelPoolsV2 } from "../codex/useCodexModelPoolsV2";
import { useAppUsageAndOverlay } from "./tracking/useAppUsageAndOverlay";
import { useAppAccountOperations } from "./useAppAccountOperations";
import { useAppBackups } from "./useAppBackups";
import { useAutoBackup } from "./useAutoBackup";
import { useAppSessionBootstrap } from "./useAppSessionBootstrap";
import { useKeepAliveStateSync } from "./useKeepAliveStateSync";
import { useAppModalState } from "./useAppModalState";
import type { ToastKind } from "../../components/common/Toast";
import { useAppNavigation } from "./useAppNavigation";
import {
  firstVisiblePlatform,
  loadPlatformVisibilityPreference,
} from "../../utils/common/ui/platform-visibility";

export function useAppCoordinator(
  showToast: (message: string, kind?: ToastKind) => void,
  onClearSearch?: () => void,
) {
  const [activeTab, setActiveTab] = useState<"antigravity" | "codex" | "claude">(() => {
    const visibility = loadPlatformVisibilityPreference();
    const preferred = resolveTrackedProviderTab(localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY));
    return visibility[preferred] ? preferred : firstVisiblePlatform(visibility) || preferred;
  });
  const {
    platformVisibility,
    handlePlatformVisibilityChange,
    codexSection,
    setCodexSection,
    handleOpenModelRouting,
  } = useAppNavigation(activeTab, setActiveTab);
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
  const modalState = useAppModalState();
  const codexPoolsRef = useRef(codexPools);
  codexPoolsRef.current = codexPools;

  const themeAndOverlay = useAppThemeAndOverlay(() =>
    showToast(buildNoTrackedAccountToastMessage(), "info"),
  );
  const claudeMonitor = useClaudeMonitor(showToast, platformVisibility.claude, idlePollInterval);
  const codexModelScan = useCodexModelScanManager({ codexAccounts, showToast });
  const { modelPoolsV2, updateModelPoolsV2 } = useCodexModelPoolsV2(codexAccounts, showToast);

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

  const localSession = useLocalSession();

  const usageAndOverlay = useAppUsageAndOverlay({
    antigravityAccounts,
    activeAntigravityId,
    codexAccounts,
    setCodexAccounts,
    activeCodexId,
    claudeMonitorStatus: claudeMonitor.claudeMonitorStatus,
    claudeAccountStatuses: claudeMonitor.claudeAccountStatuses,
    refreshClaudeAccountStatuses: claudeMonitor.refreshClaudeAccountStatuses,
    lastFullStatus,
    refreshAntigravityAccountsCloudFirst,
    localAntigravitySession: localSession.localAntigravitySession,
    refreshLocalSessionQuota: localSession.refreshLocalSessionQuota,
    syncLocalSessionFromDisk: localSession.syncLocalSessionFromDisk,
    notifyTrackStarted: () => showToast(buildTrackStartedToastMessage(), "info"),
  });

  useKeepAliveStateSync({
    setAntigravityAccounts,
    setCodexAccounts,
    antigravityUsageCacheRef: usageAndOverlay.antigravityUsageCacheRef,
    setAntigravityUsageCache: usageAndOverlay.setAntigravityUsageCache,
    codexUsageCacheRef: usageAndOverlay.codexUsageCacheRef,
    setCodexUsageCache: usageAndOverlay.setCodexUsageCache,
    refreshAntigravityAccountsCloudFirst,
    fetchAccountUsage: usageAndOverlay.fetchAccountUsage,
    platformVisibility,
  });

  const codexRouter = useCodexRouterManager({
    codexAccounts,
    modelPoolsV2,
    setCodexAccounts,
    codexPools,
    codexUsageCache: usageAndOverlay.codexUsageCache,
    codexModelCache: codexModelScan.codexModelCache,
    activeCodexId,
    activeCodexPoolId,
    recordRoutedCodexUse: (id) => accountOps.persistCodexLastUsed(id),
    showToast,
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
    fetchCodexUsage: usageAndOverlay.fetchAccountUsage,
    codexUsageCache: usageAndOverlay.codexUsageCache,
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

  useAutoBackup({
    antigravityAccounts,
    codexAccounts,
    isDarkMode: themeAndOverlay.isDarkMode,
    showToast,
  });

  const bootstrap = useAppSessionBootstrap({
    activeCodexId,
    setPoolRoutingEnabled: codexRouter.setPoolRoutingEnabled,
    pollInterval,
    idlePollInterval,
    platformVisibility,
    setActiveCodexPoolId,
    setCodexPools,
    setAntigravityUsageCache: usageAndOverlay.setAntigravityUsageCache,
    setAntigravityAccounts,
    setCodexAccounts,
    updateLocalSessionFromStatus: (status) => {
      setLastFullStatus(status);
      localSession.updateLocalSessionFromStatus(status);
    },
    syncLocalSessionFromDisk: localSession.syncLocalSessionFromDisk,
    refreshAntigravityAccountsCloudFirst,
    fetchAccountUsage: usageAndOverlay.fetchAccountUsage,
    refreshTrackedAccountOnly: usageAndOverlay.refreshTrackedAccountOnly,
    setActiveTab,
    overlayEnabled:
      themeAndOverlay.displayMode === "overlay" || themeAndOverlay.displayMode === "circle",
    showToast,
    lastFullStatus,
    setLastFullStatus,
    onClearSearch,
  });

  return {
    activeTab,
    setActiveTab,
    codexSection,
    setCodexSection,
    handleOpenModelRouting,
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
    modelPoolsV2,
    updateModelPoolsV2,
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
    ...modalState,
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
