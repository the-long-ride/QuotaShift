import React, { useEffect, useState } from "react";
import { useShortcutPreferences } from "../../../hooks/desktop/useShortcutPreferences";
import { MonitoredAccountsIcon } from "./HeaderIcons";
import { OPEN_MONITORED_ACCOUNTS_MODAL_EVENT } from "../../../utils/common/accounts/monitored-accounts-modal";
import {
  TRACKED_IDS_CHANGED_EVENT,
  loadMultiTrackEnabled,
  loadTrackedList,
} from "../../../utils/common/accounts/tracked-accounts";

export const UntrackAllButton: React.FC = () => {
  const shortcuts = useShortcutPreferences();
  const [visible, setVisible] = useState(() => {
    return loadMultiTrackEnabled() && loadTrackedList().length > 0;
  });

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

  const openModal = () => {
    if (loadMultiTrackEnabled() && loadTrackedList().length > 0) {
      window.dispatchEvent(new CustomEvent(OPEN_MONITORED_ACCOUNTS_MODAL_EVENT));
    }
  };

  useEffect(() => {
    window.addEventListener("quotashift:untrack-all-request", openModal);
    return () => window.removeEventListener("quotashift:untrack-all-request", openModal);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="untrack-all-btn"
      data-tooltip="Manage monitored accounts"
      data-shortcut={shortcuts.untrackAll}
      aria-label="Manage monitored accounts"
      onClick={openModal}
    >
      <MonitoredAccountsIcon />
    </button>
  );
};
