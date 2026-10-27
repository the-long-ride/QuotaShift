import React from "react";
import { MultiTrackSettings } from "./MultiTrackSettings";

/**
 * Monitoring-tab general toggles.
 * Note: <RestartOnSwitchSetting /> and <ClaudeResetCreditsSetting /> are grouped under their
 * respective subsections (Antigravity & ChatGPT Codex, Claude Code).
 */
export const MonitoringToggles: React.FC = () => (
  <>
    <MultiTrackSettings />
  </>
);
