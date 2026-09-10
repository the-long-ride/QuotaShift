import React, { useRef, useState, useEffect } from "react";
import logo from "../../assets/icons/quota-shift-logo.png";
import {
  UpdateIcon,
  RefreshIcon,
  GearIcon,
  ClockIcon,
  WorkerIcon,
  DesktopOverlayIcon,
  ExportBackupIcon,
  ImportBackupIcon,
  ThemeIcon,
} from "./HeaderIcons";

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
  pollInterval: number;
  onPollIntervalChange: (val: number) => void;
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
}

export const Header: React.FC<HeaderProps> = ({
  updateAvailable,
  updateTag,
  isDownloadingUpdate,
  onTriggerUpdate,
  pollInterval,
  onPollIntervalChange,
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
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [gearMenuOpen, setGearMenuOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearMenuOpen(false);
      }
    };
    if (gearMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [gearMenuOpen]);

  const handlePollChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 5) {
      val = 5;
    }
    onPollIntervalChange(val);
  };

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
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
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

        <div className="header-poll-rate">
          <label htmlFor="poll-interval" className="setting-label">
            Poll Rate (sec)
          </label>
          <input
            type="number"
            id="poll-interval"
            min="5"
            max="3600"
            value={pollInterval}
            onChange={handlePollChange}
            className="setting-input"
          />
        </div>

        <button
          className={`refresh-btn ${isRefreshing ? "spinning" : ""}`}
          onClick={onRefresh}
          disabled={isRefreshing}
          data-tooltip="Refresh quota status for all accounts"
        >
          <RefreshIcon />
        </button>

        <div className="gear-menu-wrapper" ref={gearRef}>
          <button
            className={`gear-menu-btn ${gearMenuOpen ? "gear-menu-btn--active" : ""}`}
            onClick={() => setGearMenuOpen(!gearMenuOpen)}
            data-tooltip="Settings"
          >
            <GearIcon />
          </button>

          {gearMenuOpen && (
            <div className="gear-dropdown">
              <button
                className="gear-dropdown-item"
                onClick={() => {
                  onToggleKeepAlive();
                  setGearMenuOpen(false);
                }}
              >
                <ClockIcon />
                <span>Keep-Alive</span>
                <span
                  className={`gear-toggle-dot ${keepAliveActive ? "gear-toggle-dot--on" : ""}`}
                />
              </button>

              <button
                className="gear-dropdown-item"
                onClick={() => {
                  onTogglePersistentWorkers();
                  setGearMenuOpen(false);
                }}
                title="Experimental: keep isolated Antigravity quota workers running"
              >
                <WorkerIcon />
                <span>
                  Persistent AG Monitor <strong style={{ fontSize: "8px" }}>Experimental</strong>
                </span>
                <span
                  className={`gear-toggle-dot ${persistentWorkersEnabled ? "gear-toggle-dot--on" : ""}`}
                />
              </button>

              {onToggleOverlay && (
                <button
                  className="gear-dropdown-item"
                  onClick={() => {
                    onToggleOverlay();
                    setGearMenuOpen(false);
                  }}
                  title="Toggle on-screen floating desktop overlay widget"
                >
                  <DesktopOverlayIcon />
                  <span>Desktop Overlay</span>
                  <span
                    className={`gear-toggle-dot ${overlayEnabled ? "gear-toggle-dot--on" : ""}`}
                  />
                </button>
              )}

              <div className="gear-dropdown-divider" />

              <button
                className="gear-dropdown-item"
                disabled={codexModelScanProgress.running}
                onClick={() => {
                  onRescanAllCodexModels();
                  setGearMenuOpen(false);
                }}
                aria-label="Rescan all Codex models"
              >
                {codexModelScanProgress.running ? (
                  <span
                    className="codex-spinner"
                    style={{ width: "10px", height: "10px", borderWidth: "1.5px", flexShrink: 0 }}
                    aria-hidden="true"
                  />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 7h-5V2M4 17h5v5M19 5a8 8 0 0 0-13.6 2M5 19a8 8 0 0 0 13.6-2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <span>
                  {codexModelScanProgress.running
                    ? `Scanning ${codexModelScanProgress.completed} / ${codexModelScanProgress.total}`
                    : "Rescan all Codex models"}
                </span>
              </button>

              <div className="gear-dropdown-divider" />

              <button
                className="gear-dropdown-item"
                onClick={() => {
                  onExportBackup();
                  setGearMenuOpen(false);
                }}
              >
                <ExportBackupIcon />
                <span>Export Backup</span>
              </button>

              <button
                className="gear-dropdown-item"
                onClick={() => {
                  handleImportClick();
                  setGearMenuOpen(false);
                }}
              >
                <ImportBackupIcon />
                <span>Import Backup</span>
              </button>
            </div>
          )}
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json,.enc"
          style={{ display: "none" }}
        />

        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          data-tooltip="Toggle interface color mode between light and dark"
        >
          <ThemeIcon isDarkMode={isDarkMode} />
        </button>

        <div className={`status-indicator ${!isOnline ? "offline" : ""}`} id="status-indicator">
          <span className="status-dot"></span>
          <span className="status-text">{statusText}</span>
        </div>
      </div>
    </header>
  );
};
