import React from "react";

interface CustomDialogProps {
  message: string;
  isConfirm: boolean;
  onClose: (confirmed: boolean) => void;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({ message, isConfirm, onClose }) => {
  return (
    <div className="dialog-overlay" style={{ display: "flex" }}>
      <div className="dialog-box">
        <p className="dialog-message">{message}</p>
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
            className="dialog-btn"
            onClick={() => onClose(true)}
            data-tooltip="Confirm and close dialog"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
