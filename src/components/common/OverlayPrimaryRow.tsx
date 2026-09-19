import React from "react";
import { ShortcutOverlayIcon } from "./SettingsIcons";

interface OverlayPrimaryRowProps {
  overlayEnabled: boolean;
  onToggleOverlay?: () => void;
  onReset: () => void;
}

export const OverlayPrimaryRow: React.FC<OverlayPrimaryRowProps> = ({
  overlayEnabled,
  onToggleOverlay,
  onReset,
}) => (
  <div className="settings-overlay-primary-row">
    {onToggleOverlay && (
      <button
        type="button"
        className="settings-toggle-row settings-overlay-desktop-toggle"
        onClick={onToggleOverlay}
        aria-label="Desktop Overlay"
        data-tooltip={overlayEnabled ? "Disable desktop overlay" : "Enable desktop overlay"}
      >
        <span className="settings-row-icon">
          <ShortcutOverlayIcon />
        </span>
        <span className="settings-toggle-copy">
          <span className="settings-toggle-label">Desktop overlay</span>
          <span className="settings-toggle-description">
            Floating on-screen widget displaying real-time active quotas.
          </span>
        </span>
        <span
          className={`codex-pool-switch ${overlayEnabled ? "codex-pool-switch--on" : ""}`}
          role="switch"
          aria-checked={overlayEnabled}
        >
          <span className="codex-pool-switch-thumb" />
        </span>
      </button>
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
