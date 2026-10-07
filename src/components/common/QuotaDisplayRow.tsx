import React from "react";
import { ShortcutOverlayIcon } from "./SettingsIcons";
import {
  currentPlatform,
  isTaskbarSupported,
  type DisplayMode,
} from "../../utils/common/display-mode";

import { loadTrackedList } from "../../utils/common/tracked-accounts";

interface QuotaDisplayRowProps {
  displayMode: DisplayMode;
  onDisplayModeChange?: (mode: DisplayMode) => void;
  taskbarSupported?: boolean;
}

const MODE_OPTIONS: Array<{ mode: DisplayMode; label: string; tooltip: string }> = [
  { mode: "none", label: "None", tooltip: "Hide the desktop overlay" },
  { mode: "overlay", label: "Overlay", tooltip: "Floating overlay widget" },
  { mode: "taskbar", label: "Taskbar", tooltip: "Compact strip docked in the taskbar" },
];

/** Quota display selector (None, Overlay, Taskbar) shown in the Appearance tab as Monitored Display Visibility (formerly On Monitored Display). */
export const QuotaDisplayRow: React.FC<QuotaDisplayRowProps> = ({
  displayMode,
  onDisplayModeChange,
  taskbarSupported = isTaskbarSupported(currentPlatform()),
}) => {
  const hasTrackedAccounts = loadTrackedList().length > 0;
  return onDisplayModeChange ? (
    <div
      className="settings-toggle-row settings-toggle-row--segmented"
      aria-label="Monitored Display Visibility"
    >
      <span className="settings-row-icon">
        <ShortcutOverlayIcon />
      </span>
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">Monitored Display Visibility</span>
        <span className="settings-toggle-description">
          Choose where monitored quotas appear: a floating overlay, the taskbar, or nowhere.
        </span>
      </span>
      <div className="settings-segmented-switch" role="group" aria-label="Display Mode">
        {MODE_OPTIONS.map(({ mode, label, tooltip }) => {
          const disabled =
            (mode === "taskbar" && !taskbarSupported) || (!hasTrackedAccounts && mode !== "none");
          const tip =
            !hasTrackedAccounts && mode !== "none"
              ? "Track an account to enable"
              : mode === "taskbar" && !taskbarSupported
                ? "Windows only for now"
                : tooltip;
          return (
            <button
              key={mode}
              type="button"
              className={`settings-segment-btn ${displayMode === mode ? "settings-segment-btn--active" : ""}`}
              aria-pressed={displayMode === mode}
              disabled={disabled}
              onClick={() => onDisplayModeChange(mode)}
              data-tooltip={tip}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;
};
