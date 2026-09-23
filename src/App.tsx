import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGlobalShortcuts } from "./utils/common/use-global-shortcuts";
import { savePersistentWorkerPreference } from "./utils";
import { CODEX_ACTIVE_ID_KEY } from "./utils/common/app-constants";
import {
  sanitizePollInterval,
  savePollIntervalPreference,
  saveIdlePollIntervalPreference,
} from "./utils/common/poll-interval";
import { useCardLayoutMode } from "./hooks/desktop/useCardLayoutMode";
import { useAppInAppShortcuts } from "./hooks/app/useAppInAppShortcuts";
import { Header } from "./components/common/Header";
import { AntigravityTab } from "./components/antigravity/AntigravityTab";
import { CodexTab } from "./components/codex/CodexTab";
import { ClaudeTab } from "./components/claude/ClaudeTab";
import { Toast, ToastKind, ToastMessage } from "./components/common/Toast";
import { Tooltip } from "./components/common/Tooltip";
import { useAppCoordinator } from "./hooks/app/useAppCoordinator";
import { AppModals } from "./components/app/AppModals";
import { AppTabBar } from "./components/app/AppTabBar";
export const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const { cardLayoutMode, handleCardLayoutModeChange } = useCardLayoutMode();
  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    setToast({ id: Date.now(), message, kind, durationMs: 3000 });
  }, []);
  const coord = useAppCoordinator(showToast);
  const shortcutUi = useAppInAppShortcuts(coord, cardLayoutMode, handleCardLayoutModeChange);
  const {
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
    activeCodexPoolId,
    persistentWorkers,
    setPersistentWorkers,
    pollInterval,
    setPollInterval,
    idlePollInterval,
    setIdlePollInterval,
    platformVisibility,
    handlePlatformVisibilityChange,
    handleRenameAntigravity,
    handleRenameCodex,
    handleReorderAntigravity,
    handleReorderCodex,
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
  } = coord;
  const { poolRoutingEnabled, poolRoutingBusy, routerStatus, handleToggleCodexPoolRouting } =
    codexRouter;
  const {
    handleDeleteCodexPool,
    handleActivateCodexPool,
    handleDeleteCodexAccount,
    handleApplyCodexAccount,
    handleTrackCurrentCodexAccount,
    handleSwitchBestCodex,
    trackingCurrentProvider,
  } = accountOps;
  const {
    codexModelScanProgress,
    handleRescanAllCodexModels,
    codexModelCache,
    fetchCodexModelCatalog,
  } = codexModelScan;
  const {
    claudeMonitorStatus,
    claudeAccountStatuses,
    claudePollIntervalSecs,
    handleClaudePollIntervalChange,
    claudeStopThresholdPct,
    handleClaudeStopThresholdChange,
    claudeAutoStopArmed,
    handleResumeClaudeAccount,
    refreshingClaudeAccountIds,
    refreshClaudeAccountUsage,
    handleReorderClaudeAccounts,
  } = claudeMonitor;
  const handleTogglePersistentWorkers = async () => {
    const next = !persistentWorkers;
    setPersistentWorkers(next);
    savePersistentWorkerPreference(next);
  };
  const handlePollIntervalChange = async (val: number) => {
    const sanitized = sanitizePollInterval(val);
    savePollIntervalPreference(sanitized);
    setPollInterval(sanitized);
    await invoke("set_poll_interval", { seconds: sanitized });
  };
  const handleIdlePollIntervalChange = (val: number) => {
    const sanitized = sanitizePollInterval(val);
    saveIdlePollIntervalPreference(sanitized);
    setIdlePollInterval(sanitized);
  };
  const {
    isDarkMode,
    handleToggleTheme,
    isOnline,
    statusText,
    keepAliveActive,
    handleToggleKeepAlive,
    overlayEnabled,
    handleToggleOverlay,
  } = themeAndOverlay;
  useGlobalShortcuts(handleToggleOverlay, () => bootstrap.triggerRefresh(true));
  const { trackedAccountId, trackedProvider, handleTrackClaude } = usageAndOverlay;

  return (
    <div className="app-container" data-card-mode={cardLayoutMode}>
      <Header
        updateAvailable={bootstrap.updateAvailable}
        updateTag={bootstrap.updateTag}
        isDownloadingUpdate={false}
        onTriggerUpdate={bootstrap.handleCheckUpdate}
        pollInterval={pollInterval}
        onPollIntervalChange={handlePollIntervalChange}
        trackedPollInterval={pollInterval}
        onTrackedPollIntervalChange={handlePollIntervalChange}
        idlePollInterval={idlePollInterval}
        onIdlePollIntervalChange={handleIdlePollIntervalChange}
        isRefreshing={bootstrap.isRefreshing}
        onRefresh={() => bootstrap.triggerRefresh(true)}
        onExportBackup={backups.handleExportBackup}
        onImportBackup={backups.handleImportBackup}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        statusText={statusText}
        keepAliveActive={keepAliveActive}
        onToggleKeepAlive={handleToggleKeepAlive}
        persistentWorkersEnabled={persistentWorkers}
        onTogglePersistentWorkers={handleTogglePersistentWorkers}
        codexModelScanProgress={codexModelScanProgress}
        onRescanAllCodexModels={handleRescanAllCodexModels}
        overlayEnabled={overlayEnabled}
        onToggleOverlay={handleToggleOverlay}
        settingsOpen={shortcutUi.settingsOpen}
        onOpenSettings={shortcutUi.onOpenSettings}
        onCloseSettings={shortcutUi.onCloseSettings}
        cardLayoutMode={cardLayoutMode}
        onCardLayoutModeChange={handleCardLayoutModeChange}
        platformVisibility={platformVisibility}
        onPlatformVisibilityChange={handlePlatformVisibilityChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <AppTabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        platformVisibility={platformVisibility}
      />
      {platformVisibility[activeTab] &&
        (activeTab === "antigravity" ? (
          <AntigravityTab
            accounts={antigravityAccounts}
            activeId={activeAntigravityId}
            appliedId={activeAntigravityId}
            trackedAccountId={trackedAccountId}
            trackedProvider={trackedProvider}
            lastFullStatus={bootstrap.lastFullStatus}
            localSession={localSession.localAntigravitySession}
            antigravityUsageCache={usageAndOverlay.antigravityUsageCache}
            onApply={accountOps.handleApplyAntigravityAccount}
            onDelete={accountOps.handleDeleteAntigravityAccount}
            onRename={handleRenameAntigravity}
            onTrack={usageAndOverlay.handleTrackAntigravityAccount}
            onTrackCurrentAccount={accountOps.handleTrackCurrentAntigravityAccount}
            isTrackingCurrentAccount={accountOps.trackingCurrentProvider === "antigravity"}
            onRefreshQuota={(acc) => refreshAntigravityAccountsCloudFirst([acc], true)}
            onSwitchBest={accountOps.handleSwitchBestAntigravity}
            onReorder={handleReorderAntigravity}
            onAddAccountClick={() => setAddAgOpen(true)}
            searchQuery={searchQuery}
          />
        ) : activeTab === "codex" ? (
          <CodexTab
            accounts={codexAccounts}
            activeId={activeCodexId}
            appliedId={activeCodexId}
            trackedAccountId={trackedAccountId}
            trackedProvider={trackedProvider}
            lastFullStatus={bootstrap.lastFullStatus}
            codexUsageCache={usageAndOverlay.codexUsageCache}
            pools={codexPools}
            activePoolId={activeCodexPoolId}
            onApply={(acc) => handleApplyCodexAccount(acc)}
            onDelete={handleDeleteCodexAccount}
            onRename={handleRenameCodex}
            onTrack={usageAndOverlay.handleTrackCodexAccount}
            onTrackCurrentAccount={handleTrackCurrentCodexAccount}
            isTrackingCurrentAccount={trackingCurrentProvider === "codex"}
            onSelect={(acc) => {
              setActiveCodexId(acc.id);
              localStorage.setItem(CODEX_ACTIVE_ID_KEY, acc.id);
            }}
            onRefresh={(acc) => usageAndOverlay.fetchAccountUsage(acc, true)}
            onSwitchBest={handleSwitchBestCodex}
            onReorder={handleReorderCodex}
            onAddAccountClick={() => setIsCodexModalOpen(true)}
            onNewPool={() => {
              setEditingPool(null);
              setPoolModalOpen(true);
            }}
            onEditPool={(p) => {
              setEditingPool(p);
              setPoolModalOpen(true);
            }}
            onDeletePool={handleDeleteCodexPool}
            onActivatePool={handleActivateCodexPool}
            poolRoutingEnabled={poolRoutingEnabled}
            poolRoutingBusy={poolRoutingBusy}
            routerStatus={routerStatus}
            onTogglePoolRouting={handleToggleCodexPoolRouting}
            codexModelCache={codexModelCache}
            onRescanModels={async (account) => {
              await fetchCodexModelCatalog(account, true);
            }}
            searchQuery={searchQuery}
          />
        ) : (
          <ClaudeTab
            status={claudeMonitorStatus}
            accountStatuses={claudeAccountStatuses}
            resetCreditsByAccountId={usageAndOverlay.resetCreditsByAccountId}
            trackedAccountId={trackedAccountId}
            refreshingAccountIds={refreshingClaudeAccountIds}
            onRefreshAccount={refreshClaudeAccountUsage}
            onResumeAccount={handleResumeClaudeAccount}
            onReorder={handleReorderClaudeAccounts}
            isTracked={trackedProvider === "claude"}
            onTrackClaudeAccount={handleTrackClaude}
            onTrackCurrentAccount={() =>
              claudeMonitor
                .handleResolveCurrentClaudeAccount()
                .then((account) => (account ? handleTrackClaude(account) : undefined))
            }
            isTrackingCurrentAccount={claudeMonitor.isResolvingCurrentClaudeAccount}
            onAddProfilePath={claudeMonitor.handleAddClaudeProfilePath}
            addAccountRequestId={shortcutUi.claudeAddRequestId}
            searchQuery={searchQuery}
            claudePollIntervalSecs={claudePollIntervalSecs}
            onClaudePollIntervalChange={handleClaudePollIntervalChange}
            claudeStopThresholdPct={claudeStopThresholdPct}
            onClaudeStopThresholdChange={handleClaudeStopThresholdChange}
            autoStopArmed={claudeAutoStopArmed}
          />
        ))}
      <AppModals
        addAgOpen={addAgOpen}
        setAddAgOpen={setAddAgOpen}
        isCodexModalOpen={isCodexModalOpen}
        setIsCodexModalOpen={setIsCodexModalOpen}
        poolModalOpen={poolModalOpen}
        setPoolModalOpen={setPoolModalOpen}
        editingPool={editingPool}
        antigravityAccounts={antigravityAccounts}
        setAntigravityAccounts={setAntigravityAccounts}
        setActiveAntigravityId={setActiveAntigravityId}
        codexAccounts={codexAccounts}
        setCodexAccounts={setCodexAccounts}
        codexModelCache={codexModelCache}
        fetchCodexModelCatalog={fetchCodexModelCatalog}
        refreshAntigravityAccountsCloudFirst={refreshAntigravityAccountsCloudFirst}
        handleLocalSessionCaptured={localSession.handleLocalAntigravitySessionCaptured}
        backups={backups}
        bootstrap={bootstrap}
        accountOps={accountOps}
        usageAndOverlay={usageAndOverlay}
        showToast={showToast}
      />
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
      <Tooltip />
    </div>
  );
};
