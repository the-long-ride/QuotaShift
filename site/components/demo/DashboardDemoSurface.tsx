import React, { useMemo } from "react";
import { Header } from "../../../src/components/common/header/Header";
import { AppTabBar } from "../../../src/components/app/AppTabBar";
import { AntigravityTab } from "../../../src/components/antigravity/AntigravityTab";
import { CodexTab } from "../../../src/components/codex/CodexTab";
import { ClaudeTab } from "../../../src/components/claude/ClaudeTab";
import { Toast } from "../../../src/components/common/Toast";
import { Tooltip } from "../../../src/components/common/Tooltip";
import type { DemoCoordinator } from "../../hooks/useDemoCoordinator";

export interface DashboardDemoSurfaceProps {
  coord: DemoCoordinator;
}

export const DashboardDemoSurface: React.FC<DashboardDemoSurfaceProps> = ({ coord }) => {
  const { primaryTrackedId, primaryTrackedProvider } = useMemo(() => {
    if (coord.trackedIds.antigravity.length > 0) {
      return {
        primaryTrackedId: coord.trackedIds.antigravity[0],
        primaryTrackedProvider: "antigravity" as const,
      };
    }
    if (coord.trackedIds.codex.length > 0) {
      return {
        primaryTrackedId: coord.trackedIds.codex[0],
        primaryTrackedProvider: "codex" as const,
      };
    }
    if (coord.trackedIds.claude.length > 0) {
      return {
        primaryTrackedId: coord.trackedIds.claude[0],
        primaryTrackedProvider: "claude" as const,
      };
    }
    return { primaryTrackedId: null, primaryTrackedProvider: null };
  }, [coord.trackedIds]);

  const enabledModelPoolsCount = useMemo(
    () => coord.modelPoolsV2.filter((pool) => pool.enabled).length,
    [coord.modelPoolsV2],
  );

  return (
    <>
      <div className="qs-demo-window">
        <div className="app-container" data-card-mode={coord.cardLayoutMode}>
          <Header
            updateAvailable={false}
            updateTag=""
            isDownloadingUpdate={false}
            onTriggerUpdate={() =>
              coord.showToast("QuotaShift is up to date (interactive browser demo)", "info")
            }
            pollInterval={coord.trackedPollInterval}
            onPollIntervalChange={coord.setTrackedPollInterval}
            trackedPollInterval={coord.trackedPollInterval}
            onTrackedPollIntervalChange={coord.setTrackedPollInterval}
            idlePollInterval={coord.idlePollInterval}
            onIdlePollIntervalChange={coord.setIdlePollInterval}
            isRefreshing={coord.isRefreshing}
            onRefresh={coord.onRefreshAll}
            onExportBackup={() =>
              coord.showToast(
                "Demo mode: Backup export downloads a local JSON file in the desktop app",
                "info",
              )
            }
            onImportBackup={() =>
              coord.showToast(
                "Demo mode: Backup import restores accounts in the desktop app",
                "info",
              )
            }
            onExportCredentials={() =>
              coord.showToast("Demo mode: Encrypted credential export is desktop-only", "info")
            }
            onImportCredentials={() =>
              coord.showToast("Demo mode: Encrypted credential import is desktop-only", "info")
            }
            isDarkMode={coord.isDarkMode}
            onToggleTheme={coord.onToggleTheme}
            routerStatus={coord.routerStatus}
            poolRoutingBusy={false}
            enabledModelPoolsCount={enabledModelPoolsCount}
            onTogglePoolRouting={coord.onTogglePoolRouting}
            onOpenModelRouting={() => {
              coord.setActiveTab("codex");
              coord.setCodexSection("pools");
            }}
            keepAliveActive={coord.keepAliveActive}
            onToggleKeepAlive={coord.onToggleKeepAlive}
            persistentWorkersEnabled={coord.persistentWorkers}
            onTogglePersistentWorkers={coord.onTogglePersistentWorkers}
            codexModelScanProgress={coord.codexModelScanProgress}
            onRescanAllCodexModels={coord.onRescanAllCodexModels}
            displayMode={coord.displayMode}
            onDisplayModeChange={coord.onDisplayModeChange}
            settingsOpen={coord.settingsOpen}
            onOpenSettings={() => coord.setSettingsOpen(true)}
            onCloseSettings={() => coord.setSettingsOpen(false)}
            cardLayoutMode={coord.cardLayoutMode}
            onCardLayoutModeChange={coord.onCardLayoutModeChange}
            platformVisibility={coord.platformVisibility}
            onPlatformVisibilityChange={coord.onPlatformVisibilityChange}
            searchQuery={coord.searchQuery}
            onSearchChange={coord.setSearchQuery}
          />

          <AppTabBar
            activeTab={coord.activeTab}
            setActiveTab={coord.setActiveTab}
            platformVisibility={coord.platformVisibility}
          />

          {coord.platformVisibility[coord.activeTab] &&
            (coord.activeTab === "antigravity" ? (
              <AntigravityTab
                accounts={coord.antigravityAccounts}
                activeId={coord.activeAntigravityId}
                appliedId={coord.activeAntigravityId}
                trackedAccountId={primaryTrackedId}
                trackedAccountIds={coord.trackedIds.antigravity}
                trackedProvider={primaryTrackedProvider}
                lastFullStatus={coord.lastFullStatus}
                localSession={coord.localAntigravitySession}
                antigravityUsageCache={coord.antigravityUsageCache}
                onApply={coord.onApplyAntigravity}
                onDelete={coord.onDeleteAntigravity}
                onRename={coord.onRenameAntigravity}
                onTrack={coord.onTrackAntigravity}
                onTrackCurrentAccount={() => {
                  const active = coord.antigravityAccounts.find(
                    (acc) => acc.id === coord.activeAntigravityId,
                  );
                  if (active) coord.onTrackAntigravity(active);
                }}
                isTrackingCurrentAccount={false}
                onRefreshQuota={coord.onRefreshAntigravityQuota}
                onSwitchBest={coord.onSwitchBestAntigravity}
                onReorder={coord.onReorderAntigravity}
                onAddAccountClick={() =>
                  coord.showToast(
                    "Demo mode: Adding real Google OAuth accounts requires the desktop app",
                    "info",
                  )
                }
                onReauthenticateAccount={(acc) =>
                  coord.showToast(
                    `Demo mode: Re-authenticated ${acc.email || acc.label}`,
                    "success",
                  )
                }
                searchQuery={coord.searchQuery}
              />
            ) : coord.activeTab === "codex" ? (
              <CodexTab
                accounts={coord.codexAccounts}
                activeId={coord.activeCodexId}
                appliedId={coord.activeCodexId}
                trackedAccountId={primaryTrackedId}
                trackedAccountIds={coord.trackedIds.codex}
                trackedProvider={primaryTrackedProvider}
                lastFullStatus={coord.lastFullStatus}
                codexUsageCache={coord.codexUsageCache}
                modelPoolsV2={coord.modelPoolsV2}
                onChangeModelPoolsV2={coord.onChangeModelPoolsV2}
                onApply={coord.onApplyCodex}
                onDelete={coord.onDeleteCodex}
                onRename={coord.onRenameCodex}
                onTrack={coord.onTrackCodex}
                onTrackCurrentAccount={() => {
                  const active = coord.codexAccounts.find((acc) => acc.id === coord.activeCodexId);
                  if (active) coord.onTrackCodex(active);
                }}
                isTrackingCurrentAccount={false}
                onSelect={(acc) => coord.setActiveCodexId(acc.id)}
                onRefresh={coord.onRefreshCodex}
                onSwitchBest={coord.onSwitchBestCodex}
                onReorder={coord.onReorderCodex}
                onAddAccountClick={() =>
                  coord.showToast(
                    "Demo mode: Sign in with ChatGPT is available in the desktop app",
                    "info",
                  )
                }
                onReauthenticateAccount={(acc) =>
                  coord.showToast(
                    `Demo mode: Re-authenticated ${acc.email || acc.label}`,
                    "success",
                  )
                }
                poolRoutingEnabled={coord.poolRoutingEnabled}
                poolRoutingBusy={false}
                routerStatus={coord.routerStatus}
                onTogglePoolRouting={coord.onTogglePoolRouting}
                codexModelCache={coord.codexModelCache}
                onRescanModels={coord.onRescanCodexAccountModels}
                searchQuery={coord.searchQuery}
                codexSection={coord.codexSection}
                onCodexSectionChange={coord.setCodexSection}
                showToast={coord.showToast}
              />
            ) : (
              <ClaudeTab
                status={coord.claudeMonitorStatus}
                modelPoolsV2={coord.modelPoolsV2}
                accountStatuses={coord.claudeAccountStatuses}
                resetCreditsByAccountId={coord.claudeResetCredits}
                trackedAccountId={primaryTrackedId}
                trackedAccountIds={coord.trackedIds.claude}
                refreshingAccountIds={coord.refreshingClaudeIds}
                onRefreshAccount={coord.onRefreshClaudeAccount}
                onResumeAccount={coord.onResumeClaudeAccount}
                onReorder={coord.onReorderClaude}
                onRenameAccount={coord.onRenameClaude}
                isTracked={coord.trackedIds.claude.length > 0}
                guardrailsActive={coord.claudeAutoStopArmed}
                onTrackClaudeAccount={coord.onTrackClaude}
                onTrackCurrentAccount={() => {
                  const first = coord.claudeAccountStatuses[0];
                  if (first) coord.onTrackClaude(first);
                }}
                isTrackingCurrentAccount={false}
                onAddProfilePath={async (configDir) => {
                  coord.showToast(`Demo mode: Registered Claude profile ${configDir}`, "info");
                }}
                onRescanProfiles={coord.onRescanClaudeProfiles}
                searchQuery={coord.searchQuery}
                claudePollIntervalSecs={coord.claudePollIntervalSecs}
                onClaudePollIntervalChange={coord.setClaudePollIntervalSecs}
                claudeStopThresholdPct={coord.claudeStopThresholdPct}
                onClaudeStopThresholdChange={coord.setClaudeStopThresholdPct}
                autoStopArmed={coord.claudeAutoStopArmed}
              />
            ))}

          {coord.toast && <Toast toast={coord.toast} onDismiss={coord.dismissToast} />}
        </div>
      </div>
      <Tooltip />
    </>
  );
};
