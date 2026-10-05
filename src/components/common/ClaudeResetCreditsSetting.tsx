import React, { useState } from "react";
import { ClaudeResetCreditsIcon } from "./ClaudeResetCreditsIcon";
import { ExperimentalTag } from "./ExperimentalTag";
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
          Show Claude reset count <ExperimentalTag />
        </>
      }
      description="Shows the remaining reset count badge in the overlay and taskbar; Claude account cards always show it, like Codex. Uses an unofficial, read-only Claude endpoint about every 30 minutes per account; Anthropic may change or restrict it."
      checked={enabled}
      onToggle={toggle}
    />
  );
};
