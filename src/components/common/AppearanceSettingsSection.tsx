import React from "react";
import { CardViewSetting } from "./CardViewSetting";
import { PlatformBrandIcon } from "./PlatformBrandIcon";
import type { PlatformId, PlatformVisibility } from "../../utils/common/platform-visibility";

const PLATFORMS: Array<{ id: PlatformId; label: string }> = [
  { id: "antigravity", label: "Antigravity" },
  { id: "codex", label: "ChatGPT Codex" },
  { id: "claude", label: "Claude Code" },
];

export const AppearanceSettingsSection: React.FC<{
  cardLayoutMode: "compact" | "expanded";
  onCardLayoutModeChange?: (mode: "compact" | "expanded") => void;
  platformVisibility: PlatformVisibility;
  onPlatformVisibilityChange: (platform: PlatformId, visible: boolean) => void;
}> = ({
  cardLayoutMode,
  onCardLayoutModeChange,
  platformVisibility,
  onPlatformVisibilityChange,
}) => (
  <div className="settings-section">
    <div className="settings-section-title">Appearance</div>
    <CardViewSetting mode={cardLayoutMode} onChange={onCardLayoutModeChange} />
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
