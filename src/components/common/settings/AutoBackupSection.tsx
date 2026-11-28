import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsSwitchRow } from "../settings-controls/SettingsSwitchRow";
import { ExportBackupIcon } from "../settings-controls/SettingsIcons";
import { BrowseFolderIcon } from "../settings-controls/SettingsDataIcons";
import { OpenLocationSvgIcon } from "../icons/LogIcons";
import { AutoBackupPasswordRow } from "./AutoBackupPasswordRow";
import {
  AUTO_BACKUP_CHANGED_EVENT,
  AUTO_BACKUP_RUN_NOW_EVENT,
  type AutoBackupConfig,
  type AutoBackupRepeatUnit,
  type AutoBackupScope,
  buildAutoBackupFileName,
  computeNextAutoBackupRunAt,
  hasAutoBackupPassphrase,
  loadAutoBackupConfig,
  saveAutoBackupConfig,
  validateAutoBackupReady,
} from "../../../utils/common/backup/auto-backup";

function formatTimestamp(ms: number | null): string {
  if (!ms) return "Never";
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const AutoBackupSection: React.FC = () => {
  const [config, setConfig] = useState<AutoBackupConfig>(() => loadAutoBackupConfig());
  const [hasPassword, setHasPassword] = useState<boolean>(() => hasAutoBackupPassphrase());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = useState(false);

  useEffect(() => {
    const sync = () => {
      setConfig(loadAutoBackupConfig());
      setHasPassword(hasAutoBackupPassphrase());
    };
    window.addEventListener(AUTO_BACKUP_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTO_BACKUP_CHANGED_EVENT, sync);
  }, []);

  const persistConfig = (next: AutoBackupConfig, recomputeSchedule = false) => {
    const withSchedule: AutoBackupConfig = !next.enabled
      ? { ...next, nextRunAt: null }
      : recomputeSchedule || next.nextRunAt === null
        ? { ...next, nextRunAt: computeNextAutoBackupRunAt(next) }
        : next;
    setConfig(saveAutoBackupConfig(withSchedule));
  };

  const handleToggleEnabled = () => {
    if (!config.enabled) {
      const error = validateAutoBackupReady(config, hasPassword);
      if (error) {
        setValidationError(error);
        return;
      }
    }
    setValidationError(null);
    persistConfig({ ...config, enabled: !config.enabled, lastError: null }, true);
  };

  const handlePickFolder = async () => {
    if (pickingFolder) return;
    setPickingFolder(true);
    setValidationError(null);
    try {
      const selected = await invoke<string | null>("pick_auto_backup_folder", {
        initialPath: config.directoryPath || null,
      });
      if (selected) {
        persistConfig({ ...config, directoryPath: selected });
      }
    } catch (error: any) {
      setValidationError(error?.message || String(error));
    } finally {
      setPickingFolder(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!config.directoryPath.trim()) return;
    try {
      await invoke("open_path_in_file_manager", { path: config.directoryPath.trim() });
    } catch (error: any) {
      setValidationError(error?.message || String(error));
    }
  };

  const fileNamePreview = buildAutoBackupFileName(config);
  const readyError = validateAutoBackupReady(config, hasPassword);

  return (
    <div className="settings-subsection auto-backup-section">
      <div className="settings-subsection-title">Auto Backup</div>
      <SettingsSwitchRow
        icon={<ExportBackupIcon />}
        label="Enable scheduled backup"
        description="Automatically export encrypted JSON backups to your chosen folder (runs immediately on launch if a scheduled time was missed)."
        checked={config.enabled}
        onToggle={handleToggleEnabled}
      />
      <div className={`auto-backup-body ${config.enabled ? "" : "auto-backup-body--standby"}`}>
        <div className="auto-backup-grid">
          <div className="auto-backup-row">
            <span className="auto-backup-label">Content</span>
            <div
              className="settings-segmented-switch"
              role="group"
              aria-label="Auto backup scope"
              data-segments="2"
              data-active-index={config.scope === "credentials" ? 1 : 0}
            >
              {(
                [
                  ["full", "Full Backup"],
                  ["credentials", "Credentials Only"],
                ] as Array<[AutoBackupScope, string]>
              ).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  aria-pressed={config.scope === scope}
                  className={`settings-segment-btn ${config.scope === scope ? "settings-segment-btn--active" : ""}`}
                  data-tooltip={
                    scope === "full"
                      ? "Back up settings, pools, and accounts"
                      : "Back up Antigravity and Codex credentials only"
                  }
                  onClick={() => persistConfig({ ...config, scope })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="auto-backup-row">
            <label className="auto-backup-label" htmlFor="auto-backup-start-time">
              Schedule
            </label>
            <div className="auto-backup-schedule-inputs">
              <input
                id="auto-backup-start-time"
                type="time"
                className="auto-backup-input auto-backup-input--time"
                value={config.startTime}
                onChange={(e) => persistConfig({ ...config, startTime: e.target.value }, true)}
              />
              <span className="auto-backup-inline-text">every</span>
              <input
                id="auto-backup-repeat-every"
                aria-label="Repeat every"
                type="number"
                min={1}
                max={config.repeatUnit === "hours" ? 168 : 365}
                className="auto-backup-input auto-backup-input--number"
                value={config.repeatEvery}
                onChange={(e) =>
                  persistConfig(
                    {
                      ...config,
                      repeatEvery: Math.max(1, Number(e.target.value) || 1),
                    },
                    true,
                  )
                }
              />
              <div
                className="settings-segmented-switch auto-backup-unit-switch"
                role="group"
                aria-label="Repeat unit"
                data-segments="2"
                data-active-index={config.repeatUnit === "hours" ? 1 : 0}
              >
                {(
                  [
                    ["days", "Days"],
                    ["hours", "Hours"],
                  ] as Array<[AutoBackupRepeatUnit, string]>
                ).map(([unit, label]) => (
                  <button
                    key={unit}
                    type="button"
                    aria-pressed={config.repeatUnit === unit}
                    className={`settings-segment-btn ${config.repeatUnit === unit ? "settings-segment-btn--active" : ""}`}
                    data-tooltip={`Repeat every ${config.repeatEvery} ${label.toLowerCase()}`}
                    onClick={() => persistConfig({ ...config, repeatUnit: unit }, true)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="auto-backup-row">
            <label className="auto-backup-label" htmlFor="auto-backup-folder">
              Backup folder
              <span className="auto-backup-required" aria-hidden="true">
                *
              </span>
            </label>
            <div className="auto-backup-path-controls">
              <input
                id="auto-backup-folder"
                type="text"
                required
                aria-required="true"
                className="auto-backup-input auto-backup-input--path"
                placeholder="Choose or enter folder path"
                value={config.directoryPath}
                onChange={(e) => {
                  setValidationError(null);
                  persistConfig({ ...config, directoryPath: e.target.value });
                }}
              />
              <button
                type="button"
                className="settings-reset-btn auto-backup-icon-btn"
                data-tooltip="Choose backup folder"
                onClick={handlePickFolder}
                disabled={pickingFolder}
              >
                <BrowseFolderIcon />
                <span>{pickingFolder ? "..." : "Browse"}</span>
              </button>
              <button
                type="button"
                className="settings-reset-btn auto-backup-icon-btn"
                data-tooltip="Open backup folder"
                onClick={handleOpenFolder}
                disabled={!config.directoryPath.trim()}
              >
                <OpenLocationSvgIcon size={11} />
                <span>Open</span>
              </button>
            </div>
          </div>
          <div className="auto-backup-row auto-backup-row--switch">
            <div className="auto-backup-label-stack">
              <span className="auto-backup-label">Overwrite existing file</span>
              <span className="auto-backup-hint">Output: {fileNamePreview}</span>
            </div>
            <button
              type="button"
              className={`codex-pool-switch ${config.overwriteExisting ? "codex-pool-switch--on" : ""}`}
              role="switch"
              aria-label="Overwrite existing file"
              aria-checked={config.overwriteExisting}
              data-tooltip={
                config.overwriteExisting
                  ? "Overwrite QuotaShift-Backup.json on each run"
                  : "Write a new timestamped backup file on each run"
              }
              onClick={() =>
                persistConfig({ ...config, overwriteExisting: !config.overwriteExisting })
              }
            >
              <span className="codex-pool-switch-thumb" />
            </button>
          </div>
          <AutoBackupPasswordRow
            hasPassword={hasPassword}
            onSaved={() => setHasPassword(true)}
            onError={setValidationError}
          />
        </div>
        {(validationError || config.lastError) && (
          <div className="auto-backup-error">{validationError ?? config.lastError}</div>
        )}
        <div className="auto-backup-footer">
          <span className="auto-backup-status-text">
            Last: {formatTimestamp(config.lastRunAt)} · Next: {formatTimestamp(config.nextRunAt)}
          </span>
          <button
            type="button"
            className="settings-reset-btn auto-backup-icon-btn"
            disabled={Boolean(readyError)}
            data-tooltip={readyError ?? "Write an encrypted backup immediately"}
            onClick={() => window.dispatchEvent(new CustomEvent(AUTO_BACKUP_RUN_NOW_EVENT))}
          >
            <ExportBackupIcon />
            <span>Back up now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
