import React from "react";
import { SettingsSwitchRow } from "./SettingsSwitchRow";
import { useCodexModelRouting } from "../../hooks/codex/useCodexModelRouting";

const CodexModelRoutingIcon: React.FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="12" cy="18" r="2.5" />
    <path d="M6 8.5v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3M12 13.5v2" />
  </svg>
);

export const CodexModelRoutingSetting: React.FC = () => {
  const { codexModelRoutingEnabled, handleToggleCodexModelRouting } = useCodexModelRouting();

  return (
    <SettingsSwitchRow
      icon={<CodexModelRoutingIcon />}
      label="Use Codex Model Routing"
      tooltipLabel="Use Codex Model Routing"
      description="Show model pool routing, account authorization, and Claude connection tools."
      checked={codexModelRoutingEnabled}
      onToggle={handleToggleCodexModelRouting}
    />
  );
};
