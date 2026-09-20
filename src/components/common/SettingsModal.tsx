import React, { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import appPackage from "../../../package.json";
import { ThemeIcon } from "./HeaderIcons";
import { ShortcutSettings } from "./ShortcutSettings";
import { PollWarning } from "./PollWarning";
import { IdlePollField } from "./IdlePollField";
import { BehaviorSettingsSection } from "./BehaviorSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { LogsSettingsSection } from "./LogsSettingsSection";
import { HelpSettingsSection } from "./HelpSettingsSection";
import {
  SettingsGearIcon,
  SettingsCloseIcon,
  TrackedPollIcon,
  DataRescanIcon,
  ExportBackupIcon,
  ImportBackupIcon,
} from "./SettingsIcons";
import { OverlayAdjustmentGroup } from "./OverlayAdjustmentGroup";
import { OverlayPrimaryRow } from "./OverlayPrimaryRow";
import { type SettingsTab, type SettingsModalProps } from "./settings-types";
import { useSettingsPollState } from "./useSettingsPollState";
import { useSettingsModalTab } from "./useSettingsModalTab";
import { useShortcutPreferences } from "../../hooks/useShortcutPreferences";
import {
  UI_ADJUSTMENT_DEFAULTS,
  normalizeUiAdjustmentPreferences,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";

const POLL_MIN = 5;
const POLL_MAX = 1200;
const CHANGELOG_URL = "https://github.com/the-long-ride/QuotaShift/blob/main/CHANGELOG.md";

const SETTINGS_TABS: Array<[SettingsTab, string]> = [
  ["poll", "Monitoring"],
  ["appearance", "Appearance"],
  ["shortcuts", "Keyboard Shortcuts"],
  ["data", "Data"],
  ["ui", "Overlay"],
  ["logs", "Logs"],
  ["help", "Help"],
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
  onToggleTheme,
  trackedPollInterval,
  onTrackedPollIntervalChange,
  idlePollInterval,
  onIdlePollIntervalChange,
  keepAliveActive,
  onToggleKeepAlive,
  persistentWorkersEnabled,
  onTogglePersistentWorkers,
  reduceClaudeLowUsageFrequency = false,
  onToggleReduceClaudeLowUsageFrequency,
  overlayEnabled = true,
  onToggleOverlay,
  codexModelScanProgress,
  onRescanAllCodexModels,
  onExportBackup,
  onImportBackup,
  cardLayoutMode = "expanded",
  onCardLayoutModeChange,
  platformVisibility,
  onPlatformVisibilityChange,
  uiAdjustment,
  onUiAdjustmentChange,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("poll");
  const shortcuts = useShortcutPreferences();
  const tabRefs = useSettingsModalTab(activeTab, isOpen, onClose);

  const {
    trackedVal,
    setTrackedVal,
    idleMinutes,
    idleSeconds,
    trackedWarn,
    idleWarn,
    commitTracked,
    commitIdle,
    handleIdleMinutesChange,
    handleIdleSecondsChange,
  } = useSettingsPollState(
    trackedPollInterval,
    onTrackedPollIntervalChange,
    idlePollInterval,
    onIdlePollIntervalChange,
    POLL_MIN,
    POLL_MAX,
  );

  if (!isOpen) return null;

  const handleTrackedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    const val = isNaN(v) ? 0 : Math.max(0, Math.min(POLL_MAX, v));
    setTrackedVal(val);
    if (val >= POLL_MIN) onTrackedPollIntervalChange(val);
  };

  const updateUi = (patch: Partial<UiAdjustmentPreferences>) =>
    onUiAdjustmentChange(normalizeUiAdjustmentPreferences({ ...uiAdjustment, ...patch }));
  const resetOverlay = () =>
    updateUi({
      overlayScale: UI_ADJUSTMENT_DEFAULTS.overlayScale,
      overlayTheme: UI_ADJUSTMENT_DEFAULTS.overlayTheme,
    });

  return (
    <div
      className="dialog-overlay settings-modal-overlay"
      data-no-window-drag
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-box settings-modal-box" style={{ width: "552px" }}>
        <div className="settings-modal-header">
          <SettingsGearIcon />
          <span>Settings</span>
          <div className="settings-modal-header-actions">
            <button
              type="button"
              className="settings-modal-version-link"
              onClick={() => void openUrl(CHANGELOG_URL)}
              data-tooltip="View changelog"
            >
              v{appPackage.version}
            </button>
            {onToggleTheme && (
              <button
                type="button"
                className="settings-modal-theme-toggle"
                onClick={onToggleTheme}
                aria-label="Toggle theme"
                data-tooltip="Toggle light/dark mode"
                data-shortcut={shortcuts.toggleTheme}
              >
                <ThemeIcon isDarkMode={isDarkMode} />
              </button>
            )}
            <button
              type="button"
              className="settings-modal-close"
              onClick={onClose}
              data-tooltip="Close settings"
              aria-label="Close settings"
            >
              <SettingsCloseIcon />
            </button>
          </div>
        </div>

        <div className="settings-modal-body">
          <div className="settings-tabs" role="tablist" aria-label="Settings sections">
            {SETTINGS_TABS.map(([id, label]) => (
              <button
                key={id}
                ref={(node) => {
                  if (node) tabRefs.current[id] = node;
                }}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                data-tooltip={label}
                className={`settings-tab ${activeTab === id ? "settings-tab--active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="settings-modal-content">
            {activeTab === "poll" && (
              <div className="settings-section">
                <div className="settings-section-title">Monitoring</div>
                <div className="settings-field">
                  <div className="settings-toggle-row settings-toggle-row--segmented">
                    <span className="settings-row-icon">
                      <TrackedPollIcon />
                    </span>
                    <span className="settings-toggle-copy">
                      <label className="settings-toggle-label" htmlFor="tracked-poll-rate">
                        Monitored account poll rate
                      </label>
                      <span className="settings-toggle-description">Recommended: 30–120 sec</span>
                    </span>
                    <div className="settings-input-row">
                      <input
                        type="number"
                        id="tracked-poll-rate"
                        className={`settings-number-input ${trackedWarn ? "settings-number-input--warn" : ""}`}
                        min={POLL_MIN}
                        max={POLL_MAX}
                        value={trackedVal}
                        onChange={handleTrackedChange}
                        onBlur={commitTracked}
                      />
                      <span className="settings-unit">sec</span>
                    </div>
                  </div>
                  <PollWarning warning={trackedWarn} type="tracked" />
                </div>
                <IdlePollField
                  idleMinutes={idleMinutes}
                  idleSeconds={idleSeconds}
                  idleWarn={idleWarn}
                  maxMinutes={POLL_MAX / 60}
                  onMinutesChange={handleIdleMinutesChange}
                  onSecondsChange={handleIdleSecondsChange}
                  onCommit={commitIdle}
                />
                <BehaviorSettingsSection
                  keepAliveActive={keepAliveActive}
                  onToggleKeepAlive={onToggleKeepAlive}
                  persistentWorkersEnabled={persistentWorkersEnabled}
                  onTogglePersistentWorkers={onTogglePersistentWorkers}
                  reduceClaudeLowUsageFrequency={reduceClaudeLowUsageFrequency}
                  onToggleReduceClaudeLowUsageFrequency={
                    onToggleReduceClaudeLowUsageFrequency ?? (() => {})
                  }
                />
              </div>
            )}
            {activeTab === "appearance" && (
              <AppearanceSettingsSection
                cardLayoutMode={cardLayoutMode}
                onCardLayoutModeChange={onCardLayoutModeChange}
                platformVisibility={platformVisibility}
                onPlatformVisibilityChange={onPlatformVisibilityChange}
              />
            )}
            {activeTab === "shortcuts" && <ShortcutSettings />}
            {activeTab === "data" && (
              <div className="settings-section">
                <div className="settings-section-title">Data</div>
                <button
                  type="button"
                  className="settings-action-row settings-toggle-row"
                  disabled={codexModelScanProgress.running}
                  onClick={onRescanAllCodexModels}
                  data-tooltip="Rescan all Codex models"
                  aria-label="Rescan all Codex models"
                >
                  <span
                    className={
                      codexModelScanProgress.running ? "codex-spinner" : "settings-row-icon"
                    }
                  >
                    {codexModelScanProgress.running ? null : <DataRescanIcon />}
                  </span>
                  <span className="settings-toggle-copy">
                    <span className="settings-toggle-label">
                      {codexModelScanProgress.running
                        ? `Scanning ${codexModelScanProgress.completed} / ${codexModelScanProgress.total}`
                        : "Rescan all Codex models"}
                    </span>
                    <span className="settings-toggle-description">
                      Scan and cache available models and capabilities for all accounts.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="settings-action-row settings-toggle-row"
                  onClick={onExportBackup}
                  data-tooltip="Export backup"
                  aria-label="Export Backup"
                >
                  <span className="settings-row-icon">
                    <ExportBackupIcon />
                  </span>
                  <span className="settings-toggle-copy">
                    <span className="settings-toggle-label">Export backup</span>
                    <span className="settings-toggle-description">
                      Export accounts, configuration, and preferences to a JSON file.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="settings-action-row settings-toggle-row"
                  onClick={onImportBackup}
                  data-tooltip="Import backup"
                  aria-label="Import Backup"
                >
                  <span className="settings-row-icon">
                    <ImportBackupIcon />
                  </span>
                  <span className="settings-toggle-copy">
                    <span className="settings-toggle-label">Import backup</span>
                    <span className="settings-toggle-description">
                      Restore accounts and settings from an existing backup file.
                    </span>
                  </span>
                </button>
              </div>
            )}
            {activeTab === "ui" && (
              <div className="settings-section settings-ui-section">
                <div className="settings-section-title">Overlay</div>
                <OverlayPrimaryRow
                  overlayEnabled={overlayEnabled}
                  onToggleOverlay={onToggleOverlay}
                  onReset={resetOverlay}
                />
                {/* Overlay UI Scale */}
                <OverlayAdjustmentGroup
                  scale={uiAdjustment.overlayScale}
                  theme={uiAdjustment.overlayTheme}
                  onChange={(val) => updateUi({ overlayScale: val })}
                  onThemeChange={(overlayTheme) => updateUi({ overlayTheme })}
                  label="Overlay UI scale"
                />
              </div>
            )}
            {activeTab === "logs" && <LogsSettingsSection />}
            {activeTab === "help" && <HelpSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
};
