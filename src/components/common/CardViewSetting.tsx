import React from "react";
import { CardViewIcon } from "./SettingsIcons";
import { useShortcutPreferences } from "../../hooks/desktop/useShortcutPreferences";

export interface CardViewSettingProps {
  mode: "compact" | "expanded";
  onChange?: (mode: "compact" | "expanded") => void;
}

export const CardViewSetting: React.FC<CardViewSettingProps> = ({ mode, onChange }) => {
  const shortcuts = useShortcutPreferences();
  return (
    <div className="settings-toggle-row settings-toggle-row--segmented">
      <span className="settings-row-icon">
        <CardViewIcon />
      </span>
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">Card view</span>
        <span className="settings-toggle-description">
          Choose compact one-line cards or expanded cards with full quota details.
        </span>
      </span>
      <div className="settings-segmented-switch" role="group" aria-label="Card View Mode">
        <button
          type="button"
          className={`settings-segment-btn ${mode === "compact" ? "settings-segment-btn--active" : ""}`}
          onClick={() => onChange?.("compact")}
          data-tooltip="Switch to compact card view"
          data-shortcut={shortcuts.toggleCardView}
        >
          Compact
        </button>
        <button
          type="button"
          className={`settings-segment-btn ${mode === "expanded" ? "settings-segment-btn--active" : ""}`}
          onClick={() => onChange?.("expanded")}
          data-tooltip="Switch to expanded card view"
          data-shortcut={shortcuts.toggleCardView}
        >
          Expand
        </button>
      </div>
    </div>
  );
};
