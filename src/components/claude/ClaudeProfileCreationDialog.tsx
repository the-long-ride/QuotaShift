import React, { useState, useEffect } from "react";
import { AccountModalLayout } from "../common/AccountModalLayout";
import {
  CreatedClaudeProfileDTO,
  useClaudeCodePoolConnector,
} from "../../hooks/claude/useClaudeCodePoolConnector";
import { ClaudeProfileCreator } from "./ClaudeProfileCreator";

export interface ClaudeProfileCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClaudeProfileCreationDialog: React.FC<ClaudeProfileCreationDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const connector = useClaudeCodePoolConnector();
  const [createdProfile, setCreatedProfile] = useState<CreatedClaudeProfileDTO | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCreatedProfile(null);
    }
  }, [isOpen]);

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title={createdProfile ? "Claude Code profile ready" : "New Claude Code profile"}
      icon={
        <span className="claude-wizard-icon" aria-hidden="true">
          ◫
        </span>
      }
      dialogClassName="claude-pool-wizard"
      bodyClassName="claude-wizard-body"
      footerButtons={
        <button
          type="button"
          className="dialog-btn dialog-btn--primary"
          data-tooltip="Close Claude profile setup"
          onClick={onClose}
        >
          {createdProfile ? "Done" : "Close"}
        </button>
      }
    >
      {!createdProfile && (
        <p className="form-hint">
          Create a separate Claude configuration directory and named Windows launcher. Model Pool
          routing is optional; you can connect the profile later.
        </p>
      )}
      <ClaudeProfileCreator
        profiles={connector.profiles}
        creating={connector.isCreatingProfile}
        onCreate={async (name, template, sourceProfileId) => {
          const created = await connector.createProfile(name, template, sourceProfileId);
          if (created) {
            setCreatedProfile(created);
          }
          return created;
        }}
        onReset={() => setCreatedProfile(null)}
        initiallyExpanded
      />
      {connector.lastError && (
        <div className="codex-model-validation codex-model-validation--error" role="alert">
          {connector.lastError}
        </div>
      )}
    </AccountModalLayout>
  );
};
