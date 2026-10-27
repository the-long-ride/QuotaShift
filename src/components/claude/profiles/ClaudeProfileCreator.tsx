import React, { useState } from "react";
import type {
  ClaudeProfileDTO,
  CreatedClaudeProfileDTO,
} from "../../../hooks/claude/gateway/useClaudeCodePoolConnector";
import { CommonDropdown } from "../../common/CommonDropdown";
import { CopySvgIcon } from "../../common/icons/CopySvgIcon";
import { CliCheckIcon } from "../../common/cli-pools/CliPoolIcons";

interface ClaudeProfileCreatorProps {
  profiles: ClaudeProfileDTO[];
  initiallyExpanded?: boolean;
  creating: boolean;
  onCreate: (
    profileName: string,
    template: "default" | "copy-settings",
    sourceProfileId?: string,
  ) => Promise<CreatedClaudeProfileDTO | null>;
  onReset?: () => void;
}

export const ClaudeProfileCreator: React.FC<ClaudeProfileCreatorProps> = ({
  profiles,
  initiallyExpanded = false,
  creating,
  onCreate,
  onReset,
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [createdProfile, setCreatedProfile] = useState<CreatedClaudeProfileDTO | null>(null);
  const [profileName, setProfileName] = useState("");
  const [template, setTemplate] = useState<"default" | "copy-settings">("default");
  const [sourceProfileId, setSourceProfileId] = useState("");
  const [localError, setLocalError] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyText = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => {
        setCopiedField((prev) => (prev === fieldId ? null : prev));
      }, 2000);
    } catch {
      // Clipboard write failed silently
    }
  };

  const create = async () => {
    const name = profileName.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(name)) {
      setLocalError("Use 1–48 letters, numbers, hyphens, or underscores.");
      return;
    }
    if (template === "copy-settings" && !sourceProfileId) {
      setLocalError("Select a source profile to copy settings from.");
      return;
    }
    setLocalError("");
    setCreatedProfile(null);
    const created = await onCreate(name, template, sourceProfileId || undefined);
    if (created) {
      setExpanded(false);
      setCreatedProfile(created);
      setProfileName("");
      setTemplate("default");
      setSourceProfileId("");
    }
  };

  if (!expanded) {
    return (
      <div className="claude-profile-created-result">
        {createdProfile && (
          <div role="status" className="claude-profile-success">
            <div className="claude-profile-success-header">
              <div className="claude-profile-success-badge" aria-hidden="true">
                <CliCheckIcon size={12} />
              </div>
              <div className="claude-profile-success-text">
                <strong className="claude-profile-success-title">
                  Profile saved — ready to use later
                </strong>
                <span className="claude-profile-success-subtitle">
                  Isolated configuration initialized under .quotashift/claude-profiles
                </span>
              </div>
            </div>

            <div className="claude-profile-command-box">
              <div className="claude-profile-command-header">
                <span className="claude-profile-command-label">Launch command</span>
                <button
                  type="button"
                  className="claude-profile-copy-btn"
                  onClick={() => void copyText(createdProfile.commandName, "command")}
                  data-tooltip="Copy launcher command"
                  aria-label="Copy launcher command"
                >
                  {copiedField === "command" ? (
                    <>
                      <CliCheckIcon size={10} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopySvgIcon size={10} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="claude-profile-command-snippet">
                <span className="claude-profile-prompt" aria-hidden="true">
                  &gt;
                </span>
                <code>{createdProfile.commandName}</code>
              </div>
            </div>

            <div className="claude-profile-meta-list">
              <div className="claude-profile-meta-item">
                <span className="claude-profile-meta-label">Command launcher:</span>
                <div className="claude-profile-meta-value">
                  <code title={createdProfile.launcherPath}>{createdProfile.launcherPath}</code>
                  <button
                    type="button"
                    className="claude-profile-meta-copy-btn"
                    onClick={() => void copyText(createdProfile.launcherPath, "launcher")}
                    data-tooltip="Copy launcher path"
                    aria-label="Copy launcher path"
                  >
                    {copiedField === "launcher" ? (
                      <CliCheckIcon size={11} />
                    ) : (
                      <CopySvgIcon size={11} />
                    )}
                  </button>
                </div>
              </div>
              {createdProfile.configDir && (
                <div className="claude-profile-meta-item">
                  <span className="claude-profile-meta-label">Config directory:</span>
                  <div className="claude-profile-meta-value">
                    <code title={createdProfile.configDir}>{createdProfile.configDir}</code>
                    <button
                      type="button"
                      className="claude-profile-meta-copy-btn"
                      onClick={() => void copyText(createdProfile.configDir, "config")}
                      data-tooltip="Copy config directory path"
                      aria-label="Copy config directory path"
                    >
                      {copiedField === "config" ? (
                        <CliCheckIcon size={11} />
                      ) : (
                        <CopySvgIcon size={11} />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {createdProfile.pathWarning ? (
              <div className="claude-profile-notice claude-profile-notice--warning" role="alert">
                <span className="claude-profile-notice-icon" aria-hidden="true">
                  ⚠
                </span>
                <span>{createdProfile.pathWarning}</span>
              </div>
            ) : (
              <div className="claude-profile-notice claude-profile-notice--info">
                <span className="claude-profile-notice-icon" aria-hidden="true">
                  ℹ
                </span>
                <span>Open a new terminal for the updated user PATH to take effect.</span>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className={
            createdProfile ? "claude-profile-secondary-btn" : "claude-wizard-create-profile-link"
          }
          data-tooltip="Create another isolated Claude configuration directory"
          onClick={() => {
            setExpanded(true);
            onReset?.();
          }}
        >
          + Create {createdProfile ? "another" : "new"} Claude profile
        </button>
      </div>
    );
  }

  return (
    <div className="claude-wizard-create-profile">
      <div className="claude-wizard-create-title">New isolated Claude home</div>
      <p className="form-hint">
        Stored under your user home in .quotashift/claude-profiles. Your existing profiles and
        credentials will not be modified.
      </p>
      <div className="claude-wizard-field">
        <label className="form-label" htmlFor="claude-new-profile-name">
          Profile name
        </label>
        <input
          id="claude-new-profile-name"
          className="claude-control-input"
          type="text"
          maxLength={48}
          autoComplete="off"
          spellCheck={false}
          placeholder="work-alternative"
          value={profileName}
          onChange={(event) => {
            setProfileName(event.target.value);
            setLocalError("");
          }}
        />
        <div className="claude-profile-preview-hint">
          <span>Command launcher: </span>
          <code>claude-{profileName.trim() || "name"}</code>
          {profileName.trim().startsWith("claude-") && (
            <span className="claude-profile-prefix-note">("claude-" is added automatically)</span>
          )}
        </div>
      </div>
      <div className="claude-wizard-field">
        <label className="form-label" htmlFor="claude-new-profile-template">
          Initial settings
        </label>
        <CommonDropdown
          id="claude-new-profile-template"
          value={template}
          onChange={(value) => {
            setTemplate(value as "default" | "copy-settings");
            setLocalError("");
          }}
          tooltip="Choose new Claude profile settings"
          options={[
            { value: "default", label: "Default settings.json (empty)" },
            { value: "copy-settings", label: "Copy safe settings from existing profile" },
          ]}
          width="100%"
        />
      </div>
      {template === "copy-settings" && (
        <div className="claude-wizard-field">
          <label className="form-label" htmlFor="claude-new-profile-source">
            Source profile
          </label>
          <CommonDropdown
            id="claude-new-profile-source"
            value={sourceProfileId}
            onChange={setSourceProfileId}
            tooltip="Select existing profile for settings preferences"
            options={[
              { value: "", label: "Select source profile..." },
              ...profiles.map((profile) => ({
                value: profile.id,
                label: profile.name,
                sublabel: profile.configDir,
              })),
            ]}
            width="100%"
          />
          <p className="form-hint">
            Only display preferences are copied; authentication, env vars, hooks, plugins,
            permissions, and sessions stay separate.
          </p>
        </div>
      )}
      {localError && (
        <div className="codex-model-validation codex-model-validation--error" role="alert">
          {localError}
        </div>
      )}
      <div className="claude-wizard-create-actions">
        <button
          type="button"
          className="dialog-btn dialog-btn--secondary"
          data-tooltip="Cancel creating a new Claude profile"
          disabled={creating}
          onClick={() => setExpanded(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="dialog-btn dialog-btn--primary"
          data-tooltip="Create and select this isolated Claude profile"
          disabled={creating || (template === "copy-settings" && !sourceProfileId)}
          onClick={() => void create()}
        >
          {creating ? "Creating…" : "Create profile"}
        </button>
      </div>
    </div>
  );
};
