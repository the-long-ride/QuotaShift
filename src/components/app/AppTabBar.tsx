import React from "react";
import { PlatformBrandIcon } from "../common/icons/PlatformBrandIcon";
import type { PlatformVisibility } from "../../utils/common/ui/platform-visibility";

export interface AppTabBarProps {
  activeTab: "antigravity" | "codex" | "claude";
  setActiveTab: (tab: "antigravity" | "codex" | "claude") => void;
  platformVisibility: PlatformVisibility;
}

export const AppTabBar: React.FC<AppTabBarProps> = ({
  activeTab,
  setActiveTab,
  platformVisibility,
}) => {
  return (
    <div className="tab-bar">
      {platformVisibility.antigravity && (
        <button
          className={`tab-btn ${activeTab === "antigravity" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("antigravity")}
          data-tab="antigravity"
          data-tooltip="Switch to the Antigravity accounts tab"
        >
          <PlatformBrandIcon platform="antigravity" />
          Antigravity
        </button>
      )}
      {platformVisibility.codex && (
        <button
          className={`tab-btn ${activeTab === "codex" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("codex")}
          data-tab="codex"
          data-tooltip="Switch to the ChatGPT Codex accounts tab"
        >
          <PlatformBrandIcon platform="codex" />
          ChatGPT Codex
        </button>
      )}
      {platformVisibility.claude && (
        <button
          className={`tab-btn ${activeTab === "claude" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("claude")}
          data-tab="claude"
          data-tooltip="Switch to the Claude Code local session tab"
        >
          <PlatformBrandIcon platform="claude" />
          Claude Code
        </button>
      )}
    </div>
  );
};
