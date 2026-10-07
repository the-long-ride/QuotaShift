import React from "react";
import { CardViewSetting } from "./CardViewSetting";
import { PlatformBrandIcon } from "./PlatformBrandIcon";
import { QuotaDisplayRow } from "./QuotaDisplayRow";
import { OverlayAdjustmentGroup } from "./OverlayAdjustmentGroup";
import type { DisplayMode } from "../../utils/common/display-mode";
import type { PlatformId, PlatformVisibility } from "../../utils/common/platform-visibility";
import {
  UI_ADJUSTMENT_DEFAULTS,
  normalizeUiAdjustmentPreferences,
  type UiAdjustmentPreferences,
} from "../../utils/common/ui-adjustment";

const PLATFORMS: Array<{ id: PlatformId; label: string }> = [
  { id: "antigravity", label: "Antigravity" },
  { id: "codex", label: "ChatGPT Codex" },
  { id: "claude", label: "Claude Code" },
];

export interface AppearanceSettingsSectionProps {
  cardLayoutMode: "compact" | "expanded";
  onCardLayoutModeChange?: (mode: "compact" | "expanded") => void;
  platformVisibility: PlatformVisibility;
  onPlatformVisibilityChange: (platform: PlatformId, visible: boolean) => void;
  displayMode?: DisplayMode;
  onDisplayModeChange?: (mode: DisplayMode) => void;
  uiAdjustment: UiAdjustmentPreferences;
  onUiAdjustmentChange: (preferences: UiAdjustmentPreferences) => void;
  onResetOverlay?: () => void;
}

export const AppearanceSettingsSection: React.FC<AppearanceSettingsSectionProps> = ({
  cardLayoutMode,
  onCardLayoutModeChange,
  platformVisibility,
  onPlatformVisibilityChange,
  displayMode = "overlay",
  onDisplayModeChange,
  uiAdjustment,
  onUiAdjustmentChange,
  onResetOverlay,
}) => {
  const updateUi = (patch: Partial<UiAdjustmentPreferences>) =>
    onUiAdjustmentChange(normalizeUiAdjustmentPreferences({ ...uiAdjustment, ...patch }));

  const resetOverlay = () => {
    if (onResetOverlay) {
      onResetOverlay();
      return;
    }
    updateUi({
      overlayScale: UI_ADJUSTMENT_DEFAULTS.overlayScale,
      overlayTheme: UI_ADJUSTMENT_DEFAULTS.overlayTheme,
    });
  };

  return (
    <div className="settings-section">
      <CardViewSetting mode={cardLayoutMode} onChange={onCardLayoutModeChange} />

      <div className="settings-subsection">
        <div className="settings-subsection-title">Monitored Display</div>
        <QuotaDisplayRow displayMode={displayMode} onDisplayModeChange={onDisplayModeChange} />
        <OverlayAdjustmentGroup
          scale={uiAdjustment.overlayScale}
          theme={uiAdjustment.overlayTheme}
          onChange={(val) => updateUi({ overlayScale: val })}
          onThemeChange={(overlayTheme) => updateUi({ overlayTheme })}
          label="Overlay & taskbar tooltip UI scale"
        />
        <div className="settings-overlay-reset-row">
          <button
            type="button"
            className="settings-reset-btn"
            onClick={resetOverlay}
            data-tooltip="Reset overlay position and scale to defaults"
          >
            Reset monitor display
          </button>
        </div>
      </div>
      <div className="settings-subsection">
        <div className="settings-subsection-title">Platform</div>
        <div className="settings-subsection-description">
          Visible platforms refresh quota at the Other idle accounts poll rate. Hidden platforms
          remain eligible for Keep-Alive.
        </div>
        <div className="settings-platform-flow">
          {PLATFORMS.map(({ id, label }) => {
            const checked = platformVisibility[id];
            return (
              <button
                key={id}
                type="button"
                className="settings-platform-card"
                onClick={() => onPlatformVisibilityChange(id, !checked)}
                aria-label={`${checked ? "Hide" : "Show"} ${label}`}
                data-tooltip={`${checked ? "Hide" : "Show"} ${label}`}
              >
                <span className="settings-platform-brand">
                  <PlatformBrandIcon platform={id} />
                  <span>{label}</span>
                </span>
                <span
                  className={`codex-pool-switch ${checked ? "codex-pool-switch--on" : ""}`}
                  role="switch"
                  aria-checked={checked}
                >
                  <span className="codex-pool-switch-thumb" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
