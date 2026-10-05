import React, { useState } from "react";
import { SettingsSwitchRow } from "./SettingsSwitchRow";
import {
  TRACKED_IDS_CHANGED_EVENT,
  loadMultiTrack,
  loadTrackedIds,
  saveMultiTrack,
  saveTrackedIds,
  trimToSingle,
  type TrackedProvider,
} from "../../utils/common/tracked-accounts";

const PROVIDER_LABELS: Array<[TrackedProvider, string]> = [
  ["antigravity", "Antigravity"],
  ["codex", "Codex"],
  ["claude", "Claude"],
];

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

/** Per-provider opt-in to monitor 1–3 accounts at once in the overlay/taskbar. */
export const MultiTrackSettings: React.FC = () => {
  const [multi, setMulti] = useState(() => loadMultiTrack());

  const toggle = (provider: TrackedProvider) => {
    const next = { ...multi, [provider]: !multi[provider] };
    setMulti(next);
    saveMultiTrack(next);
    if (!next[provider]) {
      saveTrackedIds(trimToSingle(loadTrackedIds(), provider));
      window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
    }
  };

  return (
    <>
      {PROVIDER_LABELS.map(([provider, label]) => (
        <SettingsSwitchRow
          key={provider}
          icon={<MultiTrackIcon />}
          label={`Track multiple ${label} accounts`}
          description="Double-click cards to add or remove up to 3 accounts in the overlay and taskbar."
          checked={multi[provider]}
          onToggle={() => toggle(provider)}
        />
      ))}
    </>
  );
};
