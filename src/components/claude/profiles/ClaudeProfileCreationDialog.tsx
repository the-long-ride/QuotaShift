import React, { useEffect, useRef, useState } from "react";
import { AccountModalLayout } from "../../common/accounts/AccountModalLayout";
import {
  CreatedClaudeProfileDTO,
  useClaudeCodePoolConnector,
} from "../../../hooks/claude/gateway/useClaudeCodePoolConnector";
import { ClaudeProfileCreator } from "./ClaudeProfileCreator";

export interface ClaudeProfileCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileCreated?: () => void | Promise<void>;
}

export const ClaudeProfileCreationDialog: React.FC<ClaudeProfileCreationDialogProps> = ({
  isOpen,
  onClose,
  onProfileCreated,
}) => {
  const connector = useClaudeCodePoolConnector();
  const [createdProfile, setCreatedProfile] = useState<CreatedClaudeProfileDTO | null>(null);
  const createdInSessionRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setCreatedProfile(null);
      createdInSessionRef.current = false;
    }
  }, [isOpen]);

  const handleClose = () => {
    if (createdInSessionRef.current) {
      createdInSessionRef.current = false;
      void onProfileCreated?.();
    }
    onClose();
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={handleClose}
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
          onClick={handleClose}
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
            createdInSessionRef.current = true;
            setCreatedProfile(created);
            void onProfileCreated?.();
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
