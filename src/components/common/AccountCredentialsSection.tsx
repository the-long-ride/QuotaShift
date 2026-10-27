import React from "react";
import { ExportCredentialsIcon, ImportCredentialsIcon } from "./SettingsDataIcons";

export interface AccountCredentialsSectionProps {
  onExport?: () => void;
  onImport?: () => void;
}

export const AccountCredentialsSection: React.FC<AccountCredentialsSectionProps> = ({
  onExport,
  onImport,
}) => (
  <div className="settings-subsection">
    <div className="settings-subsection-title">Account Credentials</div>
    <button
      type="button"
      className="settings-action-row settings-toggle-row settings-action-row--export-credentials"
      onClick={onExport}
      data-tooltip="Export credentials"
      aria-label="Export Credentials"
    >
      <span className="settings-row-icon">
        <ExportCredentialsIcon />
      </span>
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">Export credentials</span>
        <span className="settings-toggle-description">
          Export encrypted credentials of all Antigravity and Codex accounts to a file.
        </span>
      </span>
    </button>
    <button
      type="button"
      className="settings-action-row settings-toggle-row settings-action-row--import-credentials"
      onClick={onImport}
      data-tooltip="Import credentials"
      aria-label="Import Credentials"
    >
      <span className="settings-row-icon">
        <ImportCredentialsIcon />
      </span>
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">Import credentials</span>
        <span className="settings-toggle-description">
          Restore account credentials from an encrypted credentials file.
        </span>
      </span>
    </button>
  </div>
);
