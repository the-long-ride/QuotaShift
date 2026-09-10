import React, { useEffect } from "react";

interface CustomDialogProps {
  title?: string;
  message: React.ReactNode;
  isConfirm: boolean;
  confirmText?: string;
  confirmVariant?: "primary" | "danger";
  messageAlign?: "left" | "center";
  onClose: (confirmed: boolean) => void;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  title,
  message,
  isConfirm,
  confirmText = "OK",
  confirmVariant = "primary",
  messageAlign = "center",
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-overlay" style={{ display: "flex" }} onClick={() => onClose(false)}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        {title && <div className="dialog-header">{title}</div>}
        <p className={`dialog-message ${messageAlign === "left" ? "dialog-message--left" : ""}`}>
          {message}
        </p>
        <div className="dialog-buttons">
          {isConfirm && (
            <button
              className="dialog-btn dialog-btn--cancel"
              onClick={() => onClose(false)}
              data-tooltip="Cancel the current action"
            >
              Cancel
            </button>
          )}
          <button
            className={`dialog-btn ${confirmVariant === "danger" ? "dialog-btn--danger" : ""}`}
            onClick={() => onClose(true)}
            data-tooltip={confirmVariant === "danger" ? "Delete and close dialog" : "Confirm and close dialog"}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
