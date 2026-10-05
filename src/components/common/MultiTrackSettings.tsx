import React, { useState } from "react";
import { SettingsSwitchRow } from "./SettingsSwitchRow";
import { ExperimentalTag } from "./ExperimentalTag";
import {
  TRACKED_IDS_CHANGED_EVENT,
  loadMultiTrackEnabled,
  loadTrackedList,
  readPrimaryEntry,
  saveMultiTrackEnabled,
  saveTrackedList,
  trimTrackedList,
} from "../../utils/common/tracked-accounts";

const MultiTrackIcon: React.FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="4" rx="1.5" />
    <rect x="3" y="10" width="18" height="4" rx="1.5" />
    <rect x="3" y="16" width="18" height="4" rx="1.5" />
  </svg>
);

/** Experimental opt-in to monitor up to 3 accounts from any provider in the overlay/taskbar. */
export const MultiTrackSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(() => loadMultiTrackEnabled());

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    saveMultiTrackEnabled(next);
    if (!next) {
      saveTrackedList(trimTrackedList(loadTrackedList(), readPrimaryEntry()));
      window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
    }
  };

  return (
    <SettingsSwitchRow
      icon={<MultiTrackIcon />}
      label={
        <>
          Track multiple accounts <ExperimentalTag />
        </>
      }
      tooltipLabel="multi-account tracking"
      description="Double-click account cards in any tab to add or remove up to 3 accounts, from any provider, in the overlay and taskbar."
      checked={enabled}
      onToggle={toggle}
    />
  );
};
