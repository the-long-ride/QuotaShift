import React from "react";
import type { CodexPoolModelValidation } from "../../utils/common/types";

export interface CodexPoolModalFooterProps {
  initialPool: unknown;
  onClose: () => void;
  onSave: () => void;
}

export const CodexPoolModalFooter: React.FC<CodexPoolModalFooterProps> = ({
  initialPool,
  onClose,
  onSave,
}) => (
  <>
    <button
      type="button"
      className="dialog-btn dialog-btn--secondary"
      onClick={onClose}
      data-tooltip="Cancel"
    >
      Cancel
    </button>
    <button
      type="button"
      className="dialog-btn dialog-btn--primary"
      onClick={onSave}
      data-tooltip={initialPool ? "Save pool changes" : "Create new model pool"}
    >
      {initialPool ? "Save" : "Create Pool"}
    </button>
  </>
);

export const CodexPoolFieldError: React.FC<{
  id?: string;
  message?: string;
}> = ({ id, message }) =>
  message ? (
    <span id={id} className="codex-pool-field-error">
      {message}
    </span>
  ) : null;

export const CodexPoolModelValidationMessage: React.FC<{
  validation: CodexPoolModelValidation;
}> = ({ validation }) => (
  <>
    {validation.warning && (
      <div className="codex-model-validation codex-model-validation--warning">
        {Object.values(validation.reasons)[0] ?? "Some members have not confirmed this model."}
      </div>
    )}
    {!validation.canSave && (
      <div className="codex-model-validation codex-model-validation--error">
        {Object.values(validation.reasons)[0] ?? null}
      </div>
    )}
  </>
);
