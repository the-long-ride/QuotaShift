import React, { useState, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import appPackage from "../../../package.json";
import { ThemeIcon } from "./HeaderIcons";

// Recommended ranges (in seconds)
const TRACKED_MIN = 30;
const TRACKED_MAX = 120;
const IDLE_MIN = 300; // 5 min
const IDLE_MAX = 900; // 15 min
const CHANGELOG_URL = "https://github.com/the-long-ride/QuotaShift/blob/main/CHANGELOG.md";

interface SettingsModalProps {
  isOpen: boolean; onClose: () => void; isDarkMode?: boolean; onToggleTheme?: () => void;
  trackedPollInterval: number; onTrackedPollIntervalChange: (val: number) => void;
  idlePollInterval: number; onIdlePollIntervalChange: (val: number) => void;
  keepAliveActive: boolean; onToggleKeepAlive: () => void;
  persistentWorkersEnabled: boolean; onTogglePersistentWorkers: () => void;
  overlayEnabled?: boolean; onToggleOverlay?: () => void;
  codexModelScanProgress: { running: boolean; total: number; completed: number; succeeded: number; failed: number };
  onRescanAllCodexModels: () => void; onExportBackup: () => void; onImportBackup: () => void;
  cardLayoutMode?: "compact" | "expanded"; onCardLayoutModeChange?: (mode: "compact" | "expanded") => void;
}

const idleSecsToMinSec = (s: number) => ({ minutes: Math.floor(s / 60), seconds: s % 60 });
const minSecToSecs = (m: number, s: number) => m * 60 + s;
type WarningLevel = "low" | "high" | null;
const getTrackedWarning = (val: number): WarningLevel => (val < TRACKED_MIN ? "low" : val > TRACKED_MAX ? "high" : null);
const getIdleWarning = (totalSecs: number): WarningLevel => (totalSecs < IDLE_MIN ? "low" : totalSecs > IDLE_MAX ? "high" : null);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, isDarkMode = false, onToggleTheme, trackedPollInterval,
  onTrackedPollIntervalChange, idlePollInterval, onIdlePollIntervalChange, keepAliveActive,
  onToggleKeepAlive, persistentWorkersEnabled, onTogglePersistentWorkers, overlayEnabled = true,
  onToggleOverlay, codexModelScanProgress, onRescanAllCodexModels, onExportBackup, onImportBackup,
  cardLayoutMode = "expanded", onCardLayoutModeChange,
}) => {
  const [trackedVal, setTrackedVal] = useState(trackedPollInterval);
  const { minutes: initMins, seconds: initSecs } = idleSecsToMinSec(idlePollInterval);
  const [idleMinutes, setIdleMinutes] = useState(initMins);
  const [idleSeconds, setIdleSeconds] = useState(initSecs);

  // Sync if props change externally
  useEffect(() => { setTrackedVal(trackedPollInterval); }, [trackedPollInterval]);
  useEffect(() => {
    const { minutes, seconds } = idleSecsToMinSec(idlePollInterval);
    setIdleMinutes(minutes); setIdleSeconds(seconds);
  }, [idlePollInterval]);

  if (!isOpen) return null;
  const idleTotalSecs = minSecToSecs(idleMinutes, idleSeconds);
  const trackedWarn = getTrackedWarning(trackedVal), idleWarn = getIdleWarning(idleTotalSecs);

  const handleTrackedChange = (e: React.ChangeEvent<HTMLInputElement>) => { const v = parseInt(e.target.value, 10), val = isNaN(v) ? 0 : v; setTrackedVal(val); if (val >= 5) onTrackedPollIntervalChange(val); };
  const handleIdleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => { const v = parseInt(e.target.value, 10), mins = isNaN(v) ? 0 : Math.max(0, v); setIdleMinutes(mins); const total = minSecToSecs(mins, idleSeconds); if (total >= 5) onIdlePollIntervalChange(total); };
  const handleIdleSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => { const v = parseInt(e.target.value, 10), secs = isNaN(v) ? 0 : Math.max(0, Math.min(59, v)); setIdleSeconds(secs); const total = minSecToSecs(idleMinutes, secs); if (total >= 5) onIdlePollIntervalChange(total); };
  const handleOverlayClick = () => { onToggleOverlay?.(); };

  return (
    <div className="dialog-overlay settings-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-box settings-modal-box">
        {/* Header */}
        <div className="settings-modal-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Settings</span>
          <div className="settings-modal-header-actions">
            <button type="button" className="settings-modal-version-link" onClick={() => void openUrl(CHANGELOG_URL)} title="View changelog">v{appPackage.version}</button>
            {onToggleTheme && (
              <button
                type="button"
                className="settings-modal-theme-toggle"
                onClick={onToggleTheme}
                aria-label="Toggle theme"
                title="Toggle light/dark mode"
              >
                <ThemeIcon isDarkMode={isDarkMode} />
              </button>
            )}
            <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close settings">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="settings-modal-content">
          {/* ── Poll Rate Section ── */}
          <div className="settings-section">
            <div className="settings-section-title">Poll Rate</div>

            {/* Tracked Account Poll Rate */}
            <div className="settings-field">
              <div className="settings-field-label-row">
                <label className="settings-field-label" htmlFor="tracked-poll-rate">
                  Tracked Account Poll Rate
                </label>
                <span className="settings-field-hint">Recommended: 30 – 120 sec</span>
              </div>
              <div className="settings-input-row">
                <input
                  type="number"
                  id="tracked-poll-rate"
                  className={`settings-number-input ${trackedWarn ? `settings-number-input--${trackedWarn === "low" ? "warn" : "warn"}` : ""}`}
                  min={1}
                  max={3600}
                  value={trackedVal}
                  onChange={handleTrackedChange}
                />
                <span className="settings-unit">sec</span>
              </div>
              {trackedWarn === "low" && (
                <div className="settings-warning settings-warning--low">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Value too low — polling this frequently may harm performance and API rate limits.
                </div>
              )}
              {trackedWarn === "high" && (
                <div className="settings-warning settings-warning--high">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Value too high — quota changes may take too long to be detected.
                </div>
              )}
            </div>

            {/* Idle Accounts Poll Rate */}
            <div className="settings-field">
              <div className="settings-field-label-row">
                <label className="settings-field-label">
                  Other Idle Accounts Poll Rate
                </label>
                <span className="settings-field-hint">Recommended: 5 – 15 min</span>
              </div>
              <div className="settings-input-row">
                <input
                  type="number"
                  id="idle-poll-minutes"
                  className={`settings-number-input settings-number-input--wide ${idleWarn ? "settings-number-input--warn" : ""}`}
                  min={0}
                  max={999}
                  value={idleMinutes}
                  onChange={handleIdleMinutesChange}
                  aria-label="Idle poll rate minutes"
                />
                <span className="settings-unit">min</span>
                <input
                  type="number"
                  id="idle-poll-seconds"
                  className={`settings-number-input settings-number-input--wide ${idleWarn ? "settings-number-input--warn" : ""}`}
                  min={0}
                  max={59}
                  value={idleSeconds}
                  onChange={handleIdleSecondsChange}
                  aria-label="Idle poll rate seconds"
                />
                <span className="settings-unit">sec</span>
              </div>
              {idleWarn === "low" && (
                <div className="settings-warning settings-warning--low">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Value too low — polling idle accounts this frequently may harm performance.
                </div>
              )}
              {idleWarn === "high" && (
                <div className="settings-warning settings-warning--high">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Value too high — quota changes on idle accounts may take too long to detect.
                </div>
              )}
            </div>
          </div>

          <div className="settings-divider" />

          {/* ── Behavior Toggles ── */}
          <div className="settings-section">
            <div className="settings-section-title">Behavior</div>

            <button className="settings-toggle-row" onClick={onToggleKeepAlive}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                <polyline points="12 7 12 12 15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="settings-toggle-label">Keep-Alive</span>
              <span
                className={`codex-pool-switch ${keepAliveActive ? "codex-pool-switch--on" : ""}`}
                role="switch"
                aria-checked={keepAliveActive}
                aria-label="Keep-Alive"
              >
                <span className="codex-pool-switch-thumb" />
              </span>
            </button>

            {onToggleOverlay && (
              <button
                className="settings-toggle-row"
                onClick={handleOverlayClick}
                title="Toggle on-screen floating desktop overlay widget"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                  <rect x="6" y="6" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="13" y="6" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="6" y="13" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                <span className="settings-toggle-label">Desktop Overlay</span>
                <span
                  className={`codex-pool-switch ${overlayEnabled ? "codex-pool-switch--on" : ""}`}
                  role="switch"
                  aria-checked={overlayEnabled}
                  aria-label="Desktop Overlay"
                >
                  <span className="codex-pool-switch-thumb" />
                </span>
              </button>
            )}

            <button
              className="settings-toggle-row"
              onClick={onTogglePersistentWorkers}
              title="Experimental: keep isolated Antigravity quota workers running"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="1.8"/>
                <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span className="settings-toggle-label">
                Persistent AG Monitor <strong style={{ fontSize: "8px" }}>Experimental</strong>
              </span>
              <span
                className={`codex-pool-switch ${persistentWorkersEnabled ? "codex-pool-switch--on" : ""}`}
                role="switch"
                aria-checked={persistentWorkersEnabled}
                aria-label="Persistent AG Monitor"
              >
                <span className="codex-pool-switch-thumb" />
              </span>
            </button>

            <div className="settings-toggle-row settings-toggle-row--segmented">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
                <rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
              <span className="settings-toggle-label">Card View</span>
              <div className="settings-segmented-switch" role="group" aria-label="Card View Mode">
                <button
                  type="button"
                  className={`settings-segment-btn ${cardLayoutMode === "compact" ? "settings-segment-btn--active" : ""}`}
                  onClick={() => onCardLayoutModeChange?.("compact")}
                >
                  Compact
                </button>
                <button
                  type="button"
                  className={`settings-segment-btn ${cardLayoutMode === "expanded" ? "settings-segment-btn--active" : ""}`}
                  onClick={() => onCardLayoutModeChange?.("expanded")}
                >
                  Expand
                </button>
              </div>
            </div>
          </div>

          <div className="settings-divider" />

          {/* ── Data & Scanning ── */}
          <div className="settings-section">
            <div className="settings-section-title">Data</div>

            <button
              className="settings-action-row"
              disabled={codexModelScanProgress.running}
              onClick={() => onRescanAllCodexModels()}
              aria-label="Rescan all Codex models"
            >
              {codexModelScanProgress.running ? (
                <span
                  className="codex-spinner"
                  style={{ width: "11px", height: "11px", borderWidth: "1.5px", flexShrink: 0 }}
                  aria-hidden="true"
                />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12" aria-hidden="true">
                  <path d="M20 10L20 9C20 8.07003 20 7.60504 19.8978 7.22354C19.6204 6.18827 18.8117 5.37962 17.7765 5.10222C17.395 5 16.93 5 16 5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M20 14L20 15C20 15.93 20 16.395 19.8978 16.7765C19.6204 17.8117 18.8117 18.6204 17.7765 18.8978C17.395 19 16.93 19 16 19" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M10 19L9 19C7.13077 19 6.19615 19 5.5 18.5981C5.04394 18.3348 4.66523 17.9561 4.40192 17.5C4 16.8038 4 15.8692 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M10 5L9 5C7.13077 5 6.19615 5 5.5 5.40192C5.04394 5.66523 4.66523 6.04394 4.40192 6.5C4 7.19615 4 8.13077 4 10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M10 21L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span>
                {codexModelScanProgress.running
                  ? `Scanning ${codexModelScanProgress.completed} / ${codexModelScanProgress.total}`
                  : "Rescan all Codex models"}
              </span>
            </button>

            <div className="settings-divider" />

            <button className="settings-action-row" onClick={onExportBackup}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Export Backup</span>
            </button>

            <button className="settings-action-row" onClick={onImportBackup}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7 10 12 5 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="5" x2="12" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Import Backup</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
