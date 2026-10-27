import React, { useState, useEffect } from "react";
import { CommonSwitch } from "../common/CommonSwitch";

export interface CodexRegenerateKeyDialogProps {
  isOpen: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (updateClaudeProfiles: boolean) => void;
}

export const CodexRegenerateKeyDialog: React.FC<CodexRegenerateKeyDialogProps> = ({
  isOpen,
  busy,
  onClose,
  onConfirm,
}) => {
  const [updateClaudeProfiles, setUpdateClaudeProfiles] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setUpdateClaudeProfiles(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === "Enter" && !busy) {
        event.preventDefault();
        event.stopPropagation();
        onConfirm(updateClaudeProfiles);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, busy, updateClaudeProfiles, onClose, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" style={{ display: "flex" }} onClick={onClose}>
      <div
        className="dialog-box"
        style={{ maxWidth: "460px", width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">Regenerate Model Routing Key</div>
        <div
          className="dialog-message"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            textAlign: "left",
            gap: "14px",
            width: "100%",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "var(--text-secondary, #94a3b8)",
              fontSize: "12px",
              lineHeight: "1.5",
            }}
          >
            Are you sure you want to regenerate the model routing key? Tools configured manually
            will need the new key to continue accessing the router.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "10px 14px",
              background: "var(--bg-secondary, rgba(255, 255, 255, 0.04))",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
              borderRadius: "6px",
              cursor: "pointer",
              userSelect: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
            onClick={() => setUpdateClaudeProfiles((prev) => !prev)}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-primary, #f1f5f9)",
                fontWeight: 500,
              }}
            >
              Update key in settings.json of all Claude profiles created by QuotaShift
            </span>
            <CommonSwitch
              checked={updateClaudeProfiles}
              onToggle={() => setUpdateClaudeProfiles((prev) => !prev)}
              tooltip={
                updateClaudeProfiles
                  ? "Disable updating Claude profiles"
                  : "Enable updating Claude profiles"
              }
              ariaLabel="Update key in settings.json of all Claude profiles created by QuotaShift"
            />
          </div>
        </div>
        <div className="dialog-buttons">
          <button
            type="button"
            className="dialog-btn dialog-btn--cancel"
            onClick={onClose}
            disabled={busy}
            data-tooltip="Keep the current key"
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn dialog-btn--confirm dialog-btn--danger"
            onClick={() => onConfirm(updateClaudeProfiles)}
            disabled={busy}
            data-tooltip="Generate a new model routing key"
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>
    </div>
  );
};
