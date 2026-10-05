import React, { useState } from "react";
import { SettingsSwitchRow } from "./SettingsSwitchRow";
import { ExperimentalTag } from "./ExperimentalTag";
import { loadRestartOnSwitch, saveRestartOnSwitch } from "../../utils/common/restart-on-switch";

const RestartOnSwitchIcon: React.FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

/** Opt-in restart of running Antigravity/Codex apps when the user switches accounts. */
export const RestartOnSwitchSetting: React.FC = () => {
  const [enabled, setEnabled] = useState(() => loadRestartOnSwitch());

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    saveRestartOnSwitch(next);
  };

  return (
    <SettingsSwitchRow
      icon={<RestartOnSwitchIcon />}
      label={
        <>
          Restart running app on switch <ExperimentalTag />
        </>
      }
      tooltipLabel="restart running app on switch"
      description="Antigravity and Codex only. Restarts the running IDE, desktop app or CLI after switching so the new account applies immediately."
      checked={enabled}
      onToggle={toggle}
    />
  );
};
