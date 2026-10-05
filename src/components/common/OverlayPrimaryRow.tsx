import React from "react";
import { ShortcutOverlayIcon } from "./SettingsIcons";
import {
  currentPlatform,
  isTaskbarSupported,
  type DisplayMode,
} from "../../utils/common/display-mode";

interface OverlayPrimaryRowProps {
  displayMode: DisplayMode;
  onDisplayModeChange?: (mode: DisplayMode) => void;
  taskbarSupported?: boolean;
  onReset: () => void;
}

const MODE_OPTIONS: Array<{ mode: DisplayMode; label: string; tooltip: string }> = [
  { mode: "none", label: "None", tooltip: "Hide the desktop overlay" },
  { mode: "overlay", label: "Overlay", tooltip: "Floating overlay widget" },
  { mode: "taskbar", label: "Taskbar", tooltip: "Compact strip docked in the taskbar" },
];

export const OverlayPrimaryRow: React.FC<OverlayPrimaryRowProps> = ({
  displayMode,
  onDisplayModeChange,
  taskbarSupported = isTaskbarSupported(currentPlatform()),
  onReset,
}) => (
  <div className="settings-overlay-primary-row">
    {onDisplayModeChange && (
      <div
        className="settings-toggle-row settings-toggle-row--segmented settings-overlay-desktop-toggle"
        aria-label="Desktop Overlay"
      >
        <span className="settings-row-icon">
          <ShortcutOverlayIcon />
        </span>
        <span className="settings-toggle-copy">
          <span className="settings-toggle-label">Desktop overlay</span>
          <span className="settings-toggle-description">
            Show monitored quotas as a floating widget or in the taskbar.
          </span>
        </span>
        <div className="settings-segmented-switch" role="group" aria-label="Display Mode">
          {MODE_OPTIONS.map(({ mode, label, tooltip }) => {
            const disabled = mode === "taskbar" && !taskbarSupported;
            return (
              <button
                key={mode}
                type="button"
                className={`settings-segment-btn ${displayMode === mode ? "settings-segment-btn--active" : ""}`}
                aria-pressed={displayMode === mode}
                disabled={disabled}
                onClick={() => onDisplayModeChange(mode)}
                data-tooltip={disabled ? "Windows only for now" : tooltip}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    )}
    <span className="settings-overlay-primary-divider" aria-hidden="true" />
    <button
      type="button"
      className="settings-reset-btn settings-reset-btn--overlay-inline"
      onClick={onReset}
      data-tooltip="Reset overlay position and scale to defaults"
    >
      Reset Overlay
    </button>
  </div>
);
