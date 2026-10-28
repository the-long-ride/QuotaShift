import React from "react";
import { OverlayScaleIcon, OverlayResetIcon } from "../settings-controls/SettingsIcons";

interface AdjustmentRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  onReset?: () => void;
}

export const AdjustmentRow: React.FC<AdjustmentRowProps> = ({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  onReset,
}) => (
  <div className="settings-adjustment-row">
    <div className="settings-adjustment-meta settings-toggle-row settings-toggle-row--segmented">
      <span className="settings-row-icon">
        <OverlayScaleIcon />
      </span>
      <div className="settings-toggle-copy">
        <div className="settings-toggle-label settings-adjustment-label">{label}</div>
        <div className="settings-toggle-description settings-adjustment-hint">{hint}</div>
      </div>
      <div className="settings-adjustment-value-wrap">
        {onReset && (
          <button
            type="button"
            className="settings-reset-btn settings-reset-btn--icon"
            onClick={onReset}
            data-tooltip="Reset monitor display"
            aria-label="Reset monitor display"
          >
            <OverlayResetIcon />
          </button>
        )}
        <input
          className="settings-adjustment-number"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <span>{unit}</span>
      </div>
    </div>
    <div className="settings-adjustment-slider-wrap">
      <input
        className="settings-adjustment-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} slider`}
      />
      <div className="settings-adjustment-bounds">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  </div>
);
