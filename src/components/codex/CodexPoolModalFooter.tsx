import React from "react";

export interface CodexPoolModalFooterProps {
  initialPool: unknown;
  disabled: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const CodexPoolModalFooter: React.FC<CodexPoolModalFooterProps> = ({
  initialPool,
  disabled,
  onClose,
  onSave,
}) => (
  <>
    <button type="button" className="dialog-btn" onClick={onClose} data-tooltip="Cancel">
      Cancel
    </button>
    <button
      type="button"
      className="dialog-btn dialog-btn--primary"
      onClick={onSave}
      disabled={disabled}
      data-tooltip={initialPool ? "Save pool changes" : "Create new model pool"}
    >
      {initialPool ? "Save" : "Create Pool"}
    </button>
  </>
);
