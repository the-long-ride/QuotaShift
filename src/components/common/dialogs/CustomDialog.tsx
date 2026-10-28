import React, { useEffect } from "react";

interface CustomDialogProps {
  title?: string;
  message: React.ReactNode;
  isConfirm: boolean;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "primary" | "danger";
  onClose: (confirmed: boolean) => void;
  onCancelClick?: () => void;
  confirmTooltip?: string;
  cancelTooltip?: string;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  title,
  message,
  isConfirm,
  confirmText = "OK",
  cancelText = "Cancel",
  confirmVariant = "primary",
  onClose,
  onCancelClick,
  confirmTooltip,
  cancelTooltip,
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="dialog-overlay" style={{ display: "flex" }} onClick={() => onClose(false)}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        {title && <div className="dialog-header">{title}</div>}
        <p className="dialog-message">{message}</p>
        <div className="dialog-buttons">
          {isConfirm && (
            <button
              className="dialog-btn dialog-btn--cancel"
              onClick={() => {
                if (onCancelClick) onCancelClick();
                else onClose(false);
              }}
              data-tooltip={
                cancelTooltip ||
                (cancelText === "Cancel" ? "Cancel the current action" : cancelText)
              }
            >
              {cancelText}
            </button>
          )}
          <button
            className={`dialog-btn ${confirmVariant === "danger" ? "dialog-btn--danger" : ""}`}
            onClick={() => onClose(true)}
            data-tooltip={
              confirmTooltip ||
              (confirmVariant === "danger" ? "Delete and close dialog" : confirmText)
            }
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
