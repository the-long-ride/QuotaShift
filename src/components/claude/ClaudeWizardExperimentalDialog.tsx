import React from "react";
import { AccountModalLayout } from "../common/AccountModalLayout";

interface ClaudeWizardExperimentalDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClaudeWizardExperimentalDialog: React.FC<ClaudeWizardExperimentalDialogProps> = ({
  isOpen,
  onClose,
}) => (
  <AccountModalLayout
    isOpen={isOpen}
    onClose={onClose}
    title="Experimental model routing"
    icon={
      <span className="claude-wizard-info-icon" aria-hidden="true">
        !
      </span>
    }
    dialogClassName="claude-wizard-info-dialog"
    footerButtons={
      <button
        type="button"
        className="dialog-btn dialog-btn--primary"
        data-tooltip="Close experimental routing information"
        onClick={onClose}
      >
        Got it
      </button>
    }
  >
    <div className="claude-wizard-info-content">
      <strong>Unofficial Claude Code integration</strong>
      <p>
        Anthropic does not officially support using non-Claude models in Claude Code. QuotaShift's
        experimental Messages-to-Responses bridge has not yet been connected to a verified upstream
        transport.
      </p>
      <p>
        You can create an isolated Claude configuration home and map available model pools, but the
        actual connection stays disabled until protocol, authentication, and streaming checks pass.
      </p>
      <p>
        Existing Claude settings and account credentials are not changed by opening this wizard.
      </p>
    </div>
  </AccountModalLayout>
);
