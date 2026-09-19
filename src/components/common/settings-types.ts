import type { UiAdjustmentPreferences } from "../../utils/common/ui-adjustment";
import type { PlatformId, PlatformVisibility } from "../../utils/common/platform-visibility";

export type SettingsTab = "poll" | "appearance" | "shortcuts" | "data" | "ui" | "logs" | "help";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  trackedPollInterval: number;
  onTrackedPollIntervalChange: (val: number) => void;
  idlePollInterval: number;
  onIdlePollIntervalChange: (val: number) => void;
  keepAliveActive: boolean;
  onToggleKeepAlive: () => void;
  persistentWorkersEnabled: boolean;
  onTogglePersistentWorkers: () => void;
  reduceClaudeLowUsageFrequency?: boolean;
  onToggleReduceClaudeLowUsageFrequency?: () => void;
  overlayEnabled?: boolean;
  onToggleOverlay?: () => void;
  codexModelScanProgress: {
    running: boolean;
    total: number;
    completed: number;
    succeeded: number;
    failed: number;
  };
  onRescanAllCodexModels: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  cardLayoutMode?: "compact" | "expanded";
  onCardLayoutModeChange?: (mode: "compact" | "expanded") => void;
  platformVisibility: PlatformVisibility;
  onPlatformVisibilityChange: (platform: PlatformId, visible: boolean) => void;
  uiAdjustment: UiAdjustmentPreferences;
  onUiAdjustmentChange: (preferences: UiAdjustmentPreferences) => void;
}
