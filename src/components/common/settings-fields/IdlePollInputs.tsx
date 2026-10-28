import React from "react";

interface IdlePollInputsProps {
  idleMinutes: number;
  idleSeconds: number;
  warn: boolean;
  maxMinutes: number;
  onMinutesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSecondsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCommit: () => void;
}

export const IdlePollInputs: React.FC<IdlePollInputsProps> = ({
  idleMinutes,
  idleSeconds,
  warn,
  maxMinutes,
  onMinutesChange,
  onSecondsChange,
  onCommit,
}) => (
  <div className="settings-input-row">
    <input
      type="number"
      className={`settings-number-input settings-number-input--wide ${warn ? "settings-number-input--warn" : ""}`}
      min={0}
      max={maxMinutes}
      value={idleMinutes}
      onChange={onMinutesChange}
      onBlur={onCommit}
      aria-label="Idle poll rate minutes"
    />
    <span className="settings-unit">min</span>
    <input
      type="number"
      className={`settings-number-input settings-number-input--wide ${warn ? "settings-number-input--warn" : ""}`}
      min={0}
      max={59}
      value={idleSeconds}
      onChange={onSecondsChange}
      onBlur={onCommit}
      aria-label="Idle poll rate seconds"
    />
    <span className="settings-unit">sec</span>
  </div>
);
