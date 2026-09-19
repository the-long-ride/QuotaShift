import React, { useEffect, useState } from "react";
import { AccountModalLayout } from "../common/AccountModalLayout";
import { ClaudeLogo } from "./ClaudeLogo";

interface ClaudeAddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (configDir: string) => Promise<void>;
}

export const ClaudeAddAccountModal: React.FC<ClaudeAddAccountModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [configDir, setConfigDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfigDir("");
      setError(null);
      setIsAdding(false);
    }
  }, [isOpen]);

  const submit = async () => {
    const value = configDir.trim();
    if (!value) {
      setError("Enter a Claude Code profile path.");
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      await onAdd(value);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title="Add Claude Code Account"
      icon={<ClaudeLogo size={14} />}
      footerButtons={
        <>
          <button
            type="button"
            className="dialog-btn dialog-btn--cancel"
            onClick={onClose}
            data-tooltip="Cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn"
            disabled={isAdding}
            onClick={() => void submit()}
            data-tooltip={isAdding ? "Adding..." : "Add Account"}
          >
            {isAdding ? "Adding..." : "Add Account"}
          </button>
        </>
      }
    >
      <div className="account-form">
        <div className="form-field">
          <label className="form-label" htmlFor="claude-profile-path">
            Claude profile path
          </label>
          <input
            id="claude-profile-path"
            className="form-input"
            type="text"
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder="C:\\Users\\you\\.claude-work"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <span className="form-hint">
            Enter the profile directory used as CLAUDE_CONFIG_DIR. QuotaShift reads account metadata
            from that profile and does not switch accounts.
          </span>
          {error && <span className="claude-add-account-error">{error}</span>}
        </div>
      </div>
    </AccountModalLayout>
  );
};
