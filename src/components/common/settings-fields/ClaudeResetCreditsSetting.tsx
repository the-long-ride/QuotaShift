import React, { useState } from "react";
import { ClaudeResetCreditsIcon } from "../icons/ClaudeResetCreditsIcon";
import { SettingsSwitchRow } from "../settings-controls/SettingsSwitchRow";
import {
  loadClaudeResetCreditsEnabled,
  saveClaudeResetCreditsEnabled,
} from "../../../utils/claude/claude-reset-credits";

/** Opt-in for the overlay's Claude reset badge. Kept self-contained so SettingsModal stays small. */
export const ClaudeResetCreditsSetting: React.FC = () => {
  const [enabled, setEnabled] = useState(() => loadClaudeResetCreditsEnabled());

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    saveClaudeResetCreditsEnabled(next);
  };

  return (
    <SettingsSwitchRow
      icon={<ClaudeResetCreditsIcon />}
      label={
        <>
          Show Claude reset count
        </>
      }
      description="Enables reset-count fetching and badges in cards, overlay and taskbar. OFF stops all reset-count queries. Uses an unofficial, read-only Claude endpoint about every 30 minutes per account; Anthropic may change or restrict it."
      checked={enabled}
      onToggle={toggle}
    />
  );
};
