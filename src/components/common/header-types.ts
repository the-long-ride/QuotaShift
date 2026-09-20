import type { PlatformId, PlatformVisibility } from "../../utils/common/platform-visibility";

export interface CodexModelScanProgress {
  running: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
}

export interface HeaderProps {
  updateAvailable: boolean;
  updateTag: string;
  isDownloadingUpdate: boolean;
  onTriggerUpdate: () => void;
  trackedPollInterval?: number;
  onTrackedPollIntervalChange?: (val: number) => void;
  idlePollInterval?: number;
  onIdlePollIntervalChange?: (val: number) => void;
  pollInterval?: number;
  onPollIntervalChange?: (val: number) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onExportBackup: () => void;
  onImportBackup: (content: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isOnline: boolean;
  statusText: string;
  keepAliveActive: boolean;
  onToggleKeepAlive: () => void;
  persistentWorkersEnabled: boolean;
  onTogglePersistentWorkers: () => void;
  reduceClaudeLowUsageFrequency?: boolean;
  onToggleReduceClaudeLowUsageFrequency?: () => void;
  codexModelScanProgress: CodexModelScanProgress;
  onRescanAllCodexModels: () => void;
  overlayEnabled?: boolean;
  onToggleOverlay?: () => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  cardLayoutMode?: "compact" | "expanded";
  onCardLayoutModeChange?: (mode: "compact" | "expanded") => void;
  platformVisibility: PlatformVisibility;
  onPlatformVisibilityChange: (platform: PlatformId, visible: boolean) => void;
}
