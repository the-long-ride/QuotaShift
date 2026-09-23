import React, { useState } from "react";
import { ClaudeResetCreditsIcon } from "./ClaudeResetCreditsIcon";
import { SettingsSwitchRow } from "./SettingsSwitchRow";
import {
  loadClaudeResetCreditsEnabled,
  saveClaudeResetCreditsEnabled,
} from "../../utils/claude/claude-reset-credits";

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
          Show Claude reset count <strong className="settings-experimental">Experimental</strong>
        </>
      }
      description="Shows remaining reset credits on Claude account cards and the overlay. Uses an unofficial, read-only Claude endpoint about every 30 minutes per account; Anthropic may change or restrict it."
      checked={enabled}
      onToggle={toggle}
    />
  );
};
