import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AccountModalLayout } from "../common/AccountModalLayout";
import { CopySvgIcon } from "../common/CopySvgIcon";
import { CliCheckIcon } from "../common/CliPoolIcons";
import type { ClaudeProfileDTO } from "../../hooks/claude/useClaudeCodePoolConnector";

export interface ClaudeProfileDetailDialogProps {
  isOpen: boolean;
  profile: ClaudeProfileDTO | null;
  executablePath?: string | null;
  launcherPath?: string | null;
  onClose: () => void;
  onDisconnectAndRemove?: () => Promise<void>;
}

export const ClaudeProfileDetailDialog: React.FC<ClaudeProfileDetailDialogProps> = ({
  isOpen,
  profile,
  executablePath,
  launcherPath,
  onClose,
  onDisconnectAndRemove,
}) => {
  const [settingsText, setSettingsText] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [restoringSettings, setRestoringSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState("✓ Saved");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !profile) return;
    setLoadingSettings(true);
    setJsonError(null);
    setSaveSuccess(false);

    invoke<string>("read_claude_profile_settings", { configDir: profile.configDir })
      .then((content) => {
        try {
          const parsed = JSON.parse(content);
          setSettingsText(JSON.stringify(parsed, null, 2));
        } catch {
          setSettingsText(content);
        }
      })
      .catch((err) => {
        setJsonError(`Failed to load settings.json: ${String(err)}`);
      })
      .finally(() => {
        setLoadingSettings(false);
      });
  }, [isOpen, profile]);

  const copyVal = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Ignored
    }
  };

  const handleSaveSettings = async () => {
    if (!profile) return;
    try {
      JSON.parse(settingsText);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Invalid JSON format: ${e.message || String(e)}`);
      return;
    }

    setSavingSettings(true);
    setSaveSuccess(false);
    try {
      await invoke("save_claude_profile_settings", {
        configDir: profile.configDir,
        content: settingsText,
      });
      setSaveMessage("✓ Saved");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setJsonError(`Failed to save settings: ${String(err)}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRestoreDefaultSettings = async () => {
    if (!profile) return;
    setRestoringSettings(true);
    setSaveSuccess(false);
    setJsonError(null);
    try {
      const restored = await invoke<string>("restore_claude_profile_settings", {
        profileId: profile.id,
        configDir: profile.configDir,
      });
      setSettingsText(restored);
      setSaveMessage("✓ Restored to default");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setJsonError(`Failed to restore default settings: ${String(err)}`);
    } finally {
      setRestoringSettings(false);
    }
  };

  const handleDisconnectRemove = async () => {
    if (!onDisconnectAndRemove) return;
    setIsRemoving(true);
    try {
      await onDisconnectAndRemove();
      onClose();
    } catch (err) {
      setJsonError(`Disconnect and remove failed: ${String(err)}`);
    } finally {
      setIsRemoving(false);
    }
  };

  if (!profile) return null;

  const resolvedLauncherPath =
    launcherPath ||
    profile.launcherPath ||
    (() => {
      const norm = profile.configDir.replace(/\\/g, "/");
      const idx = norm.indexOf("/.quotashift/claude-profiles/");
      if (idx !== -1) {
        const base = profile.configDir.slice(0, idx);
        const sep = profile.configDir.includes("\\") ? "\\" : "/";
        const ext = profile.configDir.includes("\\") ? ".cmd" : "";
        const name = profile.name;
        const fileName = name.startsWith("claude-") ? `${name}${ext}` : `claude-${name}${ext}`;
        return `${base}${sep}.quotashift${sep}bin${sep}${fileName}`;
      }
      return null;
    })();

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title={`Claude Profile: ${profile.name}`}
      icon={<span className="claude-wizard-icon">◫</span>}
      dialogClassName="claude-pool-wizard claude-profile-detail-dialog"
      bodyClassName="claude-wizard-body"
      footerButtons={
        <div className="claude-detail-footer-actions">
          {onDisconnectAndRemove && (
            <button
              type="button"
              className="dialog-btn dialog-btn--danger"
              disabled={isRemoving}
              onClick={() => void handleDisconnectRemove()}
              data-tooltip="Disconnect gateway and delete this profile directory from disk"
            >
              {isRemoving ? "Removing..." : "Disconnect & Remove Profile"}
            </button>
          )}
          <button
            type="button"
            className="dialog-btn dialog-btn--primary"
            onClick={onClose}
            data-tooltip="Close profile details"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="claude-detail-container">
        <div className="claude-detail-section">
          <span className="claude-detail-label">Claude app executable</span>
          <div className="claude-detail-row">
            <code title={executablePath || "Default claude on user PATH"}>
              {executablePath || "Default claude on user PATH"}
            </code>
            {executablePath && (
              <button
                type="button"
                className="claude-profile-meta-copy-btn"
                onClick={() => void copyVal(executablePath, "exe")}
                data-tooltip="Copy executable binary path"
              >
                {copiedKey === "exe" ? <CliCheckIcon size={11} /> : <CopySvgIcon size={11} />}
              </button>
            )}
          </div>
        </div>

        <div className="claude-detail-section">
          <span className="claude-detail-label">Profile executable</span>
          <div className="claude-detail-row">
            <code title={resolvedLauncherPath || "Not created in ~/.quotashift/bin"}>
              {resolvedLauncherPath || "Not created in ~/.quotashift/bin"}
            </code>
            {resolvedLauncherPath && (
              <button
                type="button"
                className="claude-profile-meta-copy-btn"
                onClick={() => void copyVal(resolvedLauncherPath, "launcher")}
                data-tooltip="Copy profile executable path"
                aria-label="Copy profile executable path"
              >
                {copiedKey === "launcher" ? <CliCheckIcon size={11} /> : <CopySvgIcon size={11} />}
              </button>
            )}
          </div>
        </div>

        <div className="claude-detail-section">
          <span className="claude-detail-label">Configuration directory</span>
          <div className="claude-detail-row">
            <code title={profile.configDir}>{profile.configDir}</code>
            <button
              type="button"
              className="claude-profile-meta-copy-btn"
              onClick={() => void copyVal(profile.configDir, "dir")}
              data-tooltip="Copy config directory path"
            >
              {copiedKey === "dir" ? <CliCheckIcon size={11} /> : <CopySvgIcon size={11} />}
            </button>
          </div>
        </div>

        <div className="claude-detail-section">
          <div className="claude-detail-header-row">
            <span className="claude-detail-label">settings.json configuration</span>
            <div className="claude-detail-header-actions">
              {saveSuccess && <span className="claude-save-success-tag">{saveMessage}</span>}
              <button
                type="button"
                className="dialog-btn dialog-btn--secondary claude-save-btn"
                disabled={loadingSettings || savingSettings || restoringSettings}
                onClick={() => void handleRestoreDefaultSettings()}
                data-tooltip="Restore settings.json to canonical QuotaShift Model Routing defaults"
              >
                {restoringSettings ? "Restoring…" : "Restore to default"}
              </button>
              <button
                type="button"
                className="dialog-btn dialog-btn--secondary claude-save-btn"
                disabled={loadingSettings || savingSettings || restoringSettings}
                onClick={() => void handleSaveSettings()}
                data-tooltip="Save changes to settings.json"
              >
                {savingSettings ? "Saving…" : "Save settings"}
              </button>
            </div>
          </div>

          <textarea
            className="claude-settings-editor"
            value={settingsText}
            disabled={loadingSettings}
            spellCheck={false}
            onChange={(e) => {
              setSettingsText(e.target.value);
              setJsonError(null);
            }}
            placeholder="Loading settings.json..."
          />
        </div>

        {jsonError && (
          <div className="codex-model-validation codex-model-validation--error" role="alert">
            {jsonError}
          </div>
        )}
      </div>
    </AccountModalLayout>
  );
};
