import type { OverlayAccountData } from "../../src/utils/common/overlay-types";
import type {
  AntigravityAccount,
  AntigravityUsageCacheEntry,
  ClaudeAccount,
  ClaudeAccountUsageStatus,
  ClaudeMonitorStatus,
  CodexAccount,
  CodexModelCatalogCacheEntry,
  CodexModelPoolV2,
  CodexRouterStatus,
  FullStatus,
  LocalAntigravitySession,
} from "../../src/utils/common/types";
import type { ClaudeResetCredits } from "../../src/utils/claude/claude-reset-credits";
import type { CodexModelScanProgress } from "../../src/components/common/header/header-types";
import type { ToastKind, ToastMessage } from "../../src/components/common/Toast";
import {
  DEFAULT_PLATFORM_VISIBILITY,
  type PlatformId,
  type PlatformVisibility,
} from "../../src/utils/common/ui/platform-visibility";
import type { DisplayMode } from "../../src/utils/common/settings/display-mode";
import type { DemoCodexUsageCacheEntry } from "../data/demo-codex";

export type DemoSurfaceId = "dashboard" | "overlay" | "taskbar";

export interface DemoTrackedIds {
  antigravity: string[];
  codex: string[];
  claude: string[];
}

export const DEFAULT_DEMO_TRACKED_IDS: DemoTrackedIds = {
  antigravity: ["ag-studio-ultra"],
  codex: ["codex-pro-main"],
  claude: ["claude-work"],
};

export interface DemoUiState {
  activeSurface: DemoSurfaceId;
  activeTab: PlatformId;
  cardLayoutMode: "compact" | "expanded";
  platformVisibility: PlatformVisibility;
  searchQuery: string;
  settingsOpen: boolean;
  isRefreshing: boolean;
  keepAliveActive: boolean;
  persistentWorkers: boolean;
  trackedPollInterval: number;
  idlePollInterval: number;
  displayMode: DisplayMode;
  codexSection: "accounts" | "pools";
  poolRoutingEnabled: boolean;
  claudePollIntervalSecs: number;
  claudeStopThresholdPct: number;
}

