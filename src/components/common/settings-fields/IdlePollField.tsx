import React from "react";
import { IdlePollInputs } from "./IdlePollInputs";
import { PollWarning } from "../settings-controls/PollWarning";
import { IdlePollIcon } from "../settings-controls/SettingsIcons";
import type { WarningLevel } from "../settings/settings-helpers";

interface IdlePollFieldProps {
  idleMinutes: number;
  idleSeconds: number;
  idleWarn: WarningLevel;
  maxMinutes: number;
  onMinutesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSecondsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
}

export const IdlePollField: React.FC<IdlePollFieldProps> = ({
  idleMinutes,
  idleSeconds,
  idleWarn,
  maxMinutes,
  onMinutesChange,
  onSecondsChange,
  onCommit,
}) => (
  <div className="settings-field">
    <div className="settings-toggle-row settings-toggle-row--segmented">
      <span className="settings-row-icon">
        <IdlePollIcon />
      </span>
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">Other idle accounts poll rate</span>
        <span className="settings-toggle-description">Recommended: 5–15 min</span>
      </span>
      <IdlePollInputs
        idleMinutes={idleMinutes}
        idleSeconds={idleSeconds}
        warn={Boolean(idleWarn)}
        maxMinutes={maxMinutes}
        onMinutesChange={onMinutesChange}
        onSecondsChange={onSecondsChange}
        onCommit={onCommit}
      />
    </div>
    <PollWarning warning={idleWarn} type="idle" />
  </div>
);
