import React from "react";
import { ClaudeResetCreditsSetting } from "./ClaudeResetCreditsSetting";
import { RestartOnSwitchSetting } from "./RestartOnSwitchSetting";
import { MultiTrackSettings } from "./MultiTrackSettings";

/** Monitoring-tab switches: Claude reset credits, restart on switch, multi-account tracking. */
export const MonitoringToggles: React.FC = () => (
  <>
    <ClaudeResetCreditsSetting />
    <RestartOnSwitchSetting />
    <MultiTrackSettings />
  </>
);
