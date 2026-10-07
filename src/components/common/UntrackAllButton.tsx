import React, { useEffect, useState } from "react";
import { CustomDialog } from "./CustomDialog";
import { UntrackAllIcon } from "./HeaderIcons";
import {
  TRACKED_IDS_CHANGED_EVENT,
  clearTrackedAccounts,
  loadMultiTrackEnabled,
  loadTrackedList,
} from "../../utils/common/tracked-accounts";
import { clearMonitoredOverlayState } from "../../hooks/app/overlayTrackedExtras";

export const UntrackAllButton: React.FC = () => {
  const [visible, setVisible] = useState(() => {
    return loadMultiTrackEnabled() && loadTrackedList().length > 0;
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      setVisible(loadMultiTrackEnabled() && loadTrackedList().length > 0);
    };
    window.addEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!visible) return null;

  const handleUntrackAll = () => {
    clearTrackedAccounts();
    clearMonitoredOverlayState();
    window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
    setConfirmOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="untrack-all-btn"
        data-tooltip="Untrack all accounts"
        aria-label="Untrack all accounts"
        onClick={() => setConfirmOpen(true)}
      >
        <UntrackAllIcon />
      </button>
      {confirmOpen && (
        <CustomDialog
          title="Untrack All Accounts"
          message="Untrack all monitored accounts from the overlay and taskbar?"
          isConfirm
          confirmText="Untrack All"
          cancelText="Cancel"
          confirmVariant="danger"
          confirmTooltip="Untrack all accounts"
          cancelTooltip="Cancel"
          onClose={(confirmed) => {
            if (confirmed) {
              handleUntrackAll();
            } else {
              setConfirmOpen(false);
            }
          }}
        />
      )}
    </>
  );
};
