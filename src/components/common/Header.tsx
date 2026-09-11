import React, { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import logo from "../../../assets/icons/quota-shift-logo.png";
import {
  UpdateIcon,
  RefreshIcon,
  GearIcon,
} from "./HeaderIcons";
import { SettingsModal } from "./SettingsModal";
import {
  loadTrackedPollIntervalPreference,
  saveTrackedPollIntervalPreference,
  loadIdlePollIntervalPreference,
  saveIdlePollIntervalPreference,
  savePollIntervalPreference,
} from "../../utils/common/poll-interval";

interface CodexModelScanProgress {
  running: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
}

interface HeaderProps {
  updateAvailable: boolean;
  updateTag: string;
  isDownloadingUpdate: boolean;
  onTriggerUpdate: () => void;
  // tracked poll (seconds)
  trackedPollInterval?: number;
  onTrackedPollIntervalChange?: (val: number) => void;
  // idle poll (seconds)
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
  codexModelScanProgress: CodexModelScanProgress;
  onRescanAllCodexModels: () => void;
  overlayEnabled?: boolean;
  onToggleOverlay?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  cardLayoutMode?: "compact" | "expanded";
  onCardLayoutModeChange?: (mode: "compact" | "expanded") => void;
}

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
  codexModelScanProgress,
  onRescanAllCodexModels,
  overlayEnabled = true,
  onToggleOverlay,
  searchQuery: propSearchQuery,
  onSearchChange: propOnSearchChange,
  cardLayoutMode,
  onCardLayoutModeChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const isSearchControlled = propSearchQuery !== undefined;
  const searchQuery = isSearchControlled ? propSearchQuery : internalSearchQuery;

  const handleSearchChange = (val: string) => {
    if (!isSearchControlled) setInternalSearchQuery(val);
    propOnSearchChange?.(val);
  };

  const [trackedPollInterval, setTrackedPollInterval] = useState(() =>
    propTrackedPollInterval !== undefined ? propTrackedPollInterval : loadTrackedPollIntervalPreference()
  );
  const [idlePollInterval, setIdlePollInterval] = useState(() =>
    propIdlePollInterval !== undefined ? propIdlePollInterval : loadIdlePollIntervalPreference()
  );

  useEffect(() => {
    if (propTrackedPollInterval !== undefined) setTrackedPollInterval(propTrackedPollInterval);
  }, [propTrackedPollInterval]);

  useEffect(() => {
    if (propIdlePollInterval !== undefined) setIdlePollInterval(propIdlePollInterval);
  }, [propIdlePollInterval]);

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
    const onCancel = () => { invoke("show_dashboard").catch(() => {}); };
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, []);

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        try { await invoke("show_dashboard"); } catch {}
        onImportBackup(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <header className="app-header">
      <div className="header-logo">
        <img className="logo-icon" src={logo} alt="QuotaShift Logo" />
        <span className="app-title">QuotaShift</span>
      </div>

      <div className="header-search">
        <svg
          className="header-search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="header-search-input"
          placeholder="Search by name or email..."
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
            title="Clear search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="10" height="10">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
        >
          <RefreshIcon />
        </button>

        <button
          className={`gear-menu-btn ${settingsOpen ? "gear-menu-btn--active" : ""}`}
          onClick={() => setSettingsOpen(true)}
          data-tooltip="Settings"
        >
          <GearIcon />
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json,.enc"
          style={{ display: "none" }}
        />

        <div className={`status-indicator ${!isOnline ? "offline" : ""}`} id="status-indicator">
          <span className="status-dot"></span>
          <span className="status-text">{statusText}</span>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        trackedPollInterval={trackedPollInterval}
        onTrackedPollIntervalChange={handleTrackedPollIntervalChange}
        idlePollInterval={idlePollInterval}
        onIdlePollIntervalChange={handleIdlePollIntervalChange}
        keepAliveActive={keepAliveActive}
        onToggleKeepAlive={() => {
          onToggleKeepAlive();
        }}
        persistentWorkersEnabled={persistentWorkersEnabled}
        onTogglePersistentWorkers={() => {
          onTogglePersistentWorkers();
        }}
        overlayEnabled={overlayEnabled}
        onToggleOverlay={onToggleOverlay}
        codexModelScanProgress={codexModelScanProgress}
        onRescanAllCodexModels={() => {
          onRescanAllCodexModels();
          setSettingsOpen(false);
        }}
        onExportBackup={() => {
          onExportBackup();
          setSettingsOpen(false);
        }}
        onImportBackup={() => {
          handleImportClick();
          setSettingsOpen(false);
        }}
        cardLayoutMode={cardLayoutMode}
        onCardLayoutModeChange={onCardLayoutModeChange}
      />
    </header>
  );
};
