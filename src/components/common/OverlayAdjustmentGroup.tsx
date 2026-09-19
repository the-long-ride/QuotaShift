import React from "react";
import { AdjustmentRow } from "./AdjustmentRow";
import { OverlayThemeIcon } from "./SettingsIcons";
import { UI_ADJUSTMENT_LIMITS, type OverlayTheme } from "../../utils/common/ui-adjustment";

interface OverlayAdjustmentGroupProps {
  scale: number;
  theme?: OverlayTheme;
  onChange: (value: number) => void;
  onThemeChange?: (theme: OverlayTheme) => void;
  label?: string;
}

export const OverlayAdjustmentGroup: React.FC<OverlayAdjustmentGroupProps> = ({
  scale,
  theme,
  onChange,
  onThemeChange,
  label = "Overlay UI Scale",
}) => (
  <>
    {theme && onThemeChange && (
      <div className="settings-overlay-theme-row settings-toggle-row settings-toggle-row--segmented">
        <span className="settings-row-icon">
          <OverlayThemeIcon />
        </span>
        <div className="settings-toggle-copy settings-overlay-theme-copy">
          <span className="settings-toggle-label settings-adjustment-label">Overlay theme</span>
          <span className="settings-toggle-description settings-adjustment-hint">
            Mono follows the app window light/dark theme.
          </span>
        </div>
        <div className="settings-segmented-switch" role="group" aria-label="Overlay Theme">
          <button
            type="button"
            className={`settings-segment-btn ${theme === "glassmorphism" ? "settings-segment-btn--active" : ""}`}
            aria-pressed={theme === "glassmorphism"}
            onClick={() => onThemeChange("glassmorphism")}
            data-tooltip="Glassmorphism theme"
          >
            Glassmorphism
          </button>
          <button
            type="button"
            className={`settings-segment-btn ${theme === "mono" ? "settings-segment-btn--active" : ""}`}
            aria-pressed={theme === "mono"}
            onClick={() => onThemeChange("mono")}
            data-tooltip="Mono theme"
          >
            Mono
          </button>
        </div>
      </div>
    )}
    <AdjustmentRow
      label={label}
      hint="Scales the entire overlay and its native window together."
      value={scale}
      min={UI_ADJUSTMENT_LIMITS.overlayScale.min}
      max={UI_ADJUSTMENT_LIMITS.overlayScale.max}
      unit="%"
      onChange={onChange}
    />
  </>
);
