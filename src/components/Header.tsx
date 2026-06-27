import React, { useRef, useState, useEffect } from "react";
import logo from "../../assets/icons/quota-shift-logo.png";

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
            data-tooltip={isDownloadingUpdate ? "Downloading update..." : `New version ${updateTag} is available. Click to update.`}
          >
            <svg className="update-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                className="download-arrow"
                d="M12 15V3m0 12l-4-4m4 4l4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                className="download-tray"
                d="M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
          <svg className="refresh-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-.73"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="gear-menu-wrapper" ref={gearRef}>
          <button
            className={`gear-menu-btn ${gearMenuOpen ? "gear-menu-btn--active" : ""}`}
            onClick={() => setGearMenuOpen(!gearMenuOpen)}
            data-tooltip="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </button>

          {gearMenuOpen && (
            <div className="gear-dropdown">
              <button
                className="gear-dropdown-item"
                onClick={() => { onToggleKeepAlive(); setGearMenuOpen(false); }}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13">
                  <path d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Keep-Alive</span>
                <span className={`gear-toggle-dot ${keepAliveActive ? "gear-toggle-dot--on" : ""}`} />
              </button>

              <div className="gear-dropdown-divider" />

              <button
                className="gear-dropdown-item"
                onClick={() => { onExportBackup(); setGearMenuOpen(false); }}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13">
                  <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7m-4-5l-4-4-4 4m4-4v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Export Backup</span>
              </button>

              <button
                className="gear-dropdown-item"
                onClick={() => { handleImportClick(); setGearMenuOpen(false); }}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13">
                  <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7m-4 1l-4 4-4-4m4 4V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
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
          {!isDarkMode ? (
            <svg
              className="theme-icon theme-icon--moon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              className="theme-icon theme-icon--sun"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
              <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <div className={`status-indicator ${!isOnline ? "offline" : ""}`} id="status-indicator">
          <span className="status-dot"></span>
          <span className="status-text">{statusText}</span>
        </div>
      </div>
    </header>
  );
};
