import React, { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoDarkTheme from "../../../assets/icons/quota-shift-logo-512.png";
import logoLightTheme from "../../../assets/icons/quota-shift-logo-dark-512.png";
import {
  UpdateIcon,
  RefreshIcon,
  GearIcon,
  HeaderSearchIcon,
  HeaderSearchClearIcon,
} from "./HeaderIcons";
import { SettingsModal } from "./SettingsModal";
import { WindowControls } from "./WindowControls";
import { WindowResizeHandles } from "./WindowResizeHandles";
import { QuitButton } from "./QuitButton";
import { useHeaderWindowActions } from "./useHeaderWindowActions";
import { useMainWindowZoom } from "../../hooks/useMainWindowZoom";
import { useShortcutPreferences } from "../../hooks/useShortcutPreferences";
import { formatShortcutDisplay } from "../../utils/common/shortcuts";
import {
  loadTrackedPollIntervalPreference,
  saveTrackedPollIntervalPreference,
  loadIdlePollIntervalPreference,
  saveIdlePollIntervalPreference,
  savePollIntervalPreference,
} from "../../utils/common/poll-interval";
import {
  UI_ADJUSTMENT_EVENT,
  loadUiAdjustmentPreferences,
  normalizeUiAdjustmentPreferences,
  saveUiAdjustmentPreferences,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";
import {
  CLAUDE_PREFERENCES_CHANGED_EVENT,
  loadClaudeLowUsageReductionPreference,
  saveClaudeLowUsageReductionPreference,
} from "../../utils/common/claude-preferences";
import { type HeaderProps } from "./header-types";
export const Header: React.FC<HeaderProps> = ({
  updateAvailable,
  updateTag,
  isDownloadingUpdate,
  onTriggerUpdate,
  trackedPollInterval: propTrackedPollInterval,
  onTrackedPollIntervalChange: propOnTrackedPollIntervalChange,
  idlePollInterval: propIdlePollInterval,
  onIdlePollIntervalChange: propOnIdlePollIntervalChange,
  pollInterval: _pollInterval,
  onPollIntervalChange: _onPollIntervalChange,
  isRefreshing,
  onRefresh,
  onExportBackup,
  onImportBackup,
  isDarkMode,
  onToggleTheme,
  isOnline,
  statusText,
  keepAliveActive,
  onToggleKeepAlive,
  persistentWorkersEnabled,
  onTogglePersistentWorkers,
  reduceClaudeLowUsageFrequency: propReduceClaudeLowUsage,
  onToggleReduceClaudeLowUsageFrequency: propOnToggleReduceClaudeLowUsage,
  codexModelScanProgress,
  onRescanAllCodexModels,
  overlayEnabled = true,
  onToggleOverlay,
  settingsOpen,
  onOpenSettings,
  onCloseSettings,
  searchQuery: propSearchQuery,
  onSearchChange: propOnSearchChange,
  cardLayoutMode,
  onCardLayoutModeChange,
  platformVisibility,
  onPlatformVisibilityChange,
}) => {
  useMainWindowZoom();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shortcuts = useShortcutPreferences();
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [uiAdjustment, setUiAdjustment] = useState<UiAdjustmentPreferences>(() =>
    loadUiAdjustmentPreferences(),
  );
  const isSearchControlled = propSearchQuery !== undefined;
  const searchQuery = isSearchControlled ? propSearchQuery : internalSearchQuery;
  const win = getCurrentWindow();
  const [trackedPollInterval, setTrackedPollInterval] = useState(() =>
    propTrackedPollInterval !== undefined
      ? propTrackedPollInterval
      : loadTrackedPollIntervalPreference(),
  );
  const [idlePollInterval, setIdlePollInterval] = useState(() =>
    propIdlePollInterval !== undefined ? propIdlePollInterval : loadIdlePollIntervalPreference(),
  );
  const [reduceClaudeLowUsage, setReduceClaudeLowUsage] = useState(() =>
    propReduceClaudeLowUsage !== undefined
      ? propReduceClaudeLowUsage
      : loadClaudeLowUsageReductionPreference(),
  );
  useEffect(() => {
    if (propReduceClaudeLowUsage !== undefined) {
      setReduceClaudeLowUsage(propReduceClaudeLowUsage);
    }
  }, [propReduceClaudeLowUsage]);
  useEffect(() => {
    const onSync = () => {
      setReduceClaudeLowUsage(loadClaudeLowUsageReductionPreference());
    };
    window.addEventListener(CLAUDE_PREFERENCES_CHANGED_EVENT, onSync);
    return () => window.removeEventListener(CLAUDE_PREFERENCES_CHANGED_EVENT, onSync);
  }, []);
  const handleToggleReduceClaudeLowUsage = () => {
    const next = !reduceClaudeLowUsage;
    setReduceClaudeLowUsage(next);
    saveClaudeLowUsageReductionPreference(next);
    propOnToggleReduceClaudeLowUsage?.();
  };
  useEffect(() => {
    if (propTrackedPollInterval !== undefined) setTrackedPollInterval(propTrackedPollInterval);
  }, [propTrackedPollInterval]);
  useEffect(() => {
    if (propIdlePollInterval !== undefined) setIdlePollInterval(propIdlePollInterval);
  }, [propIdlePollInterval]);
  useEffect(() => {
    const normalized = normalizeUiAdjustmentPreferences(uiAdjustment);
    if (JSON.stringify(normalized) !== JSON.stringify(uiAdjustment)) {
      setUiAdjustment(normalized);
      return;
    }
    const appTheme = isDarkMode ? "dark" : "light";
    const livePayload = { ...normalized, appTheme };
    saveUiAdjustmentPreferences(normalized);
    void Promise.allSettled([
      emitTo("overlay", UI_ADJUSTMENT_EVENT, livePayload),
      emitTo("overlay-tooltip", UI_ADJUSTMENT_EVENT, livePayload),
    ]);
  }, [uiAdjustment, isDarkMode]);
  const handleSearchChange = (val: string) => {
    if (!isSearchControlled) setInternalSearchQuery(val);
    propOnSearchChange?.(val);
  };
  const handleTrackedPollIntervalChange = (val: number) => {
    setTrackedPollInterval(val);
    saveTrackedPollIntervalPreference(val);
    savePollIntervalPreference(val);
    propOnTrackedPollIntervalChange?.(val);
    _onPollIntervalChange?.(val);
  };
  const handleIdlePollIntervalChange = (val: number) => {
    setIdlePollInterval(val);
    saveIdlePollIntervalPreference(val);
    propOnIdlePollIntervalChange?.(val);
  };
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const onCancel = () => {
      invoke("show_dashboard").catch(() => {});
    };
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, []);
  const { handleHeaderMouseDown, handleHeaderDoubleClick } = useHeaderWindowActions(win);
  const handleImportClick = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      try {
        await invoke("show_dashboard");
      } catch {}
      onImportBackup(content);
    };
    reader.readAsText(file);
  };
  return (
    <header
      className="app-header"
      onMouseDown={handleHeaderMouseDown}
      onDoubleClick={handleHeaderDoubleClick}
    >
      <div className="header-logo header-drag-region" data-tauri-drag-region>
        <img
          className="logo-icon"
          src={isDarkMode ? logoDarkTheme : logoLightTheme}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span className="app-title" data-tauri-drag-region>
          QuotaShift
        </span>
      </div>
      <div className="header-search">
        <HeaderSearchIcon />
        <input
          type="text"
          className="header-search-input"
          placeholder={`Search accounts... (${formatShortcutDisplay(shortcuts.focusSearch)})`}
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleSearchChange("");
          }}
          spellCheck={false}
          autoComplete="off"
        />
        {searchQuery && (
          <button
            type="button"
            className="header-search-clear"
            onClick={() => handleSearchChange("")}
            data-tooltip="Clear search"
            aria-label="Clear search"
          >
            <HeaderSearchClearIcon />
          </button>
        )}
      </div>
      <div className="header-right">
        {updateAvailable && (
          <button
            className={`update-btn ${isDownloadingUpdate ? "downloading" : ""}`}
            onClick={onTriggerUpdate}
            data-tooltip={
              isDownloadingUpdate
                ? "Downloading update..."
                : `New version ${updateTag} is available. Click to update.`
            }
          >
            <UpdateIcon />
          </button>
        )}
        <button
          className={`refresh-btn ${isRefreshing ? "spinning" : ""}`}
          onClick={onRefresh}
          disabled={isRefreshing}
          data-tooltip="Refresh quota status for all accounts"
          data-shortcut={shortcuts.refreshAll}
        >
          <RefreshIcon />
        </button>
        <button
          className={`gear-menu-btn ${settingsOpen ? "gear-menu-btn--active" : ""}`}
          onClick={onOpenSettings}
          data-tooltip="Settings"
          data-shortcut={shortcuts.openSettings}
        >
          <GearIcon />
        </button>
        <QuitButton shortcut={shortcuts.quitApp} />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json,.enc"
          style={{ display: "none" }}
        />
        <div className={`status-indicator ${!isOnline ? "offline" : ""}`} id="status-indicator">
          <span className="status-dot" />
          <span className="status-text">{statusText}</span>
        </div>
        <div className="window-controls-divider" aria-hidden="true" />
        <WindowControls />
      </div>
      <SettingsModal
        isOpen={settingsOpen}
        onClose={onCloseSettings}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        trackedPollInterval={trackedPollInterval}
        onTrackedPollIntervalChange={handleTrackedPollIntervalChange}
        idlePollInterval={idlePollInterval}
        onIdlePollIntervalChange={handleIdlePollIntervalChange}
        keepAliveActive={keepAliveActive}
        onToggleKeepAlive={onToggleKeepAlive}
        persistentWorkersEnabled={persistentWorkersEnabled}
        onTogglePersistentWorkers={onTogglePersistentWorkers}
        reduceClaudeLowUsageFrequency={reduceClaudeLowUsage}
        onToggleReduceClaudeLowUsageFrequency={handleToggleReduceClaudeLowUsage}
        overlayEnabled={overlayEnabled}
        onToggleOverlay={onToggleOverlay}
        codexModelScanProgress={codexModelScanProgress}
        onRescanAllCodexModels={() => {
          onRescanAllCodexModels();
          onCloseSettings();
        }}
        onExportBackup={() => {
          onExportBackup();
          onCloseSettings();
        }}
        onImportBackup={() => {
          handleImportClick();
          onCloseSettings();
        }}
        cardLayoutMode={cardLayoutMode}
        onCardLayoutModeChange={onCardLayoutModeChange}
        platformVisibility={platformVisibility}
        onPlatformVisibilityChange={onPlatformVisibilityChange}
        uiAdjustment={uiAdjustment}
        onUiAdjustmentChange={setUiAdjustment}
      />
      <WindowResizeHandles />
    </header>
  );
};