export interface DemoCoordinator {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  activeSurface: DemoSurfaceId;
  setActiveSurface: (surface: DemoSurfaceId) => void;
  onResetDemo: () => void;
  activeTab: PlatformId;
  setActiveTab: (tab: PlatformId) => void;
  cardLayoutMode: "compact" | "expanded";
  onCardLayoutModeChange: (mode: "compact" | "expanded") => void;
  platformVisibility: PlatformVisibility;
  onPlatformVisibilityChange: (platform: PlatformId, visible: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  isRefreshing: boolean;
  onRefreshAll: () => void;
  keepAliveActive: boolean;
  onToggleKeepAlive: () => void;
  persistentWorkers: boolean;
  onTogglePersistentWorkers: () => void;
  trackedPollInterval: number;
  setTrackedPollInterval: (val: number) => void;
  idlePollInterval: number;
  setIdlePollInterval: (val: number) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  antigravityAccounts: AntigravityAccount[];
  activeAntigravityId: string | null;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  lastFullStatus: FullStatus;
  localAntigravitySession: LocalAntigravitySession;
  onApplyAntigravity: (acc: AntigravityAccount) => Promise<void>;
  onDeleteAntigravity: (acc: AntigravityAccount) => Promise<void>;
  onRenameAntigravity: (acc: AntigravityAccount, newLabel: string) => void;
  onTrackAntigravity: (acc: AntigravityAccount) => void;
  onRefreshAntigravityQuota: (acc: AntigravityAccount) => void;
  onSwitchBestAntigravity: () => void;
  onReorderAntigravity: (orderedIds: string[]) => void;
  codexAccounts: CodexAccount[];
  activeCodexId: string | null;
  setActiveCodexId: (id: string | null) => void;
  codexUsageCache: Record<string, DemoCodexUsageCacheEntry>;
  codexModelCache: Record<string, CodexModelCatalogCacheEntry>;
  codexSection: "accounts" | "pools";
  setCodexSection: (section: "accounts" | "pools") => void;
  modelPoolsV2: CodexModelPoolV2[];
  onChangeModelPoolsV2: (next: CodexModelPoolV2[]) => boolean;
  poolRoutingEnabled: boolean;
  onTogglePoolRouting: () => void;
  routerStatus: CodexRouterStatus;
  codexModelScanProgress: CodexModelScanProgress;
  onRescanAllCodexModels: () => void;
  onRescanCodexAccountModels: (acc: CodexAccount) => void;
  onApplyCodex: (acc: CodexAccount) => void;
  onDeleteCodex: (acc: CodexAccount) => void;
  onRenameCodex: (acc: CodexAccount, newLabel: string) => void;
  onTrackCodex: (acc: CodexAccount) => void;
  onRefreshCodex: (acc: CodexAccount) => void;
  onSwitchBestCodex: () => void;
  onReorderCodex: (orderedIds: string[]) => void;
  claudeMonitorStatus: ClaudeMonitorStatus;
  claudeAccountStatuses: ClaudeAccountUsageStatus[];
  claudeResetCredits: Record<string, ClaudeResetCredits>;
  refreshingClaudeIds: Set<string>;
  claudePollIntervalSecs: number;
  setClaudePollIntervalSecs: (secs: number) => void;
  claudeStopThresholdPct: number;
  setClaudeStopThresholdPct: (pct: number) => void;
  claudeAutoStopArmed: boolean;
  onTrackClaude: (status: ClaudeAccountUsageStatus) => void;
  onRefreshClaudeAccount: (accountId: string) => void;
  onResumeClaudeAccount: (configDir: string) => void;
  onReorderClaude: (orderedIds: string[]) => void;
  onRenameClaude: (account: ClaudeAccount, newAlias: string) => void;
  onRescanClaudeProfiles: () => void;
  trackedIds: DemoTrackedIds;
  trackedCount: number;
  overlayCards: OverlayAccountData[];
  primaryOverlayData: OverlayAccountData | null;
  toast: ToastMessage | null;
  dismissToast: () => void;
  showToast: (message: string, kind?: ToastKind) => void;
}

export function createInitialDemoUiState(): DemoUiState {
  return {
    activeSurface: "dashboard",
    activeTab: "antigravity",
    cardLayoutMode: "expanded",
    platformVisibility: { ...DEFAULT_PLATFORM_VISIBILITY },
    searchQuery: "",
    settingsOpen: false,
    isRefreshing: false,
    keepAliveActive: true,
    persistentWorkers: true,
    trackedPollInterval: 15,
    idlePollInterval: 90,
    displayMode: "overlay",
    codexSection: "accounts",
    poolRoutingEnabled: true,
    claudePollIntervalSecs: 5,
    claudeStopThresholdPct: 90,
  };
}

export const cloneDefaultTrackedIds = (): DemoTrackedIds => ({
  antigravity: [...DEFAULT_DEMO_TRACKED_IDS.antigravity],
  codex: [...DEFAULT_DEMO_TRACKED_IDS.codex],
  claude: [...DEFAULT_DEMO_TRACKED_IDS.claude],
});

export const removeDemoTrackedId = (
  prev: DemoTrackedIds,
  provider: PlatformId,
  id: string,
): DemoTrackedIds => ({ ...prev, [provider]: prev[provider].filter((item) => item !== id) });

export const countTrackedIds = (ids: DemoTrackedIds): number =>
  ids.antigravity.length + ids.codex.length + ids.claude.length;

export function reorderByIds<T>(items: T[], orderedIds: string[], getId: (item: T) => string): T[] {
  const byId = new Map(items.map((item) => [getId(item), item]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
  const seen = new Set(orderedIds);
  return [...ordered, ...items.filter((item) => !seen.has(getId(item)))];
}

export function toggleDemoTrackedId(
  prev: DemoTrackedIds,
  provider: PlatformId,
  id: string,
): { next: DemoTrackedIds; action: "added" | "removed" | "max" } {
  const exists = prev[provider].includes(id);
  const total = countTrackedIds(prev);
  if (!exists && total >= 3) {
    return { next: prev, action: "max" };
  }
  const nextList = exists ? prev[provider].filter((item) => item !== id) : [...prev[provider], id];
  return { next: { ...prev, [provider]: nextList }, action: exists ? "removed" : "added" };
}
