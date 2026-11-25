import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodexModelScanProgress } from "../../src/components/common/header/header-types";
import type { ToastKind, ToastMessage } from "../../src/components/common/Toast";
import {
  DEFAULT_PLATFORM_VISIBILITY,
  type PlatformId,
} from "../../src/utils/common/ui/platform-visibility";
import {
  createInitialAntigravityState,
  refreshAllAntigravityCache,
} from "../data/demo-antigravity";
import { createInitialCodexState, refreshAllCodexCache } from "../data/demo-codex";
import {
  applyVisibilityChange,
  createInitialClaudeState,
  makeScanProgress,
  readInitialDemoTheme,
  syncDemoThemeDom,
} from "../data/demo-claude";
import { buildDemoOverlayAccounts } from "../data/build-overlay-accounts";
import {
  cloneDefaultTrackedIds,
  countTrackedIds,
  createInitialDemoUiState,
  toggleDemoTrackedId,
  type DemoCoordinator,
  type DemoSurfaceId,
  type DemoTrackedIds,
  type DemoUiState,
} from "./demo-coordinator-types";
import { useDemoAccountActions } from "./useDemoAccountActions";

export type { DemoCoordinator, DemoSurfaceId };

export function useDemoCoordinator(): DemoCoordinator {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(readInitialDemoTheme);
  const [ui, setUi] = useState<DemoUiState>(createInitialDemoUiState);
  const [trackedIds, setTrackedIds] = useState<DemoTrackedIds>(cloneDefaultTrackedIds);
  const [agState, setAgState] = useState(() => createInitialAntigravityState());
  const [activeAntigravityId, setActiveAntigravityId] = useState<string | null>("ag-studio-ultra");
  const [codexState, setCodexState] = useState(() => createInitialCodexState());
  const [activeCodexId, setActiveCodexId] = useState<string | null>("codex-pro-main");
  const [codexModelScanProgress, setCodexModelScanProgress] = useState<CodexModelScanProgress>(() =>
    makeScanProgress(3, false),
  );
  const [claudeState, setClaudeState] = useState(() => createInitialClaudeState());
  const [refreshingClaudeIds, setRefreshingClaudeIds] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastIdRef = useRef(1);

  const patchUi = useCallback(
    (patch: Partial<DemoUiState>) => setUi((prev) => ({ ...prev, ...patch })),
    [],
  );

  useEffect(() => {
    syncDemoThemeDom(isDarkMode);
  }, [isDarkMode]);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, kind, durationMs: 3200 });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const toggleTrack = useCallback(
    (provider: PlatformId, id: string, label: string) => {
      setTrackedIds((prev) => {
        const { next, action } = toggleDemoTrackedId(prev, provider, id);
        if (action === "max") {
          showToast("Max 3 monitored accounts reached. Untrack one first.", "warning");
        } else {
          showToast(action === "removed" ? `Untracked ${label}` : `Monitoring ${label}`, "info");
        }
        return next;
      });
    },
    [showToast],
  );

  const onPlatformVisibilityChange = useCallback(
    (platform: PlatformId, visible: boolean) =>
      setUi((prev) => ({ ...prev, ...applyVisibilityChange(prev, platform, visible) })),
    [],
  );

  const onRefreshAll = useCallback(() => {
    patchUi({ isRefreshing: true });
    window.setTimeout(() => {
      const now = Date.now();
      setAgState((p) => ({ ...p, usageCache: refreshAllAntigravityCache(p.usageCache, now) }));
      setCodexState((p) => ({ ...p, usageCache: refreshAllCodexCache(p.usageCache, now) }));
      patchUi({ isRefreshing: false });
      showToast("Refreshed all demo quotas", "success");
    }, 350);
  }, [patchUi, showToast]);

  const onResetDemo = useCallback(() => {
    setAgState(createInitialAntigravityState());
    setActiveAntigravityId("ag-studio-ultra");
    setCodexState(createInitialCodexState());
    setActiveCodexId("codex-pro-main");
    setClaudeState(createInitialClaudeState());
    setTrackedIds(cloneDefaultTrackedIds());
    patchUi({
      searchQuery: "",
      platformVisibility: { ...DEFAULT_PLATFORM_VISIBILITY },
      poolRoutingEnabled: true,
    });
    showToast("Demo data reset to defaults", "info");
  }, [patchUi, showToast]);

  const actions = useDemoAccountActions({
    agState,
    setAgState,
    setActiveAntigravityId,
    codexState,
    setCodexState,
    setActiveCodexId,
    setCodexModelScanProgress,
    setClaudeState,
    setRefreshingClaudeIds,
    setTrackedIds,
    poolRoutingEnabled: ui.poolRoutingEnabled,
    patchUi,
    toggleTrack,
    showToast,
  });

  const { overlayCards, primaryOverlayData } = useMemo(
    () =>
      buildDemoOverlayAccounts({
        trackedIds,
        antigravityAccounts: agState.accounts,
        antigravityUsageCache: agState.usageCache,
        localAntigravitySession: agState.localSession,
        codexAccounts: codexState.accounts,
        codexUsageCache: codexState.usageCache,
        claudeAccountStatuses: claudeState.accountStatuses,
        claudeResetCredits: claudeState.resetCredits,
      }),
    [trackedIds, agState, codexState, claudeState],
  );

  return {
    ...ui,
    ...actions,
    isDarkMode,
    onToggleTheme: () => setIsDarkMode((v) => !v),
    setActiveSurface: (activeSurface) => patchUi({ activeSurface }),
    onResetDemo,
    setActiveTab: (activeTab) => patchUi({ activeTab }),
    onCardLayoutModeChange: (cardLayoutMode) => patchUi({ cardLayoutMode }),
    onPlatformVisibilityChange,
    setSearchQuery: (searchQuery) => patchUi({ searchQuery }),
    setSettingsOpen: (settingsOpen) => patchUi({ settingsOpen }),
    onRefreshAll,
    onToggleKeepAlive: () => setUi((p) => ({ ...p, keepAliveActive: !p.keepAliveActive })),
    onTogglePersistentWorkers: () =>
      setUi((p) => ({ ...p, persistentWorkers: !p.persistentWorkers })),
    setTrackedPollInterval: (trackedPollInterval) => patchUi({ trackedPollInterval }),
    setIdlePollInterval: (idlePollInterval) => patchUi({ idlePollInterval }),
    onDisplayModeChange: (displayMode) =>
      patchUi(
        displayMode === "overlay" || displayMode === "taskbar"
          ? { displayMode, activeSurface: displayMode }
          : { displayMode },
      ),
    antigravityAccounts: agState.accounts,
    activeAntigravityId,
    antigravityUsageCache: agState.usageCache,
    lastFullStatus: agState.lastFullStatus,
    localAntigravitySession: agState.localSession,
    codexAccounts: codexState.accounts,
    activeCodexId,
    setActiveCodexId,
    codexUsageCache: codexState.usageCache,
    codexModelCache: codexState.modelCache,
    setCodexSection: (codexSection) => patchUi({ codexSection }),
    modelPoolsV2: codexState.modelPoolsV2,
    routerStatus: codexState.routerStatus,
    codexModelScanProgress,
    claudeMonitorStatus: claudeState.monitorStatus,
    claudeAccountStatuses: claudeState.accountStatuses,
    claudeResetCredits: claudeState.resetCredits,
    refreshingClaudeIds,
    setClaudePollIntervalSecs: (claudePollIntervalSecs) => patchUi({ claudePollIntervalSecs }),
    setClaudeStopThresholdPct: (claudeStopThresholdPct) => patchUi({ claudeStopThresholdPct }),
    claudeAutoStopArmed: ui.claudeStopThresholdPct > 0,
    trackedIds,
    trackedCount: countTrackedIds(trackedIds),
    overlayCards,
    primaryOverlayData,
    toast,
    dismissToast,
    showToast,
  };
}
