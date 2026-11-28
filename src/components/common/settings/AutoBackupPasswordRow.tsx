import React, { useState } from "react";
import { flushSecureStorage } from "../../../utils/auth/secure-storage";
import { saveAutoBackupPassphrase } from "../../../utils/common/backup/auto-backup";
import {
  BackupCancelIcon,
  BackupPasswordKeyIcon,
  BackupSaveCheckIcon,
} from "../settings-controls/SettingsDataIcons";

export interface AutoBackupPasswordRowProps {
  hasPassword: boolean;
  onSaved: () => void;
  onError: (message: string | null) => void;
}

export const AutoBackupPasswordRow: React.FC<AutoBackupPasswordRowProps> = ({
  hasPassword,
  onSaved,
  onError,
}) => {
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const handleSave = async () => {
    if (!password) {
      onError("Enter a backup password.");
      return;
    }
    if (password !== confirm) {
      onError("Passwords do not match.");
      return;
    }
    try {
      saveAutoBackupPassphrase(password);
      await flushSecureStorage();
      onSaved();
      setEditing(false);
      setPassword("");
      setConfirm("");
      onError(null);
      setNotice("Saved. New password applies to the next scheduled backup.");
    } catch (error: any) {
      onError(error?.message || String(error));
    }
  };

  return (
    <>
      <div className="auto-backup-row">
        <div className="auto-backup-label-stack">
          <span className="auto-backup-label">
            Password
            <span className="auto-backup-required" aria-hidden="true">
              *
            </span>
          </span>
          <span className="auto-backup-hint">{notice ?? "Set once; edits apply to next run"}</span>
        </div>
        <div className="auto-backup-password-controls">
          <span className={`auto-backup-badge ${hasPassword ? "auto-backup-badge--saved" : ""}`}>
            {hasPassword ? "Saved" : "Not set"}
          </span>
          <button
            type="button"
            className="settings-reset-btn auto-backup-icon-btn"
            data-tooltip={
              editing
                ? "Cancel password edit"
                : hasPassword
                  ? "Change saved backup password"
                  : "Set backup password"
            }
            onClick={() => {
              setEditing((cur) => !cur);
              onError(null);
            }}
          >
            {editing ? <BackupCancelIcon /> : <BackupPasswordKeyIcon />}
            <span>{editing ? "Cancel" : hasPassword ? "Change" : "Set"}</span>
          </button>
        </div>
      </div>
      {editing && (
        <div className="auto-backup-password-editor">
          <input
            type="password"
            required
            aria-required="true"
            className="auto-backup-input"
            placeholder={hasPassword ? "New backup password" : "Backup password"}
            aria-label="Auto backup password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            required
            aria-required="true"
            className="auto-backup-input"
            placeholder="Confirm password"
            aria-label="Confirm auto backup password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button
            type="button"
            className="dialog-btn auto-backup-primary-btn auto-backup-icon-btn"
            data-tooltip="Save password for next scheduled backup"
            onClick={handleSave}
          >
            <BackupSaveCheckIcon />
            <span>Save password</span>
          </button>
        </div>
      )}
    </>
  );
};
