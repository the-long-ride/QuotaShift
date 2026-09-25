import React from "react";

interface AntigravityModalFooterProps {
  activeTab: "browser" | "capture";
  captureBusy: boolean;
  onClose: () => void;
  onCaptureSession: () => void;
}

export const AntigravityModalFooter: React.FC<AntigravityModalFooterProps> = ({
  activeTab,
  captureBusy,
  onClose,
  onCaptureSession,
}) => {
  if (activeTab === "capture") {
    return (
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
          onClick={onCaptureSession}
          data-tooltip="Capture Session"
          disabled={captureBusy}
          aria-busy={captureBusy}
        >
          Capture Session
        </button>
      </>
    );
  }
  return (
    <button
      type="button"
      className="dialog-btn dialog-btn--cancel"
      onClick={onClose}
      data-tooltip="Cancel"
    >
      Cancel
    </button>
  );
};
